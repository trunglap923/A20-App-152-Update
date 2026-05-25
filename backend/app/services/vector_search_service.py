from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.ai.providers import get_embedding_provider
from app.infrastructure.vector_db.chroma import vector_db
from app.db.session import engine
from sqlalchemy.orm import Session
from app.models.chunks import ItemChunk
from app.models.embeddings import Embedding
from app.core.config import settings
import uuid
import re
import asyncio
import time
import json
from pymilvus.model.sparse import BM25EmbeddingFunction
from pymilvus import AnnSearchRequest, WeightedRanker

# Milvus: import an toàn, không crash nếu chưa cấu hình
try:
    from app.infrastructure.vector_db.milvus_db import milvus_adapter as _milvus
    _MILVUS_OK = _milvus.available
except Exception as _mex:
    _milvus = None  # type: ignore
    _MILVUS_OK = False
    print(f"[MILVUS] ⚠ Import lỗi: {_mex}")

class ChromaEmbeddingAdapter:
    """Adapter để LangChain Embeddings tương thích với ChromaDB interface"""
    def __init__(self, langchain_embeddings):
        self.langchain_embeddings = langchain_embeddings
    def __call__(self, input):
        # Chroma logic: always returns List[List[float]]
        if isinstance(input, str):
            return [self.langchain_embeddings.embed_query(input)]
        return self.langchain_embeddings.embed_documents(input)
    
    def embed_query(self, input):
        if isinstance(input, list):
            return self.langchain_embeddings.embed_documents(input)
        return self.langchain_embeddings.embed_query(input)
        
    def embed_documents(self, input):
        return self.langchain_embeddings.embed_documents(input)

    def name(self):
        return "langchain_openai_adapter"

