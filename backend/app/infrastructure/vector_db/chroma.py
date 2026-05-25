import chromadb
from chromadb.config import Settings
from app.core.config import settings

class VectorDB:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)
        
    def get_collection(self, name: str, embedding_function=None):
        return self.client.get_or_create_collection(name=name, embedding_function=embedding_function)

vector_db = VectorDB()
