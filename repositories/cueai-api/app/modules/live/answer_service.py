from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from app.modules.live.grounding import grounding_notes, split_briefing
from app.modules.live.guard import GuardResult, guard_live_answer
from app.modules.live.prompts import (
    LIVE_ANSWER_MAX_TOKENS,
    LIVE_HISTORY_MAX,
    build_system_instruction,
    build_user_prompt,
    clamp_confidence,
    infer_mode,
)
from app.modules.live.question import QuestionAnalysis, analyze_question, describe_analysis

from app.modules.live.gemini import gemini_api_key, gemini_generate_json

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# gpt-oss reasons before answering and those tokens count against the completion limit.
GROQ_REASONING_HEADROOM = 150
MAX_IMAGE_B64 = 2_000_000
RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}
logger = logging.getLogger("cueai.live.answer")

_http: httpx.AsyncClient | None = None


class LiveAnswerError(Exception):
    def __init__(
        self,
        message: str,
        status: int = 502,
        *,
        category: str = "unknown",
        retryable: bool = True,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.category = category
        self.retryable = retryable


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.environ.get(name, "").strip()
    try:
        value = float(raw) if raw else default
    except ValueError:
        value = default
    return min(maximum, max(minimum, value))


def _groq_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        _float_env("GROQ_TIMEOUT_SECONDS", 12.0, 3.0, 30.0),
        connect=_float_env("GROQ_CONNECT_TIMEOUT_SECONDS", 4.0, 1.0, 10.0),
    )


def http_client() -> httpx.AsyncClient:
    global _http
    if _http is None or getattr(_http, "is_closed", False):
        _http = httpx.AsyncClient(
            timeout=_groq_timeout(),
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
        )
    return _http


def reset_http_client() -> None:
    global _http
    _http = None


def _groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", "").strip()


def error_category(status: int, exc: BaseException | None = None) -> str:
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return "timeout"
    if isinstance(exc, httpx.RequestError):
        return "network"
    if status == 429:
        return "rate_limit"
    if status in {401, 403}:
        return "auth"
    if status == 400:
        return "invalid_request"
    if status in {408, 409, 500, 502, 503, 504}:
        return "unavailable"
    return "unknown"


def is_retryable_provider_error(status: int, exc: BaseException | None = None) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.RequestError, TimeoutError)):
        return True
    if status in {400, 401, 403}:
        return False
    return status in RETRYABLE_STATUS or status >= 500


def _status_from_groq(res: httpx.Response) -> tuple[int, str, bool]:
    category = error_category(res.status_code)
    if res.status_code == 400:
        return 400, category, False
    if res.status_code in {401, 403}:
        return res.status_code, category, False
    if res.status_code == 429:
        return 429, category, True
    if res.status_code == 408:
        return 504, "timeout", True
    return 502, category, is_retryable_provider_error(res.status_code)


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


async def _groq_json(system: str, prompt: str, max_tokens: int = LIVE_ANSWER_MAX_TOKENS) -> dict[str, Any]:
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    client = http_client()
    try:
        res = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {_groq_key()}"},
            json={
                "model": model,
                "temperature": 0.4,
                "max_tokens": max_tokens + GROQ_REASONING_HEADROOM,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": f'{prompt}\n\nReturn JSON only: {{"answer":"speakable reply","confidence":0.0}}',
                    },
                ],
            },
        )
    except httpx.TimeoutException as exc:
        raise LiveAnswerError(
            "Live answer provider timed out.",
            504,
            category="timeout",
            retryable=True,
        ) from exc
    except httpx.RequestError as exc:
        raise LiveAnswerError(
            "Live answer provider is unavailable.",
            502,
            category="network",
            retryable=True,
        ) from exc
    if res.status_code >= 400:
        status, category, retryable = _status_from_groq(res)
        message = (
            "Groq API key is invalid or unauthorized."
            if category == "auth"
            else "Live answer provider failed."
        )
        raise LiveAnswerError(message, status, category=category, retryable=retryable)
    data = res.json()
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage") or {}
    return {
        "text": text,
        "model": data.get("model") or model,
        "inputTokens": usage.get("prompt_tokens") or 0,
        "outputTokens": usage.get("completion_tokens") or 0,
    }


def image_inline_parts(raw: str) -> tuple[str, str] | None:
    parsed = parse_inline_image(raw)
    if not parsed:
        return None
    header, data = parsed.split(";base64,", 1)
    mime = header.removeprefix("data:") or "image/png"
    return mime, data


async def _gemini_json(
    system: str,
    prompt: str,
    inline: tuple[str, str] | None = None,
    max_output_tokens: int = LIVE_ANSWER_MAX_TOKENS,
) -> dict[str, Any]:
    try:
        return await gemini_generate_json(
            system,
            prompt,
            inline=inline,
            temperature=0.4,
            max_output_tokens=max_output_tokens,
            error_label="Live answer provider failed.",
            timeout=_float_env("GEMINI_TIMEOUT_SECONDS", 14.0, 4.0, 40.0),
            max_attempts=2,
        )
    except RuntimeError as exc:
        raise LiveAnswerError("Live answer provider failed.", 502, category="unavailable") from exc


