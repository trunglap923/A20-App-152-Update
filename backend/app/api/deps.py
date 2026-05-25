import jwt
import json
import httpx
from jwt.algorithms import ECAlgorithm
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from app.config import settings
from app.core.logging import logger
from app.db.session import get_db

security = HTTPBearer()

import uuid

class UserInfo(BaseModel):
    id: uuid.UUID

# Cache public keys by kid để không phải fetch mỗi request
_jwks_cache: dict = {}

async def _get_public_key(kid: str):
    """Fetch và cache public key từ Supabase JWKS endpoint theo kid."""
    if kid in _jwks_cache:
        return _jwks_cache[kid]

    supabase_url = settings.SUPABASE_URL
    if not supabase_url:
        logger.error("SUPABASE_URL is not set in environment")
        raise ValueError("SUPABASE_URL chưa được cấu hình trong .env")

    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    logger.info(f"Fetching JWKS from: {jwks_url}")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(jwks_url, timeout=10)
            resp.raise_for_status()
            jwks = resp.json()
    except Exception as e:
        logger.error(f"ERROR fetching JWKS: {e}")
        raise ValueError(f"Không thể kết nối tới Supabase để lấy key: {e}")

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            try:
                public_key = ECAlgorithm.from_jwk(json.dumps(key_data))
                _jwks_cache[kid] = public_key
                logger.info(f"Cached public key for kid={kid}")
                return public_key
            except Exception as e:
                logger.error(f"ERROR parsing JWK: {e}")
        raise ValueError(f"Lỗi khi xử lý public key: {e}")

    logger.error(f"kid={kid} not found in JWKS")
    raise ValueError(f"Không tìm thấy public key cho kid={kid} trong JWKS")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserInfo:
    """Xác thực JWT token từ Supabase bằng public key (ES256)."""
    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        alg = header.get("alg", "ES256")
        
        if not kid:
            logger.error("Token missing 'kid' in header")
            raise jwt.InvalidTokenError("Token thiếu kid trong header")

        public_key = await _get_public_key(kid)

        payload = jwt.decode(
            token,
            public_key,
            algorithms=[alg],
            options={"verify_aud": False},
            leeway=60
        )

        user_id: str = payload.get("sub")
        if not user_id:
            logger.error("Token missing 'sub' claim")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không chứa user id")

        return UserInfo(id=user_id)

    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"JWT error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token không hợp lệ: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error during auth: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Lỗi xác thực hệ thống: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_sse(token: str = None, request: Request = None) -> UserInfo:
    """
    Dependency cho SSE: đọc token từ query param ?token=...
    vì EventSource của trình duyệt không cho phép set custom Authorization header.
    """
    raw_token = token
    if not raw_token and request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]

    if not raw_token:
        raise HTTPException(status_code=401, detail="Thiếu token xác thực")

    try:
        header = jwt.get_unverified_header(raw_token)
        kid = header.get("kid")
        alg = header.get("alg", "ES256")
        if not kid:
            raise jwt.InvalidTokenError("Token thiếu kid")

        public_key = await _get_public_key(kid)
        payload = jwt.decode(raw_token, public_key, algorithms=[alg],
                             options={"verify_aud": False}, leeway=60)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token thiếu user id")
        return UserInfo(id=user_id)

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token đã hết hạn")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token không hợp lệ: {e}")
