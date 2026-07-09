import os
import ssl
from celery import Celery
from app.core.config import settings

# Khởi tạo Celery App
celery_app = Celery(
    "insightai_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=['app.workers.enrichment_pipeline']
)

# Cấu hình tối ưu cho AI Tasks (thường chạy lâu)
celery_config = {
    "task_serializer": "json",
    "accept_content": ["json"],
    "result_serializer": "json",
    "timezone": "Asia/Ho_Chi_Minh",
    "enable_utc": True,
    "task_acks_late": True,
    "worker_prefetch_multiplier": 1,
    "task_time_limit": 3600,
}

# Nếu dùng Upstash (rediss://), bắt buộc tắt xác thực chứng chỉ SSL cứng ngắc của Celery
if settings.REDIS_URL.startswith("rediss://"):
    celery_config["broker_use_ssl"] = {"ssl_cert_reqs": ssl.CERT_NONE}
    celery_config["redis_backend_use_ssl"] = {"ssl_cert_reqs": ssl.CERT_NONE}

celery_app.conf.update(**celery_config)
