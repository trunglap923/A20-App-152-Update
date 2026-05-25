import os
import httpx
import uuid

async def upload_file_to_supabase(file_path: str, bucket: str = "knowledge-items") -> str:
    """
    Upload một file cục bộ lên Supabase Storage và trả về Public URL.
    """
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    
    if not supabase_url or not service_key:
        print("[SUPABASE] Thiếu cấu hình URL hoặc Service Key")
        return ""

    filename = os.path.basename(file_path)
    # Tránh ký tự đặc biệt trong tên file
    safe_filename = f"{uuid.uuid4().hex}_{filename}"
    
    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{safe_filename}"
    
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                upload_url,
                content=file_content,
                headers={
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "audio/mpeg" if file_path.endswith(".mp3") else "application/octet-stream",
                    "x-upsert": "true"
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{safe_filename}"
                print(f"[SUPABASE] Upload thành công: {public_url}")
                return public_url
            else:
                print(f"[SUPABASE] Lỗi upload ({response.status_code}): {response.text}")
                return ""
    except Exception as e:
        print(f"[SUPABASE] Exception khi upload: {e}")
        return ""