def parse_inline_image(raw: object) -> str | None:
    """Match Next.js: invalid or oversized images are ignored, not rejected."""
    if not isinstance(raw, str) or not raw.startswith("data:image/"):
        return None
    marker = ";base64,"
    if marker not in raw:
        return None
    b64 = raw.split(marker, 1)[1]
    if not b64 or len(b64) > MAX_IMAGE_B64:
        return None
    return raw


async def analyze_with_qwen(image: str, prompt: str, session_context: str) -> dict[str, Any] | None:
    base = os.environ.get("CUEAI_QWEN_VL_URL", "http://127.0.0.1:39292").rstrip("/")
    client = http_client()
    try:
        status = await client.get(f"{base}/status")
        if status.status_code >= 400:
            return None
        info = status.json()
        if not info.get("ready"):
            return None
        res = await client.post(
            f"{base}/analyze",
            json={"image": image, "prompt": prompt, "sessionContext": session_context},
        )
    except httpx.RequestError:
        return None
    if res.status_code >= 400:
        return None
    data = res.json()
    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return None
    return {
        "ok": True,
        "answer": answer.strip(),
        "confidence": data.get("confidence") if isinstance(data.get("confidence"), (int, float)) else 0.78,
        "model": data.get("model") or "Qwen/Qwen2.5-VL-3B-Instruct",
        "provider": "qwen",
    }


async def iter_groq_tokens(system: str, prompt: str, max_tokens: int = LIVE_ANSWER_MAX_TOKENS):
    """Yield incremental Groq SSE text deltas. Does not buffer the full answer first."""
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    client = http_client()
    try:
        async with client.stream(
            "POST",
            GROQ_URL,
            headers={"Authorization": f"Bearer {_groq_key()}"},
            json={
                "model": model,
                "temperature": 0.35,
                "max_tokens": max_tokens + GROQ_REASONING_HEADROOM,
                "stream": True,
                "messages": [
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": prompt
                        + "\n\nReply with the speakable interview answer only. No JSON. No preamble.",
                    },
                ],
            },
        ) as res:
            if res.status_code >= 400:
                status, category, retryable = _status_from_groq(res)
                raise LiveAnswerError(
                    "Live answer provider failed.",
                    status,
                    category=category,
                    retryable=retryable,
                )
            async for line in res.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = (
                    payload.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content")
                )
                if isinstance(delta, str) and delta:
                    yield delta, payload.get("model") or model
    except httpx.TimeoutException as exc:
        raise LiveAnswerError(
            "Live answer provider timed out.",
            504,
            category="timeout",
            retryable=True,
        ) from exc
    except httpx.RequestError as exc:
        raise LiveAnswerError(
            "Live answer provider is unavailable.",
            502,
            category="network",
            retryable=True,
        ) from exc


def parse_answer(text: str) -> tuple[str, float]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return text, 0.7
    if isinstance(parsed, str):
        return parsed.strip() or text, 0.7
    if not isinstance(parsed, dict):
        return text, 0.7
    answer = parsed.get("answer")
    if isinstance(answer, str) and answer.strip():
        return answer.strip(), clamp_confidence(parsed.get("confidence"))
    return text, 0.7


@dataclass
class LivePlan:
    system: str
    user_prompt: str
    session_context: str
    analysis: QuestionAnalysis
    mode: str
    max_tokens: int
    #: Everything the answer may legitimately draw facts from, for the claim guard.
    evidence: str

    def guard(self, answer: str) -> GuardResult:
        answer_mode = self.mode == "answer"
        return guard_live_answer(
            answer,
            context=self.evidence,
            response_type=self.analysis.response_type if answer_mode else None,
            language=self.analysis.language,
            personal=answer_mode and self.analysis.needs_personal_context,
        )


def _parse_history(raw: object) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    rows = [
        {"question": str(r.get("question") or "")[:600], "answer": str(r.get("answer") or "")[:1500]}
        for r in raw
        if isinstance(r, dict) and str(r.get("question") or "").strip()
    ]
    return rows[-LIVE_HISTORY_MAX:]


def build_prompts(body: dict[str, Any]) -> tuple[str, str, str]:
    plan = plan_live_answer(body)
    return plan.system, plan.user_prompt, plan.session_context


