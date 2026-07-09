"""
Milvus Adapter — hỗ trợ cả 3 chế độ:
  - Milvus Lite  : MILVUS_URI=./milvus.db      (local file, không cần Docker)
  - Standalone   : MILVUS_URI=http://localhost:19530
  - Zilliz Cloud : MILVUS_URI=https://xxx...   + MILVUS_TOKEN=<api-key>
Collection được tự động tạo khi khởi động nếu chưa tồn tại.
"""
from pymilvus import MilvusClient, DataType
from app.core.config import settings

# Phải khớp với model embedding: text-embedding-3-small → 1536 dims
EMBEDDING_DIM = 1536
# Milvus VARCHAR tối đa 65535 ký tự; để lề an toàn
_CONTENT_MAX = 65_000


class MilvusAdapter:
    def __init__(self):
        # Mặc định dùng tên mới cho Phase 1 để tránh xung đột dữ liệu cũ
        self._collection = settings.MILVUS_COLLECTION or "insight_agentic"
        self.client: MilvusClient | None = None
        
        if not settings.USE_MILVUS_FOR_SEARCH:
            print("[MILVUS] ⚠ Milvus is disabled via USE_MILVUS_FOR_SEARCH=false. Bypassing connection.")
            return
        try:
            kwargs: dict = {"uri": settings.MILVUS_URI}
            if settings.MILVUS_TOKEN:
                kwargs["token"] = settings.MILVUS_TOKEN
            self.client = MilvusClient(**kwargs)
            self._ensure_collection()
            print(
                f"[MILVUS] ✅ Kết nối thành công → {settings.MILVUS_URI} "
                f"| collection: {self._collection}"
            )
        except Exception as e:
            self.client = None
            print(f"[MILVUS] ❌ Không thể khởi tạo: {e}")
            print("[MILVUS] ⚠ Hệ thống vẫn chạy bình thường với ChromaDB.")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _ensure_collection(self) -> None:
        """Tạo collection với schema nếu chưa tồn tại.
        Nếu collection tồn tại nhưng chưa bật dynamic_field (schema cũ)
        và còn rỗng → tự động drop + recreate để hỗ trợ metadata.
        """
        if self.client.has_collection(self._collection):
            desc = self.client.describe_collection(self._collection)
            # Kiểm tra cả dynamic_field và sự tồn tại của sparse_vector
            has_dynamic = desc.get("enable_dynamic_field", False)
            fields = [f.get("name") for f in desc.get("fields", [])]
            has_sparse = "sparse_vector" in fields
            
            if has_dynamic and has_sparse:
                return  # Schema đã đúng chuẩn Hybrid, giữ nguyên

            # Nếu thiếu trường sparse_vector (Schema cũ): kiểm tra xem có dữ liệu chưa
            stats = self.client.get_collection_stats(self._collection)
            row_count = int(stats.get("row_count", 1))
            if row_count == 0:
                self.client.drop_collection(self._collection)
                print(f"[MILVUS] ♻ Drop & recreate '{self._collection}' (Nâng cấp lên Hybrid Schema)")
            else:
                print(
                    f"[MILVUS] ⚠ Collection '{self._collection}' có {row_count} records "
                    f"nhưng thiếu trường sparse_vector. Vui lòng đổi tên collection trong .env "
                    f"để tránh mất dữ liệu hoặc lỗi."
                )
                return

        schema = MilvusClient.create_schema(
            auto_id=False,
            enable_dynamic_field=True,
        )
        schema.add_field("id",            DataType.VARCHAR,      max_length=256,  is_primary=True)
        schema.add_field("vector",        DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM)
        # Thêm trường Sparse Vector cho BM25 (Hybrid Search)
        schema.add_field("sparse_vector", DataType.SPARSE_FLOAT_VECTOR)
        schema.add_field("item_id",       DataType.VARCHAR,      max_length=256)
        schema.add_field("chunk_index",   DataType.INT64)
        schema.add_field("content",       DataType.VARCHAR,      max_length=65535)

        index_params = MilvusClient.prepare_index_params()
        # Index cho Dense Vector (Ý nghĩa)
        index_params.add_index(
            field_name="vector",
            metric_type="COSINE",
            index_type="FLAT",
        )
        # Index cho Sparse Vector (Từ khóa)
        index_params.add_index(
            field_name="sparse_vector",
            metric_type="IP", # Inner Product cho Sparse
            index_type="SPARSE_INVERTED_INDEX",
            params={"drop_ratio_build": 0.2}
        )

        self.client.create_collection(
            collection_name=self._collection,
            schema=schema,
            index_params=index_params,
        )
        print(f"[MILVUS] ✅ Đã tạo collection Hybrid: {self._collection}")

    # ------------------------------------------------------------------
    # Public API (được gọi từ SearchService)
    # ------------------------------------------------------------------
    @property
    def collection_name(self) -> str:
        return self._collection

    @property
    def available(self) -> bool:
        return self.client is not None


# Singleton — import từ đây ở bất kỳ module nào cần
milvus_adapter = MilvusAdapter()
