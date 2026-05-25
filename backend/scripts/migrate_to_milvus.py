"""
scripts/migrate_to_milvus.py
────────────────────────────
Giai đoạn 3: Migrate dữ liệu vector từ PostgreSQL → Milvus.

Ưu điểm:
- KHÔNG gọi lại OpenAI → tiết kiệm 100% chi phí embedding
- Đọc trực tiếp từ bảng item_chunks + embeddings bằng raw SQL (tránh lỗi pgvector ORM)
- Ghi theo batch (BATCH_SIZE) để tránh timeout

Cách chạy (từ thư mục GỐC dự án):
  venv\\Scripts\\python backend\\scripts\\migrate_to_milvus.py           # migrate tất cả
  venv\\Scripts\\python backend\\scripts\\migrate_to_milvus.py --dry-run # kiểm tra không ghi
  venv\\Scripts\\python backend\\scripts\\migrate_to_milvus.py --item-id <uuid>
"""
import sys
import os
import argparse
import time
import json

# Đảm bảo Python tìm được app package
_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text
from app.db.session import engine
from app.search.backends.milvus_db import milvus_adapter

BATCH_SIZE = 200
_RESERVED  = {"id", "vector", "item_id", "chunk_index", "content",
               "source_url", "source_type", "chunk_idx"}


def _safe_meta(jsonb_val) -> dict:
    """Chỉ giữ key/value kiểu đơn giản để làm dynamic field cho Milvus."""
    if not jsonb_val:
        return {}
    if isinstance(jsonb_val, str):
        try:
            jsonb_val = json.loads(jsonb_val)
        except Exception:
            return {}
    return {
        k: v for k, v in jsonb_val.items()
        if k not in _RESERVED and isinstance(v, (str, int, float, bool))
    }


def _parse_vector(raw) -> list[float] | None:
    """Chuyển pgvector text '[0.1, 0.2, ...]' hoặc list sang list[float]."""
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        return [float(x) for x in raw]
    # Dạng text: "[0.023, -0.041, ...]"
    try:
        return [float(x) for x in str(raw).strip("[]").split(",")]
    except Exception:
        return None


# ── Raw SQL: cast embedding → float[] tránh lỗi pgvector ORM ─────────
_SQL = text("""
    SELECT
        ic.item_id::text                   AS item_id,
        ic.chunk_index,
        ic.content,
        ic.chunk_metadata,
        e.embedding::text                   AS vector,
        ki.source_url,
        ki.source_type
    FROM   item_chunks    ic
    JOIN   embeddings     e  ON ic.id      = e.chunk_id
    JOIN   knowledge_items ki ON ic.item_id = ki.id
    WHERE  e.embedding IS NOT NULL
    {where_extra}
    ORDER  BY ic.item_id, ic.chunk_index
""")


def migrate(item_id_filter: str | None = None, dry_run: bool = False):
    if not milvus_adapter.available:
        print("❌ Milvus không khả dụng. Kiểm tra MILVUS_URI trong .env")
        sys.exit(1)

    client     = milvus_adapter.client
    collection = milvus_adapter.collection_name

    where_extra = ""
    params: dict = {}
    if item_id_filter:
        where_extra = "AND ic.item_id = :item_id"
        params["item_id"] = item_id_filter

    sql = text(_SQL.text.format(where_extra=where_extra))

    with engine.connect() as conn:
        # Đếm trước
        count_sql = text(f"""
            SELECT COUNT(*)
            FROM   item_chunks ic
            JOIN   embeddings  e ON ic.id = e.chunk_id
            WHERE  e.embedding IS NOT NULL
            {where_extra}
        """)
        total = conn.execute(count_sql, params).scalar() or 0
        print(f"\n📦 Tổng số chunks cần migrate: {total}")
        if total == 0:
            print("ℹ Không có dữ liệu để migrate.")
            return

        migrated   = 0
        skipped    = 0
        batch_docs = []

        for row in conn.execute(sql, params):
            vector = _parse_vector(row.vector)
            if not vector or len(vector) != 1536:
                skipped += 1
                continue

            chunk_index = row.chunk_index or 0
            item_id_str = str(row.item_id)

            doc = {
                "id":          f"{item_id_str}_{chunk_index}",
                "vector":      vector,
                "item_id":     item_id_str,
                "chunk_index": chunk_index,
                "content":     (row.content or "")[:65_000],
                "chunk_idx":   chunk_index,                      # alias giống Chroma
                "source_url":  (row.source_url  or "")[:500],
                "source_type": (row.source_type or "")[:100],
                # Dynamic fields từ chunk_metadata
                **_safe_meta(row.chunk_metadata),
            }
            batch_docs.append(doc)

            if len(batch_docs) >= BATCH_SIZE:
                if not dry_run:
                    client.insert(collection, batch_docs)
                migrated += len(batch_docs)
                print(f"  ✅ {migrated}/{total} chunks...", end="\r", flush=True)
                batch_docs = []

        # Flush batch cuối
        if batch_docs:
            if not dry_run:
                client.insert(collection, batch_docs)
            migrated += len(batch_docs)

    print(f"\n\n{'[DRY-RUN] ' if dry_run else ''}✅ Migrate hoàn tất!")
    print(f"   Đã ghi  : {migrated} chunks")
    print(f"   Bỏ qua  : {skipped} chunks (vector NULL hoặc sai dims)")
    print(f"   Collection: {collection}\n")


# ── Entry point ───────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate vectors PostgreSQL → Milvus")
    parser.add_argument("--dry-run",  action="store_true", help="Kiểm tra không ghi thực sự")
    parser.add_argument("--item-id",  type=str, default=None, help="Chỉ migrate 1 item (UUID)")
    args = parser.parse_args()

    t0 = time.time()
    migrate(item_id_filter=args.item_id, dry_run=args.dry_run)
    print(f"⏱ Thời gian: {time.time() - t0:.1f}s")
