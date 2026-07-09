import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Settings:
    # App Settings
    PROJECT_NAME: str = "InsightAI"
    
    # Database Settings
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "postgres")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "postgres")
    
    # Ưu tiên sử dụng DATABASE_URL đầy đủ nếu có (cho Supabase/Production)
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}")
    # Redis Settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Vector DB Settings
    CHROMA_DB_PATH: str = os.getenv("CHROMA_DB_PATH", "./chroma_db")

    # Neo4j Graph DB Settings
    NEO4J_URI: str = os.getenv("NEO4J_URI", "")
    NEO4J_USERNAME: str = os.getenv("NEO4J_USERNAME", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "")

    # Milvus Settings
    # Milvus Lite (local file): để URI dạng "./milvus.db" (mặc định)
    # Milvus Standalone/Cloud: để URI dạng "http://localhost:19530" hoặc "https://<endpoint>"
    MILVUS_URI: str = os.getenv("MILVUS_URI", "./milvus.db")
    # MILVUS_TOKEN chỉ cần khi dùng Zilliz Cloud hoặc Milvus có auth
    MILVUS_TOKEN: str = os.getenv("MILVUS_TOKEN", "")
    MILVUS_COLLECTION: str = os.getenv("MILVUS_COLLECTION", "insight_default")
    # Feature flag: False = Dual-write (ghi cả Chroma+Milvus, đọc từ Chroma)
    #               True  = Milvus làm primary (ghi+đọc từ Milvus, Chroma dự phòng)
    USE_MILVUS_FOR_SEARCH: bool = os.getenv("USE_MILVUS_FOR_SEARCH", "false").lower() == "true"
    
    # AI Settings
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    AZURE_SPEECH_KEY: str = os.getenv("AZURE_SPEECH_KEY", "")
    AZURE_SPEECH_REGION: str = os.getenv("AZURE_SPEECH_REGION", "")
    
    # Auth Settings
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Media Processing Settings
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", "ffmpeg")
    FFPROBE_PATH: str = os.getenv("FFPROBE_PATH", "ffprobe")

    # Thư mục lưu trữ file (Demo mode) - đặt trong backend/app/data
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

settings = Settings()
