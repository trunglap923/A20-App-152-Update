from abc import ABC, abstractmethod
from typing import Dict, Type

class BaseProcessor(ABC):
    @abstractmethod
    async def process(self, source: str, **kwargs) -> dict:
        """
        Xử lý tài liệu và trả về nội dung chuẩn hóa kèm metadata.
        source: Có thể là đường dẫn file, URL...
        """
        pass

class IngestionRegistry:
    def __init__(self):
        self._processors: Dict[str, Type[BaseProcessor]] = {}

    def register(self, name: str, processor_cls: Type[BaseProcessor]):
        self._processors[name] = processor_cls

    def get_processor(self, name: str) -> BaseProcessor:
        processor_cls = self._processors.get(name)
        if not processor_cls:
            raise ValueError(f"Processor '{name}' không tồn tại.")
        return processor_cls()

# Singleton instance
ingestion_registry = IngestionRegistry()
