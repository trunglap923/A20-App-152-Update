"""
TEST PHASE 3: Kiểm tra API Endpoints
======================================
Chạy: python tests/test_phase3_api.py

Yêu cầu: Backend đang chạy tại BACKEND_ORIGIN

Kiểm tra:
  1. Health check endpoint
  2. POST /items/process — upload file PDF
  3. GET /items — lấy danh sách items
  4. GET /items/{id} — lấy chi tiết item (bao gồm lessons, quiz, mindmap)
  5. Cấu trúc JSON response đầy đủ cho Frontend
"""
import sys
import os
import time
import json
import requests

BACKEND_ORIGIN = os.getenv("BACKEND_ORIGIN", "https://nexusai-bh1p.onrender.com").rstrip("/")
BASE_URL = os.getenv("API_URL", f"{BACKEND_ORIGIN}/api")
HEALTH_URL = f"{BACKEND_ORIGIN}/health"
PASS = "✅"
FAIL = "❌"
SEP  = "=" * 60

def section(title: str):
    print(f"\n{SEP}")
    print(f"  {title}")
    print(SEP)

def ok(msg: str, t: float = 0):
    suffix = f" ({t:.2f}s)" if t else ""
    print(f"  {PASS} {msg}{suffix}")

def fail(msg: str, err=""):
    print(f"  {FAIL} {msg}")
    if err:
        print(f"      => {err}")


# ══════════════════════════════════════════
# 1. Health Check
# ══════════════════════════════════════════
def test_health():
    section("TEST 1: Health Check")
    t0 = time.monotonic()
    try:
        r = requests.get(f"{HEALTH_URL}", timeout=5)
        if r.status_code == 200:
            ok(f"GET /health → {r.status_code}", time.monotonic() - t0)
            return True
        else:
            fail(f"Status code: {r.status_code}", r.text[:200])
            return False
    except requests.exceptions.ConnectionError:
        fail(f"Không kết nối được đến {HEALTH_URL} — backend có đang chạy không?")
        return False


# ══════════════════════════════════════════
# 2. Upload file (POST /items/process)
# ══════════════════════════════════════════
def test_upload(pdf_path: str) -> str | None:
    section("TEST 2: Upload file PDF → POST /items/process")
    if not os.path.exists(pdf_path):
        fail(f"Không tìm thấy file: {pdf_path}")
        return None

    print(f"  📄 File: {os.path.basename(pdf_path)}")
    t0 = time.monotonic()
    try:
        with open(pdf_path, "rb") as f:
            r = requests.post(
                f"{BASE_URL}/items/process",
                data={"source_type": "pdf"},
                files={"file": (os.path.basename(pdf_path), f, "application/pdf")},
                timeout=30,
            )
        elapsed = time.monotonic() - t0

        if r.status_code == 200:
            data = r.json()
            item_id = data.get("item_id")
            ok(f"Upload thành công → item_id: {item_id}", elapsed)
            return item_id
        else:
            fail(f"Status code: {r.status_code}", r.text[:300])
            return None
    except Exception as e:
        fail("Upload thất bại", str(e))
        return None


# ══════════════════════════════════════════
# 3. Lấy danh sách items (GET /items)
# ══════════════════════════════════════════
def test_list_items() -> bool:
    section("TEST 3: Danh sách items → GET /items")
    t0 = time.monotonic()
    try:
        r = requests.get(f"{BASE_URL}/items", timeout=10)
        elapsed = time.monotonic() - t0

        if r.status_code != 200:
            fail(f"Status code: {r.status_code}", r.text[:200])
            return False

        items = r.json()
        ok(f"Trả về {len(items)} items", elapsed)

        if items:
            first = items[0]
            required_keys = {"id", "title", "source_type"}
            missing = required_keys - set(first.keys())
            if missing:
                fail(f"Thiếu fields trong response: {missing}")
                return False
            ok("Cấu trúc item OK (có id, title, source_type)")

        return True
    except Exception as e:
        fail("GET /items thất bại", str(e))
        return False


# ══════════════════════════════════════════
# 4. Chi tiết item (GET /items/{id})
# ══════════════════════════════════════════
def test_item_detail(item_id: str, wait_seconds: int = 90) -> bool:
    section(f"TEST 4: Chi tiết item → GET /items/{item_id[:8]}…")
    print(f"  ⏳ Đợi pipeline xử lý tối đa {wait_seconds}s…")

    deadline = time.monotonic() + wait_seconds
    r = None
    while time.monotonic() < deadline:
        try:
            r = requests.get(f"{BASE_URL}/items/{item_id}", timeout=10)
            if r.status_code == 200:
                data = r.json()
                status = data.get("status", "")
                if status == "done":
                    break
                print(f"  … status = '{status}', đang chờ…")
        except Exception:
            pass
        time.sleep(5)

    if r is None or r.status_code != 200:
        fail(f"Không lấy được item (status {r.status_code if r else 'N/A'})")
        return False

    data = r.json()

    # Kiểm tra cấu trúc trả về cho Frontend
    checks = {
        "id":       bool(data.get("id")),
        "title":    bool(data.get("title")),
        "status":   data.get("status") == "done",
        "summary":  data.get("summary") is not None,
        "lessons":  isinstance(data.get("lessons"), list) and len(data["lessons"]) > 0,
        "quiz":     isinstance(data.get("quiz"), list) and len(data["quiz"]) > 0,
        "mindmap":  data.get("mindmap") is not None,
    }

    all_ok = True
    for field, result in checks.items():
        if result:
            val = data.get(field)
            count = f"({len(val)} items)" if isinstance(val, list) else ""
            ok(f"{field} {count}")
        else:
            fail(f"'{field}' bị thiếu hoặc không đúng")
            all_ok = False

    # In mẫu một lesson
    lessons = data.get("lessons", [])
    if lessons:
        print(f"\n  📖 Bài học đầu tiên: {lessons[0].get('title', '?')}")

    quizzes = data.get("quiz", [])
    if quizzes:
        print(f"  ❓ Quiz đầu tiên: {quizzes[0].get('question', '?')[:70]}…")

    return all_ok


# ══════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════
def main():
    print(f"\n{'=' * 60}")
    print("  🌐 PHASE 3: API ENDPOINT TESTS")
    print(f"  Base URL: {BASE_URL}")
    print(f"{'=' * 60}")

    results = []

    # Test 1: Health
    ok_health = test_health()
    results.append(ok_health)
    if not ok_health:
        fail("Backend chưa chạy — dừng test")
        sys.exit(1)

    # Test 3: List items (trước upload để xem baseline)
    results.append(test_list_items())

    # Tìm file PDF để upload
    pdf_file = None
    data_dir = os.path.join(os.getcwd(), "data")
    if os.path.isdir(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith(".pdf"):
                pdf_file = os.path.join(data_dir, f)
                break

    if pdf_file:
        # Test 2: Upload
        item_id = test_upload(pdf_file)
        results.append(item_id is not None)

        # Test 4: Detail (đợi pipeline xong)
        if item_id:
            results.append(test_item_detail(item_id, wait_seconds=180))
    else:
        print("\n  ⚠️  Không tìm thấy file PDF trong ./data/ — bỏ qua TEST 2 & 4")

    passed = sum(results)
    total  = len(results)

    print(f"\n{SEP}")
    print(f"  KẾT QUẢ: {passed}/{total} tests passed")
    print(SEP)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
