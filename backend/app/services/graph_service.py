import os
import json
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from app.core.config import settings
from app.core.logging import logger
from langchain_core.prompts import ChatPromptTemplate
from app.ai.providers import get_chat_provider
import uuid

class GraphService:
    def __init__(self):
        self.uri = settings.NEO4J_URI
        self.username = settings.NEO4J_USERNAME
        self.password = settings.NEO4J_PASSWORD
        self.driver = None
        
        if self.uri and self.username and self.password:
            try:
                self.driver = GraphDatabase.driver(self.uri, auth=(self.username, self.password))
                logger.info("[GraphRAG] ✅ Đã kết nối thành công tới Neo4j.")
            except Exception as e:
                logger.error(f"[GraphRAG] ❌ Lỗi kết nối Neo4j: {e}")
        else:
            logger.warning("[GraphRAG] ⚠ Neo4j chưa được cấu hình. GraphRAG sẽ không hoạt động.")

    def close(self):
        if self.driver:
            self.driver.close()

    async def extract_and_save_graph(self, text_chunk: str, item_id: str, chunk_index: int, ai_options: dict) -> None:
        """
        Dùng LLM để đọc chunk văn bản, trích xuất các Thực thể và Mối quan hệ,
        sau đó lưu vào Neo4j.
        """
        if not self.driver:
            return

        # 1. Khởi tạo LLM (Nên dùng model xịn như GPT-4o-mini hoặc Claude 3 Haiku)
        provider = ai_options.get("text", {}).get("provider", "openai")
        model = ai_options.get("text", {}).get("model", "gpt-4o-mini")
        api_key = ai_options.get("text", {}).get("api_key", "")
        
        llm = get_chat_provider(provider=provider, model=model, api_key=api_key)

        # 2. Định nghĩa Prompt trích xuất (JSON Schema)
        extraction_prompt = ChatPromptTemplate.from_messages([
            ("system", """Bạn là một chuyên gia phân tích dữ liệu. Hãy đọc đoạn văn bản sau và trích xuất thông tin thành Mạng Lưới Đồ Thị Tri Thức.
Trích xuất danh sách các "nodes" (Thực thể: Nhân vật, Tổ chức, Địa điểm, Khái niệm quan trọng) và "edges" (Mối quan hệ giữa chúng).

Yêu cầu trả về đúng định dạng JSON sau, không có markdown hay bất kỳ chữ nào khác:
{{
  "nodes": [
    {{"id": "Tên thực thể (viết hoa chuẩn)", "label": "Phân loại (vd: PERSON, ORGANIZATION, CONCEPT...)", "description": "Mô tả ngắn gọn"}}
  ],
  "edges": [
    {{"source": "Tên thực thể gốc", "target": "Tên thực thể đích", "type": "Tên mối quan hệ (vd: FOUNDED, WORKED_AT, RELATED_TO)"}}
  ]
}}
"""),
            ("user", "Đoạn văn bản:\n{text}")
        ])

        chain = extraction_prompt | llm
        
        try:
            logger.info(f"[GraphRAG] Đang trích xuất đồ thị cho chunk {chunk_index} của item {item_id}")
            result = await chain.ainvoke({"text": text_chunk})
            
            # Xử lý text trả về (có thể có markdown ```json)
            content = result.content.strip()
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
                
            graph_data = json.loads(content)
            
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            
            # 3. Lưu vào Neo4j
            if nodes or edges:
                self._save_to_neo4j(item_id, nodes, edges)
                
        except Exception as e:
            logger.error(f"[GraphRAG] Lỗi trích xuất đồ thị ở chunk {chunk_index}: {e}")

    def _save_to_neo4j(self, item_id: str, nodes: List[Dict], edges: List[Dict]) -> None:
        """Thực thi câu lệnh Cypher để MERGE Nodes và Edges vào DB."""
        if not self.driver: return

        # Dùng một session của Neo4j
        with self.driver.session() as session:
            # 1. Lưu các Nodes
            for node in nodes:
                node_id = node.get("id", "").strip()
                label = node.get("label", "ENTITY").strip().upper().replace(" ", "_")
                desc = node.get("description", "")
                
                if not node_id: continue
                
                # Cypher query để tạo hoặc cập nhật Node (MERGE tránh trùng lặp TRONG CÙNG 1 TÀI LIỆU)
                # Chú ý: Dùng item_id làm part của định danh để tách biệt các file
                safe_label = "".join(c for c in label if c.isalnum() or c == "_")
                query = f"""
                MERGE (n:`{safe_label}` {{name: $name, item_id: $item_id}})
                ON CREATE SET n.description = $desc
                ON MATCH SET n.description = coalesce(n.description, "") + " | " + $desc
                """
                session.run(query, name=node_id, desc=desc, item_id=item_id)
            
            # 2. Lưu các Edges
            for edge in edges:
                source = edge.get("source", "").strip()
                target = edge.get("target", "").strip()
                rel_type = edge.get("type", "RELATED_TO").strip().upper().replace(" ", "_")
                
                if not source or not target: continue
                
                safe_rel = "".join(c for c in rel_type if c.isalnum() or c == "_")
                query = f"""
                MATCH (a {{name: $source, item_id: $item_id}})
                MATCH (b {{name: $target, item_id: $item_id}})
                MERGE (a)-[r:`{safe_rel}`]->(b)
                """
                session.run(query, source=source, target=target, item_id=item_id)
                
        logger.info(f"[GraphRAG] Đã lưu {len(nodes)} nodes và {len(edges)} edges vào Neo4j.")

    async def query_local_neighborhood(self, question: str, item_id: str, ai_options: dict) -> str:
        """
        Trích xuất Entity từ câu hỏi, tìm kiếm xung quanh Entity đó trong Neo4j (độ sâu 1-2).
        Trả về dưới dạng chuỗi Text để nối vào Context.
        """
        if not self.driver:
            return ""

        # 1. Trích xuất Entity từ câu hỏi
        provider = ai_options.get("text", {}).get("provider", "openai")
        model = ai_options.get("text", {}).get("model", "gpt-4o-mini")
        api_key = ai_options.get("text", {}).get("api_key", "")
        
        llm = get_chat_provider(provider=provider, model=model, api_key=api_key)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Trích xuất danh sách các thực thể quan trọng (Nhân vật, Địa điểm, Tổ chức, Khái niệm) từ câu hỏi. Trả về dưới dạng một danh sách phân tách bằng dấu phẩy. VÍ DỤ: Công ty FPT, Ông Phạm Nhật Vượng, Trí tuệ nhân tạo. CHỈ trả về text, không giải thích."),
            ("user", "{question}")
        ])
        
        try:
            res = await (prompt | llm).ainvoke({"question": question})
            entities_str = res.content.strip()
            entities = [e.strip() for e in entities_str.split(",") if e.strip()]
        except Exception as e:
            logger.error(f"[GraphRAG] Lỗi trích xuất entity từ câu hỏi: {e}")
            return ""
            
        if not entities:
            return ""

        # 2. Truy vấn đồ thị xung quanh các entity này
        graph_context = []
        with self.driver.session() as session:
            for entity in entities:
                # Tìm Node có name gần giống, lấy các Node lân cận (depth=1), và CHỈ LẤY của item_id này
                query = """
                MATCH (n)-[r]-(m)
                WHERE toLower(n.name) CONTAINS toLower($entity) AND n.item_id = $item_id
                RETURN n.name AS source, type(r) AS relation, m.name AS target
                LIMIT 50
                """
                results = session.run(query, entity=entity, item_id=item_id)
                for record in results:
                    graph_context.append(f"[{record['source']}] --({record['relation']})--> [{record['target']}]")
        
        if graph_context:
            # Loại bỏ trùng lặp
            unique_contexts = list(set(graph_context))
            return "THÔNG TIN TỪ KNOWLEDGE GRAPH (ĐỒ THỊ TRI THỨC):\n" + "\n".join(unique_contexts)
        
        return ""

graph_service = GraphService()