class SearchService:
    def __init__(self, collection_name: str = "insight_agentic"):
        self.embeddings = get_embedding_provider()
        # Khởi tạo BM25 cho Hybrid Search (Sparse Vector)
        # Sử dụng tokenizer mặc định của Milvus model
        self.bm25_ef = BM25EmbeddingFunction()
        
        # Gắn trực tiếp embedding function vào collection để Chroma không load model mặc định
        self.collection = vector_db.get_collection(
            collection_name, 
            embedding_function=ChromaEmbeddingAdapter(self.embeddings)
        )

    async def index_document(self, item_id: str, chunks: list[str], chunk_metadatas: list[dict] = None, metadata: dict = None):
        """
        Lưu trữ các chunks đã được băm sẵn vào Vector DB + PostgreSQL.
        """
        if not metadata:
            metadata = {}
            
        if not chunks:
            print(f"⚠ Warning: Không có chunks nào để index cho item {item_id}")
            return

        # Nếu không có metadata cho từng chunk, ta tạo metadata chung
        if not chunk_metadatas:
            chunk_metadatas = [{"item_id": item_id, "chunk_idx": i, **metadata} for i in range(len(chunks))]
        else:
            # Merge metadata chung vào metadata riêng
            for i in range(len(chunk_metadatas)):
                chunk_metadatas[i].update({"item_id": item_id, "chunk_idx": i, **metadata})
        
        # Nhúng (Embed) — chạy trong thread pool để không block event loop
        vectors = await asyncio.to_thread(self.embeddings.embed_documents, chunks)
        
        ids = [f"{item_id}_{i}" for i in range(len(chunks))]

        # Lưu trữ vào Chroma — chạy trong thread pool
        await asyncio.to_thread(
            self.collection.add,
            embeddings=vectors,
            documents=chunks,
            metadatas=chunk_metadatas,
            ids=ids
        )

        # [DUAL-WRITE] Lưu song song vào Milvus (Hybrid Support)
        if _MILVUS_OK and _milvus:
            try:
                # Tính toán Sparse Vectors (BM25)
                # BM25EmbeddingFunction.encode_documents trả về một mảng các sparse vectors
                sparse_vectors = await asyncio.to_thread(self.bm25_ef.encode_documents, chunks)
                
                # Các trường đã có trường riêng trong schema → không cần lưu lại qua dynamic field
                _reserved_keys = {"id", "vector", "sparse_vector", "item_id", "chunk_index", "content"}

                milvus_docs = []
                for i in range(len(chunks)):
                    # Chuyển đổi sang CSR format để đảm bảo có thuộc tính .indices
                    row = sparse_vectors[i].tocsr()
                    sparse_dict = {int(k): float(v) for k, v in zip(row.indices, row.data)}
                    
                    doc = {
                        "id":            ids[i],
                        "vector":        vectors[i],
                        "sparse_vector": sparse_dict,
                        "item_id":       item_id,
                        "chunk_index":   i,
                        "content":       chunks[i][:65_000],
                    }
                    # Merge metadata
                    if chunk_metadatas and i < len(chunk_metadatas):
                        for k, v in chunk_metadatas[i].items():
                            if k not in _reserved_keys and isinstance(v, (str, int, float, bool)):
                                doc[k] = v
                    milvus_docs.append(doc)

                await asyncio.to_thread(
                    _milvus.client.insert,
                    _milvus.collection_name,
                    milvus_docs,
                )
                print(f"[MILVUS-HYBRID] ✅ Indexed: {len(chunks)} chunks → item {item_id}")
            except Exception as _me:
                print(f"[MILVUS-HYBRID] ⚠ Lỗi lưu Hybrid (không ảnh hưởng Chroma): {_me}")
        
        # Lưu vào PostgreSQL
        from app.models.knowledge_items import KnowledgeItem
        with Session(engine) as session:
            # Kiểm tra sự tồn tại của KnowledgeItem
            ki = session.query(KnowledgeItem).filter(KnowledgeItem.id == uuid.UUID(str(item_id))).first()
            if not ki:
                print(f"[SEARCH-SERVICE] ⚠ Item {item_id} không tồn tại. Hủy lưu chunks vào Postgres.")
                return

            for i, chunk_text in enumerate(chunks):
                chunk_id = uuid.uuid4()
                new_chunk = ItemChunk(
                    id=chunk_id,
                    item_id=uuid.UUID(item_id),
                    content=chunk_text,
                    chunk_index=i,
                    token_count=len(chunk_text.split()),
                    chunk_metadata=chunk_metadatas[i]
                )
                session.add(new_chunk)

                new_emb = Embedding(
                    id=uuid.uuid4(),
                    chunk_id=chunk_id,
                    embedding=vectors[i],  # plain list — psycopg2 đã được register_vector
                    model="text-embedding-3-small"
                )
                session.add(new_emb)
            session.commit()

        print(f"✅ Đã index {len(chunks)} chunks cho item {item_id} vào Postgres và Chroma")

    def _normalize_text(self, text: str) -> str:
        text = (text or "").strip()
        return re.sub(r"\s+", " ", text)

    def _pack_context(
        self,
        docs: list[str],
        max_docs: int = 3,
        max_chunk_chars: int = 700,
        max_context_chars: int = 2200,
    ) -> list[str]:
        """
        Đóng gói context với ngân sách ký tự nhỏ để giảm token:
        - Dedup nội dung
        - Cắt từng chunk
        - Dừng khi chạm budget tổng
        """
        packed: list[str] = []
        seen: set[str] = set()
        current_total = 0

        for raw in docs:
            normalized = self._normalize_text(raw)
            if not normalized:
                continue

            signature = normalized[:160]
            if signature in seen:
                continue
            seen.add(signature)

            if len(normalized) > max_chunk_chars:
                normalized = normalized[:max_chunk_chars].rstrip() + " ..."

            next_total = current_total + len(normalized)
            if next_total > max_context_chars:
                break

            packed.append(normalized)
            current_total = next_total

            if len(packed) >= max_docs:
                break

        return packed

    async def search_chunks(
        self,
        query: str,
        top_k: int = 3,
        item_id: str = None,
        max_context_chars: int = 2200,
        max_chunk_chars: int = 700,
    ) -> list[str]:
        """
        Tìm kiếm semantic tối ưu token:
        - Lấy candidate từ vector DB
        - Nén context theo budget ký tự
        """
        candidate_k = max(top_k * 3, top_k)

        # 0. Nếu feature flag bật → dùng Milvus làm primary (Hybrid Search)
        if settings.USE_MILVUS_FOR_SEARCH and _MILVUS_OK and _milvus:
            try:
                # 1. Tính toán cả 2 vector cho câu hỏi
                dense_vec = await asyncio.to_thread(self.embeddings.embed_query, query)
                sparse_vec = await asyncio.to_thread(self.bm25_ef.encode_queries, [query])
                
                search_filter = f'item_id == "{item_id}"' if item_id else ""
                
                # 2. Tạo các Request tìm kiếm song song
                # Chuyển đổi sang CSR format để đảm bảo có thuộc tính .indices
                row_q = sparse_vec[0].tocsr()
                sparse_dict_q = {int(k): float(v) for k, v in zip(row_q.indices, row_q.data)}

                # Tìm kiếm theo ý nghĩa (Dense)
                req_dense = AnnSearchRequest(
                    data=[dense_vec],
                    anns_field="vector",
                    param={"metric_type": "COSINE", "params": {}},
                    limit=candidate_k,
                    expr=search_filter if search_filter else None
                )
                # Tìm kiếm theo từ khóa (Sparse)
                req_sparse = AnnSearchRequest(
                    data=[sparse_dict_q],
                    anns_field="sparse_vector",
                    param={"metric_type": "IP", "params": {}},
                    limit=candidate_k,
                    expr=search_filter if search_filter else None
                )

                # 3. Thực hiện Hybrid Search với WeightedRanker
                # Tỷ lệ 0.7 cho ý nghĩa (Dense) và 0.3 cho từ khóa (Sparse)
                milvus_results = await asyncio.to_thread(
                    _milvus.client.hybrid_search,
                    _milvus.collection_name,
                    reqs=[req_dense, req_sparse],
                    ranker=WeightedRanker(0.7, 0.3),
                    limit=candidate_k,
                    output_fields=["content", "chunk_index", "item_id"]
                )
                
                hits = milvus_results[0] if milvus_results else []

                # ── Log chi tiết các chunk tìm được ──
                print(f"[MILVUS-HYBRID] 🔍 Query: \"{query[:200]}...\"")
                print(f"[MILVUS-HYBRID] 📦 Tìm được {len(hits)} candidates (Hybrid)")
                for _i, _hit in enumerate(hits[:5], 1):
                    _e    = _hit.get("entity", {})
                    _score = _hit.get("distance", 0)
                    _preview = (_e.get("content") or "")[:120].replace("\n", " ")
                    print(
                        f"[MILVUS-HYBRID]   [{_i}] score={_score:.4f} | "
                        f"chunk={_e.get('chunk_index','?')} | "
                        f"preview: {_preview}..."
                    )

                docs = [hit["entity"]["content"] for hit in hits]
                packed = self._pack_context(
                    docs,
                    max_docs=top_k,
                    max_chunk_chars=max_chunk_chars,
                    max_context_chars=max_context_chars,
                )
                if packed:
                    return packed
            except Exception as _me:
                import traceback
                print(f"[MILVUS-HYBRID] ⚠ Hybrid Search lỗi: {traceback.format_exc()}")
                print(f"[MILVUS-HYBRID] ⚠ Fallback về Chroma...")

        # 1. Ưu tiên Chroma vector DB
        try:
            kwargs = {
                "query_texts": [query],
                "n_results": candidate_k,
            }
            if item_id:
                kwargs["where"] = {"item_id": item_id}

            results = await asyncio.to_thread(self.collection.query, **kwargs)
            docs = results.get("documents", [[]])[0] if results else []
            packed = self._pack_context(
                docs,
                max_docs=top_k,
                max_chunk_chars=max_chunk_chars,
                max_context_chars=max_context_chars,
            )
            if packed:
                return packed
        except Exception as e:
            print(f"⚠ Chroma Search Error (item_id={item_id}): {e}")

        # 2. Fallback: pgvector trên PostgreSQL
        query_vector = await asyncio.to_thread(self.embeddings.embed_query, query)

        with Session(engine) as session:
            from sqlalchemy import select

            query_obj = session.query(ItemChunk.content).join(Embedding, ItemChunk.id == Embedding.chunk_id)

            if item_id:
                query_obj = query_obj.filter(ItemChunk.item_id == uuid.UUID(item_id))

            results = (
                query_obj.order_by(Embedding.embedding.cosine_distance(query_vector))
                .limit(candidate_k)
                .all()
            )

            docs = [r[0] for r in results]
            return self._pack_context(
                docs,
                max_docs=top_k,
                max_chunk_chars=max_chunk_chars,
                max_context_chars=max_context_chars,
            )

    async def delete_item(self, item_id: str):
        """Xoá toàn bộ vectors khỏi ChromaDB và Milvus (chạy song song)."""

        async def _del_chroma():
            _t = time.perf_counter()
            try:
                existing = await asyncio.to_thread(
                    self.collection.get, where={"item_id": item_id}
                )
                ids_to_delete = existing.get("ids", [])
                if ids_to_delete:
                    await asyncio.to_thread(self.collection.delete, ids=ids_to_delete)
                    print(f"[VECTOR-DB] ✅ ChromaDB xong ({time.perf_counter()-_t:.2f}s): xoá {len(ids_to_delete)} vectors")
                else:
                    print(f"[VECTOR-DB] ChromaDB: không tìm thấy vector ({time.perf_counter()-_t:.2f}s)")
            except Exception as e:
                print(f"[VECTOR-DB] Lỗi ChromaDB ({time.perf_counter()-_t:.2f}s): {e}")

        async def _del_milvus():
            if not (_MILVUS_OK and _milvus):
                return
            _t = time.perf_counter()
            try:
                await asyncio.to_thread(
                    _milvus.client.delete,
                    _milvus.collection_name,
                    filter=f'item_id == "{item_id}"',
                )
                print(f"[MILVUS] ✅ Milvus xong ({time.perf_counter()-_t:.2f}s): đã xóa vectors item {item_id}")
            except Exception as _me:
                print(f"[MILVUS] ⚠ Xóa Milvus lỗi ({time.perf_counter()-_t:.2f}s): {_me}")

        # Chạy song song — giảm thời gian từ (T_chroma + T_milvus) → max(T_chroma, T_milvus)
        await asyncio.gather(_del_chroma(), _del_milvus())

    async def update_item_metadata(self, item_id: str, new_metadata: dict):
        """Cập nhật metadata cho tất cả chunks của item trong cả ChromaDB và PostgreSQL."""
        try:
            # 1. Cập nhật ChromaDB
            existing = await asyncio.to_thread(
                self.collection.get,
                where={"item_id": item_id}
            )
            ids = existing.get("ids", [])
            metadatas = existing.get("metadatas", [])
            
            if ids:
                updated_metadatas = []
                for meta in metadatas:
                    meta.update(new_metadata)
                    updated_metadatas.append(meta)

                await asyncio.to_thread(
                    self.collection.update,
                    ids=ids,
                    metadatas=updated_metadatas
                )
                print(f"[VECTOR-DB] Đã cập nhật metadata cho {len(ids)} vectors của item {item_id} trong Chroma")

            # 2. Cập nhật PostgreSQL (ItemChunk metadata)
            with Session(engine) as session:
                from sqlalchemy import text
                # Cập nhật trực tiếp bằng SQL cho nhanh hoặc qua ORM
                chunks = session.query(ItemChunk).filter(ItemChunk.item_id == uuid.UUID(item_id)).all()
                for c in chunks:
                    current_meta = dict(c.chunk_metadata) if c.chunk_metadata else {}
                    current_meta.update(new_metadata)
                    c.chunk_metadata = current_meta
                session.commit()
                print(f"[SQL-DB] Đã cập nhật metadata cho các chunks của item {item_id} trong Postgres")
                
        except Exception as e:
            print(f"[SEARCH-SERVICE] Lỗi khi cập nhật metadata cho item {item_id}: {e}")

search_service = SearchService()
