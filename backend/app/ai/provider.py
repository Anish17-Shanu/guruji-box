"""Swappable, server-only AI provider boundary."""
from abc import ABC, abstractmethod
from pydantic import BaseModel
from google import genai
from google.genai import types
from ..core.config import get_settings

class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = True): self.message, self.retryable = message, retryable
class GroundedReply(BaseModel): answer: str; passage_ids: list[int]
class TutorProvider(ABC):
    @abstractmethod
    def answer(self, question: str, passages: list[dict]) -> GroundedReply: ...
class GeminiProvider(TutorProvider):
    def __init__(self):
        s=get_settings()
        if not s.gemini_api_key: raise ProviderError("Tutor service is not configured", False)
        self.client=genai.Client(api_key=s.gemini_api_key); self.model=s.gemini_model; self.timeout=s.tutor_timeout_seconds
    def answer(self, question, passages):
        context="\n\n".join(f"[{p['id']}] {p['text']}" for p in passages)
        prompt=f"Answer only from passages. If evidence is weak, say insufficient. Return JSON with answer and passage_ids.\nPassages:\n{context}\nQuestion: {question}"
        try:
            response=self.client.models.generate_content(model=self.model,contents=prompt,config=types.GenerateContentConfig(response_mime_type="application/json",response_schema=GroundedReply),)
            return GroundedReply.model_validate_json(response.text)
        except Exception as exc: raise ProviderError("Tutor is temporarily unavailable. Please retry.") from exc