def plan_live_answer(body: dict[str, Any]) -> LivePlan:
    prompt = str(body.get("prompt") or "").strip()
    mode = body.get("mode")
    if mode not in {"answer", "summarize", "actions", "risks", "explain", "screen"}:
        mode = infer_mode(prompt)
    transcript = body.get("transcript") if isinstance(body.get("transcript"), list) else []
    transcript = [row for row in transcript if isinstance(row, dict)]
    history = _parse_history(body.get("history"))
    session_context = str(body.get("sessionContext") or "")
    from app.modules.live.context import (
        active_meeting_document_ids,
        active_meeting_id,
        retrieve_knowledge,
    )

    mid = active_meeting_id()
    if body.get("skipKnowledge") is True:
        knowledge = ""
    else:
        knowledge = str(body.get("knowledgeContext") or "") or retrieve_knowledge(
            prompt,
            limit=2 if body.get("stream") is True else 3,
            max_chars=700 if body.get("stream") is True else 900,
            meeting_id=mid,
            document_ids=active_meeting_document_ids(),
        )
    analysis = analyze_question(prompt, history=history, transcript=transcript, uncertain=body.get("uncertain") is True)
    answer_mode = mode == "answer" and not parse_inline_image(body.get("image"))
    system = build_system_instruction("", "CANDIDATE RESUME" in session_context or bool(session_context.strip()))
    user_prompt = build_user_prompt(
        prompt=prompt,
        transcript=transcript,
        mode=str(mode),
        session_context=session_context,
        knowledge_context=knowledge,
        history=history,
        analysis=describe_analysis(analysis, history) if answer_mode else "",
        grounding=grounding_notes(prompt, analysis, split_briefing(session_context)) if answer_mode else "",
    )
    evidence = "\n".join(
        [session_context, knowledge, *(h["answer"] for h in history), *(str(t.get("text", "")) for t in transcript)]
    )
    return LivePlan(
        system=system,
        user_prompt=user_prompt,
        session_context=session_context,
        analysis=analysis,
        mode=str(mode),
        max_tokens=analysis.max_tokens if answer_mode else LIVE_ANSWER_MAX_TOKENS,
        evidence=evidence,
    )


def _can_fallback(error: LiveAnswerError, gemini: str) -> bool:
    if not gemini:
        return False
    if error.status == 400 or error.category == "invalid_request":
        return False
    return error.retryable or error.category == "auth"


async def generate_live_answer(
    body: dict[str, Any],
    *,
    skip_primary: bool = False,
    request_id: str | None = None,
) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        raise LiveAnswerError("prompt is required.", 400, category="invalid_request", retryable=False)

    rid = request_id or uuid.uuid4().hex[:12]
    groq = _groq_key()
    gemini = gemini_api_key()
    if not groq and not gemini:
        raise LiveAnswerError("AI provider is not configured.", 503, category="auth", retryable=False)
    if skip_primary and not gemini:
        raise LiveAnswerError("Fallback AI provider is not configured.", 503, category="auth", retryable=False)
    if not groq and gemini:
        logger.warning(
            "live_answer request_id=%s groq_configured=false fallback=gemini",
            rid,
        )

    context_started = time.perf_counter()
    plan = plan_live_answer(body)
    system, user_prompt, session_context = plan.system, plan.user_prompt, plan.session_context
    context_ms = _ms(context_started)

    image = parse_inline_image(body.get("image"))
    if image:
        try:
            local = await analyze_with_qwen(image, user_prompt, session_context)
        except Exception:
            local = None
        if local:
            return {**local, "answer": plan.guard(str(local.get("answer") or "")).answer}
        if gemini:
            try:
                inline = image_inline_parts(image)
                result = await _gemini_json(system, user_prompt, inline)
                answer, confidence = parse_answer(result["text"])
                return {
                    "ok": True,
                    "answer": plan.guard(answer).answer,
                    "confidence": confidence,
                    "model": result["model"],
                    "provider": "gemini",
                }
            except LiveAnswerError:
                pass

    provider = "groq"
    fallback_reason = ""
    generate_started = time.perf_counter()
    if skip_primary or not groq:
        if not gemini:
            raise LiveAnswerError("AI provider is not configured.", 503, category="auth", retryable=False)
        result = await _gemini_json(system, user_prompt, max_output_tokens=plan.max_tokens)
        provider = "gemini"
        fallback_reason = "skip_primary" if skip_primary else "groq_unconfigured"
    else:
        try:
            result = await _groq_json(system, user_prompt, plan.max_tokens)
            provider = "groq"
        except LiveAnswerError as exc:
            if not _can_fallback(exc, gemini):
                logger.warning(
                    "live_answer request_id=%s provider=groq error_category=%s status=%s fallback=none latency_ms=%s context_ms=%s",
                    rid,
                    exc.category,
                    exc.status,
                    _ms(generate_started),
                    context_ms,
                )
                raise
            fallback_reason = exc.category
            logger.warning(
                "live_answer request_id=%s provider=groq error_category=%s status=%s fallback=gemini",
                rid,
                exc.category,
                exc.status,
            )
            result = await _gemini_json(system, user_prompt, max_output_tokens=plan.max_tokens)
            provider = "gemini"

    answer, confidence = parse_answer(result["text"])
    guarded = plan.guard(answer)
    logger.info(
        "live_answer request_id=%s provider=%s type=%s category=%s latency_ms=%s context_ms=%s fallback_reason=%s guard=%s validation=%s",
        rid,
        provider,
        plan.analysis.response_type,
        plan.analysis.category,
        _ms(generate_started),
        context_ms,
        fallback_reason or "-",
        ",".join(guarded.changes) or "-",
        guarded.validation_status,
    )
    return {
        "ok": True,
        "answer": guarded.answer,
        "confidence": confidence,
        "model": result["model"],
        "provider": provider,
        "requestId": rid,
        "validationStatus": guarded.validation_status,
        "timings": {
            "contextMs": context_ms,
            "generateMs": _ms(generate_started),
        },
    }
