from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.db.base import Base  # noqa: F401 — Single source of truth

# Đăng ký pgvector adapter globaly với psycopg2
# Cần gọi trước khi tạo engine để TOÀN BỘ connection pool nhận được adapter
try:
    import psycopg2
    from pgvector.psycopg2 import register_vector
    register_vector(psycopg2)  # Global registration — áp dụng cho mọi kết nối
except (ImportError, Exception):
    pass  # pgvector chưa cài — vector search sẽ không hoạt động

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=30,          # Tăng lên 30 kết nối sẵn sàng (hỗ trợ pipeline song song + multi-user)
    max_overflow=20,       # Cho phép vượt mức thêm 20 kết nối khi cần (tổng tối đa: 50)
    pool_pre_ping=True     # Kiểm tra kết nối trước khi dùng để tránh lỗi "connection lost"
)

# Bổ sung: cũng đăng ký trên mỗi connection mới để chắc chắn
try:
    from pgvector.psycopg2 import register_vector
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_conn, connection_record):
        register_vector(dbapi_conn)
except (ImportError, Exception):
    pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
