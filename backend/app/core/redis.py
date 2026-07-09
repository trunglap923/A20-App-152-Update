import redis.asyncio as redis
from app.core.config import settings

# Create a global async Redis client
redis_kwargs = {"decode_responses": True}
if settings.REDIS_URL.startswith("rediss://"):
    redis_kwargs["ssl_cert_reqs"] = "none"

redis_client = redis.from_url(settings.REDIS_URL, **redis_kwargs)
