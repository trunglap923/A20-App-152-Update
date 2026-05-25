from pydantic import BaseModel, Field
from typing import List, Optional

# --- Phân đoạn Summary ---
class HighlightItem(BaseModel):
    keyword: str = Field(description="Từ khóa hoặc thuật ngữ quan trọng")
    source_quote: str = Field(description="NGUYÊN VĂN một câu ngắn chứa định nghĩa gốc của từ khóa trích xuất trực tiếp từ tài liệu")
    media_timestamp: Optional[str] = Field(default=None, description="Dành riêng cho Audio/Video: Thời gian bắt đầu chứa từ khóa này, định dạng MM:SS hoặc HH:MM:SS")
    page_number: Optional[int] = Field(default=None, description="Dành riêng cho PDF: Số trang (1-based) chứa từ khóa này")

class ContentSummary(BaseModel):
    title: str = Field(description="Tiêu đề ngắn gọn, súc tích cho toàn bộ tài liệu (không dùng emoji)")
    tldr: List[str] = Field(description="5-6 điểm tóm tắt cốt lõi của toàn bộ tài liệu")
    detailed: str = Field(description="Tóm tắt chi tiết viết bằng Markdown có cấu trúc đầy đủ (## Tổng quan, ## Khái niệm cốt lõi, ## Kiến trúc/Quy trình, ## Ứng dụng thực tế). Khoảng 300-500 từ.")
    highlights: List[HighlightItem] = Field(description="Danh sách các từ khóa nổi bật và trích dẫn định nghĩa gốc của chúng")

# --- Phân đoạn Quiz ---
class QuizItem(BaseModel):
    question_type: str = Field(
        default="mcq",
        description="Loại câu hỏi: 'mcq' (4 lựa chọn A/B/C/D) hoặc 'true_false' (Đúng/Sai)"
    )
    question: str = Field(description="Câu hỏi rõ ràng, liên quan trực tiếp đến nội dung bài học")
    options: List[str] = Field(
        description="Với mcq: danh sách 4 lựa chọn. Với true_false: ['Đúng', 'Sai']"
    )
    correct_index: int = Field(
        description="Vị trí (0-based) của đáp án đúng trong danh sách options. VD: 0=A, 1=B, 2=C, 3=D"
    )
    explanation: str = Field(
        description="Giải thích CHI TIẾT (3-5 câu): tại sao đáp án đó đúng, tại sao các đáp án khác sai, liên hệ kiến thức bài học"
    )

class QuizList(BaseModel):
    quizzes: List[QuizItem]

# --- Phân đoạn Lesson ---
class LessonItem(BaseModel):
    title: str = Field(description="Tiêu đề ngắn gọn của bài học")
    keyConcept: str = Field(description="Nội dung giải thích CHI TIẾT bài học (Markdown) dựa trên Ngữ cảnh. ĐÂY LÀ PHẦN LÝ THUYẾT CHÍNH, GIẢI THÍCH SÂU VỀ KHÁI NIỆM, QUY TRÌNH. Tuyệt đối không viết tóm tắt ngắn gọn.")
    example: str = Field(description="Một ví dụ minh họa thực tiễn, trực quan, sinh động (như tình huống thực tế, code mẫu, phép ẩn dụ) để làm rõ lý thuyết ở trên. Đây CHỈ là phần ví dụ.")
    difficulty: str = Field(default="beginner", description="Mức độ khó của bài học: beginner, intermediate, hoặc advanced")
    quizzes: List[QuizItem] = Field(default=[], description="Danh sách đúng 6 câu hỏi trắc nghiệm kiểm tra kiến thức của bài học này")

class OutlineItem(BaseModel):
    title: str = Field(description="Tiêu đề ngắn gọn của bài học, bạn đọc hiểu ngay nội dung")
    description: str = Field(description="Mô tả 1-2 câu về phạm vi và mục tiêu của bài học này")

class Outline(BaseModel):
    items: List[OutlineItem]

# --- Phân đoạn Mindmap (Recursive) ---
class MindmapNode(BaseModel):
    id: str = Field(description="ID duy nhất của node, dùng chữ thường-gạch-dưới (ví dụ: rag-overview)")
    label: str = Field(description="Nhãn hiển thị của node trên bản đồ tư duy, ngắn gọn và rõ ràng")
    children: List['MindmapNode'] = Field(default=[], description="Danh sách các node con (có thể đệ trống nếu là node lá)")

MindmapNode.model_rebuild()


# --- Root Extraction (Map-Reduce: chỉ summary + mindmap) ---
class FullExtraction(BaseModel):
    summary: ContentSummary
    mindmap: MindmapNode

# --- Synthesis mới (Tách riêng) ---
class SummaryOnly(BaseModel):
    summary: ContentSummary

class MindmapOnly(BaseModel):
    mindmap: MindmapNode

# --- Tối ưu hóa: Non-recursive schema cho Synthesis để chống lỗi đệ quy vô hạn (16k token limit) ---
class SynthesisMindmapL3(BaseModel):
    id: str = Field(description="ID duy nhất")
    label: str = Field(description="Khái niệm cốt lõi (tối đa 5 từ)")

class SynthesisMindmapL2(BaseModel):
    id: str = Field(description="ID duy nhất")
    label: str = Field(description="Luận điểm chính (tối đa 5 từ)")
    children: List[SynthesisMindmapL3] = Field(default=[], description="Các khái niệm chi tiết bên trong")

class SynthesisMindmapL1(BaseModel):
    id: str = Field(description="ID duy nhất (ví dụ: root)")
    label: str = Field(description="Chủ đề chính của toàn bộ Video/Tài liệu")
    children: List[SynthesisMindmapL2] = Field(default=[], description="Các luận điểm lớn, đã loại bỏ trùng lặp")

class SynthesisMindmapOnly(BaseModel):
    mindmap: SynthesisMindmapL1
