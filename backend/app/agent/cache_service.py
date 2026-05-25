import os
from pymilvus import MilvusClient, DataType
from app.ai.providers import get_embedding_provider

CACHE_COLLECTION_NAME = "insight_chat_cache"
SIMILARITY_THRESHOLD = 0.95 # Độ giống nhau > 95% thì mới dùng lại Cache

class SemanticCache:
    def __init__(self):
        self.client = None
        self.embeddings = get_embedding_provider() # Mặc định dùng OpenAI text-embedding-3-small
        self._init_collection()
        
    def _init_collection(self):
        """Khởi tạo Collection trên Milvus bằng API hiện đại MilvusClient"""
        uri = os.getenv("MILVUS_URI", "http://localhost:19530")
        token = os.getenv("MILVUS_TOKEN", "")
        self.client = MilvusClient(uri=uri, token=token)
            
        if not self.client.has_collection(collection_name=CACHE_COLLECTION_NAME):
            schema = MilvusClient.create_schema(auto_id=True, enable_dynamic_field=False)
            schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
            schema.add_field(field_name="item_id", datatype=DataType.VARCHAR, max_length=100)
            schema.add_field(field_name="question", datatype=DataType.VARCHAR, max_length=2000)
            schema.add_field(field_name="answer", datatype=DataType.VARCHAR, max_length=65535)
            schema.add_field(field_name="embedding", datatype=DataType.FLOAT_VECTOR, dim=1536)
            
            index_params = self.client.prepare_index_params()
            index_params.add_index(
                field_name="embedding",
                metric_type="COSINE",
                index_type="HNSW",
                params={"M": 8, "efConstruction": 64}
            )
            
            self.client.create_collection(
                collection_name=CACHE_COLLECTION_NAME,
                schema=schema,
                index_params=index_params
            )
            print(f"📦 [CACHE] Đã tạo Milvus Collection: {CACHE_COLLECTION_NAME}")

    async def get_cached_answer(self, question: str, item_id: str) -> str | None:
        """Tìm câu trả lời đã lưu trong Cache dựa trên ý nghĩa câu hỏi"""
        try:
            # 1. Mã hóa câu hỏi thành Vector
            query_vector = await self.embeddings.aembed_query(question)
            
            # 2. Tìm kiếm trong Milvus
            results = self.client.search(
                collection_name=CACHE_COLLECTION_NAME,
                data=[query_vector],
                limit=1,
                filter=f"item_id == '{item_id}'", # Chỉ tìm trong cùng 1 tài liệu
                output_fields=["answer", "question"]
            )
            
            if results and len(results[0]) > 0:
                hit = results[0][0]
                score = hit.get('distance', 0)
                if score >= SIMILARITY_THRESHOLD:
                    entity = hit.get('entity', {})
                    print(f"⚡ [CACHE HIT] Đã tìm thấy câu hỏi tương tự ({score:.3f}): '{entity.get('question')}'")
                    return entity.get('answer')
                    
            print("⏳ [CACHE MISS] Không có kết quả nào phù hợp. Chuyển sang LLM...")
            return None
            
        except Exception as e:
            print(f"⚠ [CACHE ERROR] Lỗi khi đọc Cache: {e}")
            return None

    async def save_to_cache(self, question: str, answer: str, item_id: str):
        """Lưu cặp Câu hỏi - Trả lời mới vào Cache"""
        try:
            query_vector = await self.embeddings.aembed_query(question)
            
            data = [{
                "item_id": item_id,
                "question": question,
                "answer": answer,
                "embedding": query_vector
            }]
            self.client.insert(collection_name=CACHE_COLLECTION_NAME, data=data)
            print("💾 [CACHE SAVE] Đã lưu câu trả lời vào Milvus Semantic Cache.")
        except Exception as e:
            print(f"⚠ [CACHE ERROR] Lỗi khi lưu Cache: {e}")

semantic_cache = SemanticCache()
