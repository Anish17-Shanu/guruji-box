from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from ..core.config import Settings, get_settings

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - optional dependency guard
    genai = None
    types = None

_ai_disabled_until = 0.0
AI_COOLDOWN_SECONDS = 60.0


def ai_available(settings: Settings) -> bool:
    return bool(settings.gemini_api_key) and time.monotonic() >= _ai_disabled_until


def mark_ai_failure() -> None:
    global _ai_disabled_until
    _ai_disabled_until = time.monotonic() + AI_COOLDOWN_SECONDS


def mark_ai_success() -> None:
    global _ai_disabled_until
    _ai_disabled_until = 0.0


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


class GroundedReply(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)
    passage_ids: list[int] = Field(default_factory=list, max_length=3)


class GeneratedWorksheetQuestion(BaseModel):
    kind: Literal["short_answer", "fill_blank", "mcq", "true_false"]
    prompt: str = Field(min_length=3, max_length=2000)
    choices: list[str] | None = Field(default=None, max_length=6)
    answer_key: str = Field(min_length=1, max_length=2000)
    explanation: str = ""
    source_section: str = ""


class GeneratedWorksheet(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    instructions: str = ""
    questions: list[GeneratedWorksheetQuestion] = Field(min_length=1, max_length=20)


class GeminiProvider:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        if not self.settings.gemini_api_key:
            raise ProviderError("AI tutor is not configured.", retryable=False)
        if genai is None or types is None:
            raise ProviderError("AI provider library is unavailable.", retryable=False)
        self.client = genai.Client(api_key=self.settings.gemini_api_key)

    def _generate(self, prompt: str, schema, timeout: float):
        candidate_models = [self.settings.gemini_model]
        for fallback in ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"]:
            if fallback not in candidate_models:
                candidate_models.append(fallback)

        last_error = None
        for model_name in candidate_models:
            def call(m=model_name):
                return self.client.models.generate_content(
                    model=m,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema,
                        temperature=0.2,
                    ),
                )

            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(call)
                try:
                    response = future.result(timeout=timeout)
                    text = getattr(response, "text", None)
                    if not text:
                        continue
                    return schema.model_validate_json(text)
                except FutureTimeoutError as exc:
                    last_error = ProviderError("The AI service took too long to respond. Please retry.")
                    continue
                except ValidationError as exc:
                    last_error = ProviderError("The AI service returned an invalid response. Please retry.")
                    continue
                except Exception as exc:
                    last_error = exc
                    continue

        if isinstance(last_error, ProviderError):
            raise last_error
        raise ProviderError(f"The AI service is temporarily unavailable: {last_error or 'Please retry.'}")

    def answer(self, question: str, passages: list[dict]) -> GroundedReply:
        context = "\n\n".join(f"[{item['id']}] {item['text']}" for item in passages)
        prompt = (
            "You are a helpful and supportive educational tutor for learners. "
            "Answer ONLY using the numbered lesson passages below. Use simple, clear, and encouraging language. "
            "If the question or passage is in Hindi, reply in clear, natural Hindi. "
            "Keep the answer under 120 words. If the passages do not contain enough evidence, "
            "say that the lesson does not cover it and set passage_ids to []. "
            "Return JSON matching the schema: answer and passage_ids (list of passage id numbers used).\n\n"
            f"Passages:\n{context}\n\nQuestion: {question}"
        )
        reply = self._generate(prompt, GroundedReply, self.settings.tutor_timeout_seconds)
        valid_ids = {item["id"] for item in passages}
        matched_ids = [pid for pid in reply.passage_ids if pid in valid_ids]
        if not matched_ids:
            for pid in reply.passage_ids:
                if isinstance(pid, int) and 1 <= pid <= len(passages):
                    matched_ids.append(passages[pid - 1]["id"])
        if not matched_ids and passages:
            matched_ids = [passages[0]["id"]]
        reply.passage_ids = matched_ids[:3]
        return reply

    def worksheet(
        self,
        brief: dict,
        passages: list[dict],
        formats: list[str],
    ) -> GeneratedWorksheet:
        context = "\n\n".join(
            f"[{item['id']}] Section: {item['heading']} | Passage: {item['text']}" for item in passages
        )
        headings = " | ".join(item["heading"] for item in passages)
        prompt = (
            "Create an original classroom worksheet grounded only in the lesson sections below. "
            f"Class level: {brief['class_level']}. Subject: {brief['subject']}. Topic: {brief['topic']}. "
            f"Difficulty: {brief['difficulty']}. Question count: {brief['count']}. "
            f"Allowed question kinds: {', '.join(formats)}. "
            f"Each source_section must be one of: {headings}. "
            "For mcq provide exactly four choices and put the correct choice text in answer_key. "
            "For fill_blank use _____ in the prompt. For true_false choices must be [\"True\", \"False\"]. "
            "Provide a teacher answer_key and a short explanation for every question. "
            "Return JSON matching the schema.\n\n"
            f"Lesson sections:\n{context}"
        )
        result = self._generate(
            prompt, GeneratedWorksheet, max(self.settings.worksheet_timeout_seconds, 15)
        )
        allowed = set(formats)
        clean = []
        section_names = {item["heading"] for item in passages}
        for question in result.questions:
            if question.kind not in allowed:
                continue
            if question.kind == "mcq" and (not question.choices or len(question.choices) != 4):
                continue
            if question.kind == "true_false":
                question.choices = ["True", "False"]
            if question.source_section not in section_names:
                question.source_section = passages[0]["heading"]
            clean.append(question)
        if not clean:
            raise ProviderError("The AI service did not return usable questions.")
        result.questions = clean
        return result
