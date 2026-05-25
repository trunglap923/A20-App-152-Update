import warnings

# Ẩn các cảnh báo Pydantic v2 toàn cục (xảy ra khi serialize các model phức tạp như GradeResult, LessonItem, Summary, Mindmap)
# Điều này giúp log hệ thống sạch hơn và không làm phiền quá trình xử lý file/chat.
warnings.filterwarnings("ignore", message="PydanticSerializationUnexpectedValue")
