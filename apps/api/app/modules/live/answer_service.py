from __future__ import annotations

import json
import os
from typing import Any

import httpx

from app.modules.live.prompts import (
    LIVE_ANSWER_MAX_TOKENS,
    build_system_instruction,
    build_user_prompt,
    clamp_confidence,
    infer_mode,
)

from app.modules.live.gemini import gemini_api_key, gemini_generate_json

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_IMAGE_B64 = 2_000_000


class LiveAnswerError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def _groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", "").strip()


async def _groq_json(system: str, prompt: str) -> dict[str, Any]:
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {_groq_key()}"},
            json={
                "model": model,
                "temperature": 0.4,
                "max_tokens": LIVE_ANSWER_MAX_TOKENS,
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
    if res.status_code >= 400:
        raise LiveAnswerError("Live answer provider failed.", 429 if res.status_code == 429 else 502)
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
) -> dict[str, Any]:
    try:
        return await gemini_generate_json(
            system,
            prompt,
            inline=inline,
            temperature=0.4,
            max_output_tokens=LIVE_ANSWER_MAX_TOKENS,
            error_label="Live answer provider failed.",
        )
    except RuntimeError as exc:
        raise LiveAnswerError("Live answer provider failed.", 502) from exc


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
    async with httpx.AsyncClient(timeout=30) as client:
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


async def iter_groq_tokens(system: str, prompt: str):
    """Yield incremental Groq SSE text deltas. Does not buffer the full answer first."""
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            GROQ_URL,
            headers={"Authorization": f"Bearer {_groq_key()}"},
            json={
                "model": model,
                "temperature": 0.35,
                "max_tokens": LIVE_ANSWER_MAX_TOKENS,
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
                raise LiveAnswerError("Live answer provider failed.", 502)
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


def build_prompts(body: dict[str, Any]) -> tuple[str, str, str]:
    prompt = str(body.get("prompt") or "").strip()
    mode = body.get("mode")
    if mode not in {"answer", "summarize", "actions", "risks", "explain", "screen"}:
        mode = infer_mode(prompt)
    transcript = body.get("transcript") if isinstance(body.get("transcript"), list) else []
    session_context = str(body.get("sessionContext") or "")
    from app.modules.live.context import retrieve_knowledge

    knowledge = str(body.get("knowledgeContext") or "") or retrieve_knowledge(
        prompt,
        limit=2 if body.get("stream") is True else 3,
        max_chars=700 if body.get("stream") is True else 900,
    )
    system = build_system_instruction("", "CANDIDATE RESUME" in session_context or bool(session_context.strip()))
    user_prompt = build_user_prompt(
        prompt=prompt,
        transcript=[row for row in transcript if isinstance(row, dict)],
        mode=str(mode),
        session_context=session_context,
        knowledge_context=knowledge,
    )
    return system, user_prompt, session_context


async def generate_live_answer(body: dict[str, Any]) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        raise LiveAnswerError("prompt is required.", 400)

    groq = _groq_key()
    gemini = gemini_api_key()
    if not groq and not gemini:
        raise LiveAnswerError(
            "No AI key is configured. Add GROQ_API_KEY (primary) and/or GEMINI_API_KEY to the server environment.",
            503,
        )

    system, user_prompt, session_context = build_prompts(body)

    image = parse_inline_image(body.get("image"))
    if image:
        try:
            local = await analyze_with_qwen(image, user_prompt, session_context)
        except Exception:
            local = None
        if local:
            return local
        if gemini:
            try:
                inline = image_inline_parts(image)
                result = await _gemini_json(system, user_prompt, inline)
                answer, confidence = parse_answer(result["text"])
                return {
                    "ok": True,
                    "answer": answer,
                    "confidence": confidence,
                    "model": result["model"],
                    "provider": "gemini",
                }
            except LiveAnswerError:
                pass

    provider = "groq"
    if groq:
        try:
            result = await _groq_json(system, user_prompt)
        except LiveAnswerError:
            if not gemini:
                raise
            result = await _gemini_json(system, user_prompt)
            provider = "gemini"
    else:
        result = await _gemini_json(system, user_prompt)
        provider = "gemini"

    answer, confidence = parse_answer(result["text"])
    return {
        "ok": True,
        "answer": answer,
        "confidence": confidence,
        "model": result["model"],
        "provider": provider,
    }
