import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.embeddings import Embeddings

def _clean_key(value: str | None) -> str | None:
    if not value:
        return None
    key = str(value).strip().strip('"').strip("'").strip()
    return key or None

class AIProviderFactory:
    @staticmethod
    def get_chat_provider(
        provider: str = "openai",
        model: str = "gpt-4o-mini",
        temperature: float = 0.2,
        api_key: str | None = None
    ) -> BaseChatModel:
        """
        Factory sinh ra Chat Model.
        Hỗ trợ: openai, google (gemini), anthropic, grok.
        """
        user_key = _clean_key(api_key)
        openai_key = _clean_key(os.getenv("OPENAI_API_KEY"))
        google_key = _clean_key(os.getenv("GOOGLE_API_KEY"))
        anthropic_key = _clean_key(os.getenv("ANTHROPIC_API_KEY"))
        grok_key = _clean_key(os.getenv("XAI_API_KEY"))

        if provider == "openai":
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                api_key=user_key or openai_key or "dummy_key",
                streaming=True
            )

        elif provider == "google":
            return ChatGoogleGenerativeAI(
                model=model,
                temperature=temperature,
                google_api_key=user_key or google_key or "dummy_key",
                streaming=True
            )

        elif provider == "anthropic":
            try:
                from langchain_anthropic import ChatAnthropic
            except ImportError:
                raise ImportError(
                    "Provider Anthropic yêu cầu langchain-anthropic. "
                    "Chạy: pip install langchain-anthropic"
                )
            return ChatAnthropic(
                model=model,
                temperature=temperature,
                anthropic_api_key=user_key or anthropic_key or "dummy_key",
                streaming=True
            )

        elif provider == "grok":
            # xAI Grok dùng OpenAI-compatible API
            return ChatOpenAI(
                model=model,
                temperature=temperature,
                api_key=user_key or grok_key or "dummy_key",
                base_url="https://api.x.ai/v1",
                streaming=True
            )

        raise ValueError(
            f"Provider '{provider}' chưa được hỗ trợ. "
            f"Các provider hợp lệ: openai, google, anthropic, grok."
        )

    @staticmethod
    def get_embedding_provider(provider: str = "openai", model: str = "text-embedding-3-small") -> Embeddings:
        """Factory sinh ra Embedding Model."""
        if provider == "openai":
            return OpenAIEmbeddings(
                model=model,
                api_key=_clean_key(os.getenv("OPENAI_API_KEY"))
            )
        raise ValueError(f"Embedding Provider '{provider}' chưa được hỗ trợ.")

# Singleton helper functions
get_chat_provider = AIProviderFactory.get_chat_provider
get_embedding_provider = AIProviderFactory.get_embedding_provider
