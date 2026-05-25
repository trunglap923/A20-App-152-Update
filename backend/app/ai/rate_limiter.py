import asyncio

# ===== GLOBAL RATE LIMITER =====
# Giới hạn tổng số LLM calls đồng thời trên TOÀN SERVER để tránh vượt rate limit OpenAI.
# 40 slots = đủ cho ~5-6 pipelines chạy song song thoải mái.
GLOBAL_LLM_SEMAPHORE = asyncio.Semaphore(40)
