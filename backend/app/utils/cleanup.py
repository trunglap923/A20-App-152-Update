import asyncio
import time
import httpx
import os
import anyio
from sqlalchemy import text
from app.db.session import engine
from app.services.vector_search_service import search_service

def _delete_sql_data(item_id: str):
    """Xóa data SQL bằng raw SQL — tối thiểu round-trip qua Supabase Transaction Pooler."""
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            # Đặt lock timeout 30s để phát hiện deadlock sớm (thay vì chờ vô hạn)
            conn.execute(text("SET LOCAL lock_timeout = '30s'"))

            # Xóa chat messages trước (không có CASCADE từ đây)
            conn.execute(
                text("DELETE FROM chat_messages WHERE item_id = CAST(:id AS UUID)"),
                {"id": item_id},
            )
            # Xóa KnowledgeItem — CASCADE tự dọn item_chunks + embeddings
            result = conn.execute(
                text("DELETE FROM knowledge_items WHERE id = CAST(:id AS UUID) RETURNING id"),
                {"id": item_id},
            )
            deleted = result.rowcount
        return deleted > 0
    except Exception as e:
        print(f"[CLEANUP-ERROR] SQL cleanup failed for {item_id}: {e}")
        return False

async def delete_item_completely(item_id: str, source_url: str = None):
    """Xóa sạch sành sanh một item từ SQL, VectorDB và Supabase Storage.

    Luồng tối ưu:
      1. SQL DELETE (bắt buộc trước để giải phóng khóa DB và cascade)
      2. ChromaDB + Milvus + Supabase → chạy SONG SONG (asyncio.gather)
    """
    print(f"[CLEANUP] Bắt đầu dọn dẹp triệt để cho Item: {item_id}")
    _t0 = time.perf_counter()

    # ── 1. SQL trước (bắt buộc, release locks) ──────────────────────
    _ts = time.perf_counter()
    await anyio.to_thread.run_sync(_delete_sql_data, item_id)
    print(f"[CLEANUP] ✅ SQL xong ({time.perf_counter()-_ts:.2f}s): {item_id}")

    # ── 2. Hàm xóa Supabase (network IO) ───────────────────────────
    async def _del_supabase():
        if not (source_url and "supabase" in source_url):
            return
        _ts = time.perf_counter()
        try:
            supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
            service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
            if not service_key:
                return
            parts = source_url.split("/storage/v1/object/public/", 1)
            if len(parts) == 2:
                bucket_and_path = parts[1]
                bucket    = bucket_and_path.split("/", 1)[0]
                file_path = bucket_and_path.split("/", 1)[1] if "/" in bucket_and_path else ""
                delete_url = f"{supabase_url}/storage/v1/object/{bucket}/{file_path}"
                async with httpx.AsyncClient() as client:
                    await client.delete(
                        delete_url,
                        headers={"Authorization": f"Bearer {service_key}"}
                    )
                print(f"[CLEANUP] ✅ Supabase xong ({time.perf_counter()-_ts:.2f}s): {file_path}")
        except Exception as e:
            print(f"[CLEANUP-ERROR] Supabase failed ({time.perf_counter()-_ts:.2f}s): {e}")

    # ── 3. Vector DBs (Chroma + Milvus) và Supabase → SONG SONG ────
    # search_service.delete_item đã tự chạy Chroma+Milvus song song bên trong
    _tv = time.perf_counter()
    await asyncio.gather(
        search_service.delete_item(item_id),
        _del_supabase(),
    )
    print(f"[CLEANUP] ✅ Vector DB + Supabase xong ({time.perf_counter()-_tv:.2f}s)")
    print(f"[CLEANUP] 🏁 Tổng thời gian dọn dẹp: {time.perf_counter()-_t0:.2f}s")
