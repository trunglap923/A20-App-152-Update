import os
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
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_acks_late=True, # Đảm bảo task không bị mất nếu worker crash giữa chừng
    worker_prefetch_multiplier=1, # Mỗi worker chỉ lấy 1 task tại 1 thời điểm (tránh ôm task video nặng)
    task_time_limit=3600, # Giới hạn tối đa 1 tiếng cho 1 task (vd: video dài)
)
