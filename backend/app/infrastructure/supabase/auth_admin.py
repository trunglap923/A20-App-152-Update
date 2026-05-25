import httpx
import logging
from typing import List, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

class SupabaseAuthAdmin:
    """
    Adapter to interact with Supabase Auth Admin APIs using the Service Role Key.
    """
    def __init__(self):
        self.base_url = f"{settings.SUPABASE_URL}/auth/v1/admin"
        self.headers = {
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json"
        }

    async def list_users(self) -> List[Dict[str, Any]]:
        """Fetch all users from Supabase Auth."""
        try:
            async with httpx.AsyncClient() as client:
                # The auth admin API might require pagination, but for now we fetch the first page
                response = await client.get(
                    f"{self.base_url}/users",
                    headers=self.headers
                )
                response.raise_for_status()
                data = response.json()
                return data.get("users", [])
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase Admin API Error: {e.response.text}")
            raise Exception(f"Failed to list users: {e.response.text}")
        except Exception as e:
            logger.error(f"Failed to list users: {e}")
            raise e

    async def update_user_ban_status(self, user_id: str, banned_until: Optional[str] = None) -> Dict[str, Any]:
        """Update a user's ban status. Set banned_until = 'none' to unban."""
        try:
            async with httpx.AsyncClient() as client:
                body = {}
                if banned_until:
                    body["ban_duration"] = banned_until # Supabase API usually takes ban_duration like "87600h" or we can just use the UI approach
                # Actually, Supabase has PUT /auth/v1/admin/users/{user_id}
                
                response = await client.put(
                    f"{self.base_url}/users/{user_id}",
                    headers=self.headers,
                    json=body
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to update user ban status: {e}")
            raise e

supabase_admin = SupabaseAuthAdmin()
