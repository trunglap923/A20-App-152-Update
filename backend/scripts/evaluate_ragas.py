import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Thêm thư mục backend vào sys.path để import các module
backend_dir = Path(__file__).parent.parent
sys.path.append(str(backend_dir))
load_dotenv(backend_dir / ".env")

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.chat_messages import ChatMessage

# Chuẩn Ragas >= 0.2.0
from ragas import evaluate
from ragas.metrics import Faithfulness, AnswerRelevancy
from ragas.dataset_schema import EvaluationDataset, SingleTurnSample

from openai import OpenAI
from ragas.llms import llm_factory
from ragas.embeddings import embedding_factory

def run_evaluation():
    print("🚀 Bắt đầu quá trình đánh giá RAGAS (Faithfulness & Answer Relevancy)...")
    db: Session = SessionLocal()
    
    try:
        # Lấy 10 tin nhắn AI gần nhất có chứa sources (contexts)
        ai_messages = db.query(ChatMessage).filter(
            ChatMessage.role == "assistant",
            ChatMessage.sources != None
        ).order_by(ChatMessage.created_at.desc()).limit(10).all()
        
        if not ai_messages:
            print("❌ Không tìm thấy dữ liệu hội thoại nào có chứa Context. Hãy chat thử vài câu với tài liệu trước nhé.")
            return

        samples = []

        for ai_msg in ai_messages:
            # Tìm tin nhắn user ngay trước đó trong cùng 1 item_id
            user_msg = db.query(ChatMessage).filter(
                ChatMessage.item_id == ai_msg.item_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < ai_msg.created_at
            ).order_by(ChatMessage.created_at.desc()).first()

            if user_msg and ai_msg.content and ai_msg.sources:
                contexts = ai_msg.sources if isinstance(ai_msg.sources, list) else [str(ai_msg.sources)]
                valid_contexts = [c for c in contexts if c and str(c).strip()]
                
                if not valid_contexts:
                    continue

                samples.append(SingleTurnSample(
                    user_input=user_msg.content,
                    response=ai_msg.content,
                    retrieved_contexts=valid_contexts
                ))

        if not samples:
            print("❌ Không ghép cặp được User-AI nào hợp lệ để test.")
            return

        print(f"✅ Đã trích xuất {len(samples)} mẫu test từ Database.")
        dataset = EvaluationDataset(samples=samples)

        print("⚖️ Đang khởi tạo Evaluator LLM và Embeddings (chuẩn Ragas 0.2.x)...")
        openai_client = OpenAI() # Tự động nhận OPENAI_API_KEY từ .env
        eval_llm = llm_factory('gpt-4o-mini', client=openai_client)
        eval_embeddings = embedding_factory('openai', model='text-embedding-3-small', client=openai_client)

        print("⚖️ Đang gọi LLM (OpenAI) để chấm điểm RAGAS... Quá trình này có thể mất vài phút.")
        # Lưu ý: Các class metrics phải được khởi tạo (có ngoặc tròn)
        result = evaluate(
            dataset=dataset,
            metrics=[Faithfulness(), AnswerRelevancy()],
            llm=eval_llm,
            embeddings=eval_embeddings
        )

        print("\n📊 KẾT QUẢ ĐÁNH GIÁ RAGAS:")
        print("-------------------------------------------------")
        
        # In ra summary dict từ Ragas
        print(result)
        
        # In trung bình cộng dễ nhìn qua Pandas
        try:
            df = result.to_pandas()
            f_score = df["faithfulness"].mean() if "faithfulness" in df.columns else 0.0
            ar_score = df["answer_relevancy"].mean() if "answer_relevancy" in df.columns else 0.0
            
            print("\n📈 ĐIỂM TRUNG BÌNH (Average Scores):")
            print(f"🔸 Faithfulness (Tính trung thực so với tài liệu): {f_score:.4f}")
            print(f"🔸 Answer Relevancy (Độ bám sát câu hỏi): {ar_score:.4f}")
        except Exception as display_err:
            print(f"\n📈 Lỗi khi parse pandas (có thể in result trên là đủ): {display_err}")

        print("-------------------------------------------------")
        print("\n💡 Tip: Nếu điểm < 0.80, bạn cần cải thiện Prompt hoặc chất lượng băm tài liệu (Chunking)!")
        
    except Exception as e:
        print(f"\n❌ Lỗi khi chạy RAGAS: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_evaluation()
