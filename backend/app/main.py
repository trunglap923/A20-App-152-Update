import uvicorn
import warnings
# Ẩn các cảnh báo Pydantic v2 không cần thiết (xảy ra khi LangChain/LangGraph serialize state)
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import items
from .api.routes import admin
from .api.routes import chat
from .api.routes import slides
from .api.routes import payment
from .api.routes import user
from .db.base import Base
from .db.session import engine
from .core.config import settings

# Import tất cả models để SQLAlchemy metadata nhận diện khi create_all()
from . import models  # noqa: F401 — registers all models with Base.metadata

from contextlib import asynccontextmanager
from app.core.logging import logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Khởi tạo DB metadata (Đã chuyển sang Alembic, nên bỏ create_all)
    # 2. Cleanup stale jobs
    await cleanup_stale_jobs()
    
    # 3. Cleanup old live_ dirs
    import anyio
    await anyio.to_thread.run_sync(cleanup_old_live_dirs)
    
    logger.info("InsightAI Backend is ready.")
    yield
    # Shutdown logic (nếu có)
    logger.info("InsightAI Backend shutting down.")

app = FastAPI(
    title="InsightAI API",
    description="Backend phục vụ trích xuất tri thức thông minh từ PDF, Youtube, và Voice.",
    version="1.0.0",
    lifespan=lifespan
)

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ----------------- PROMETHEUS METRICS -----------------
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
# ------------------------------------------------------

# ----------------- SECURITY: MASKING TOKEN LOGS -----------------
import logging
import re

class MaskTokenFilter(logging.Filter):
    """
    Che mờ (mask) JWT token trên URL Query String của Uvicorn Access Log
    để tránh bị lộ trên file log của server.
    """
    def filter(self, record):
        if hasattr(record, 'args') and isinstance(record.args, tuple):
            new_args = []
            for arg in record.args:
                if isinstance(arg, str) and "token=" in arg:
                    # Thay thế chuỗi token=... thành token=***MASKED***
                    arg = re.sub(r'token=[^&\s]+', 'token=***MASKED***', arg)
                new_args.append(arg)
            record.args = tuple(new_args)
        return True

# Gắn filter này vào logger "uvicorn.access" của FastAPI
logging.getLogger("uvicorn.access").addFilter(MaskTokenFilter())
# ----------------------------------------------------------------

# Cấu hình CORS - Cho phép Next.js Frontend truy cập
# Lưu ý: Không dùng ["*"] khi allow_credentials=True vì trình duyệt sẽ chặn
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://a20-app-152.vercel.app", # Thay bằng domain Vercel thật của bạn
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600, # Cache preflight requests for 10 minutes to reduce OPTIONS log noise
)

# Đăng ký Routes
app.include_router(items.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(slides.router, prefix="/api")
app.include_router(payment.router, prefix="/api")
app.include_router(user.router, prefix="/api")

import os
from fastapi.staticfiles import StaticFiles

# Mount thư mục data dưới dạng StaticFiles để Frontend có thể lấy file video/audio
data_dir = settings.UPLOAD_DIR
os.makedirs(data_dir, exist_ok=True)
print(f"[SYSTEM] Static files mounted at: {data_dir}")
app.mount("/data", StaticFiles(directory=data_dir), name="data")

async def cleanup_stale_jobs():
    """Dọn dẹp triệt để các task bị kẹt do server crash khi đang xử lý."""
    from .db.session import SessionLocal
    from .models.knowledge_items import KnowledgeItem
    from .utils.cleanup import delete_item_completely
    
    db = SessionLocal()
    try:
        # Tìm các item bị kẹt
        stale_items = db.query(KnowledgeItem).filter(
            KnowledgeItem.status.in_(['running', 'pending'])
        ).all()
        
        if stale_items:
            count = len(stale_items)
            print(f"[CLEANUP] Phát hiện {count} tài liệu bị kẹt do server crash. Đang dọn dẹp triệt để...")
            for item in stale_items:
                # Lưu lại ID và URL trước khi xóa trong DB
                item_id = str(item.id)
                source_url = item.source_url
                # Gọi hàm dọn dẹp tổng thể (Async)
                await delete_item_completely(item_id, source_url)
            print(f"[CLEANUP] Đã hoàn tất dọn dẹp {count} tài liệu.")
    except Exception as e:
        print(f"[CLEANUP-ERROR] Lỗi hệ thống khi startup cleanup: {e}")
    finally:
        db.close()
        
        
# Dọn dẹp thư mục live_ cũ bị bỏ hoang (> 24h) không block I/O
def cleanup_old_live_dirs():
    import shutil
    import time
    import os
    from .core.config import settings
    data_dir = settings.UPLOAD_DIR
    if os.path.exists(data_dir):
        now = time.time()
        for d in os.listdir(data_dir):
            if d.startswith("live_"):
                dir_path = os.path.join(data_dir, d)
                if os.path.isdir(dir_path):
                    try:
                        # Xóa nếu thư mục tạo quá 24h (86400s)
                        if now - os.path.getmtime(dir_path) > 86400:
                            shutil.rmtree(dir_path)
                            logger.info(f"Đã xóa thư mục ghi âm bỏ hoang: {d}")
                    except Exception as e:
                        logger.error(f"Không thể xóa {d}: {e}")

@app.get("/")
def read_root():
    return {"message": "Welcome to InsightAI API. Visit /docs for Swagger UI."}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)