import redis.asyncio as redis
from app.core.config import settings

# Create a global async Redis client
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
