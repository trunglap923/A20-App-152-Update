import requests
import time
import os
import json
from datetime import datetime

BACKEND_ORIGIN = os.getenv("BACKEND_ORIGIN", "https://nexusai-bh1p.onrender.com").rstrip("/")
BASE_URL = f"{BACKEND_ORIGIN}/api"
REPORT_FILE = "e2e_test_report.txt"

def log_to_file(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}\n"
    print(line, end="")
    with open(REPORT_FILE, "a", encoding="utf-8") as f:
        f.write(line)

def run_e2e_test():
    # Khởi tạo file report mới
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("============================================================\n")
        f.write("🚀 KẾT QUẢ KIỂM THỬ E2E (UPLOAD -> ENRICHMENT -> RESULT)\n")
        f.write("============================================================\n\n")

    log_to_file("Bắt đầu kiểm thử End-to-End...")

    # 1. Tìm file PDF trong thư mục data
    pdf_path = None
    data_dir = os.path.join(os.getcwd(), "data")
    for f in os.listdir(data_dir):
        if f.endswith(".pdf"):
            pdf_path = os.path.join(data_dir, f)
            break
    
    if not pdf_path:
        log_to_file("❌ Lỗi: Không tìm thấy file PDF nào trong thư mục ./data/")
        return

    log_to_file(f"1. Đang upload file: {os.path.basename(pdf_path)}...")
    
    # 2. Upload file
    try:
        with open(pdf_path, "rb") as f:
            files = {"file": f}
            data = {"source_type": "pdf"}
            response = requests.post(f"{BASE_URL}/items/process", files=files, data=data)
            
        if response.status_code != 200:
            log_to_file(f"❌ Lỗi Upload: {response.text}")
            return
        
        item_id = response.json().get("item_id")
        log_to_file(f"✅ Upload thành công! Item ID: {item_id}")

        # 3. Polling chờ kết quả
        start_time = time.time()
        max_wait = 300 # 5 phút
        log_to_file("2. Đang chờ AI xử lý (Parallelized Pipeline)...")
        
        last_stage = ""
        while time.time() - start_time < max_wait:
            res = requests.get(f"{BASE_URL}/items/{item_id}")
            if res.status_code != 200:
                log_to_file(f"⚠️ Lỗi khi polling: {res.status_code}")
                break
                
            item = res.json()
            status = item.get("status")
            
            if status == "done":
                elapsed = time.time() - start_time
                log_to_file(f"✨ HOÀN TẤT TRONG {elapsed:.2f} GIÂY!")
                
                # Ghi tóm tắt kết quả vào file
                log_to_file("\n--- KẾT QUẢ CUỐI CÙNG ---")
                log_to_file(f"📌 Tiêu đề: {item.get('title')}")
                log_to_file(f"📝 Summary (Chi tiết): {len(item.get('summary', {}).get('detailed', ''))} ký tự")
                log_to_file(f"📚 Số lượng bài học: {len(item.get('lessons', []))}")
                log_to_file(f"❓ Số lượng câu hỏi Quiz: {len(item.get('quiz', []))}")
                log_to_file(f"🗺️ Mindmap: {'Có' if item.get('mindmap') else 'Không'}")
                
                log_to_file("\n✅ File kết quả chi tiết đã được lưu thành công vào Database.")
                break
            
            elif status == "failed":
                log_to_file("❌ Pipeline thất bại.")
                break
            
            else:
                # In ra stage nếu có đổi mới
                print(".", end="", flush=True)
                time.sleep(5)
        else:
            log_to_file("❌ Quá thời gian chờ (Timeout).")

    except Exception as e:
        log_to_file(f"❌ Lỗi hệ thống: {str(e)}")

    log_to_file("\n============================================================")
    log_to_file("KIỂM THỬ KẾT THÚC.")

if __name__ == "__main__":
    run_e2e_test()
