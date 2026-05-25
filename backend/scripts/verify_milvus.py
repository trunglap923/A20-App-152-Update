"""Script verify dữ liệu đã lưu vào Milvus đúng cấu trúc chưa."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.search.backends.milvus_db import milvus_adapter

c   = milvus_adapter.client
col = milvus_adapter.collection_name

# 1. Hiển thị schema
desc = c.describe_collection(col)
print("=== SCHEMA ===")
for f in desc["fields"]:
    print(f"  {f['name']:20s}  type={f['type']}  primary={f.get('is_primary', False)}")
print(f"  enable_dynamic_field: {desc.get('enable_dynamic_field')}")
print()

# 2. Thống kê số record
stats = c.get_collection_stats(col)
print(f"=== TOTAL RECORDS: {stats.get('row_count')} ===\n")

# 3. Query 1 record với tất cả output_fields
output_fields = ["item_id", "chunk_index", "content", "source_type",
                 "source_url", "chunk_idx"]
res = c.query(
    col,
    filter="chunk_index == 0",
    output_fields=output_fields,
    limit=1,
)
if res:
    r = res[0]
    print("=== SAMPLE RECORD (chunk_index=0) ===")
    print(f"  id          : {r['id']}")
    print(f"  item_id     : {r.get('item_id', 'MISSING')}")
    print(f"  chunk_index : {r.get('chunk_index', 'MISSING')}")
    print(f"  chunk_idx   : {r.get('chunk_idx', 'MISSING')}")
    print(f"  source_type : {r.get('source_type', 'MISSING')}")
    print(f"  source_url  : {(r.get('source_url') or '')[:60]}...")
    content = r.get("content") or ""
    print(f"  content     : {content[:100]}...")
else:
    print("Không tìm thấy record nào!")
