"""Shared Gemini generateContent helper for live features."""

from __future__ import annotations

import os
from typing import Any

import httpx

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def gemini_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("VERTEX_API_KEY") or "").strip()


def default_gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def gemini_model_candidates() -> list[str]:
    primary = default_gemini_model()
    fallbacks = [
        primary,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
    ]
    seen: set[str] = set()
    out: list[str] = []
    for name in fallbacks:
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _request_body(
    system: str,
    prompt: str,
    *,
    inline: tuple[str, str] | None,
    temperature: float,
    max_output_tokens: int,
) -> dict[str, Any]:
    parts: list[dict[str, Any]] = [{"text": prompt}]
    if inline:
        mime, data = inline
        parts.append({"inlineData": {"mimeType": mime, "data": data}})
    return {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
        },
    }


def _parse_gemini_response(res: httpx.Response, *, model: str, error_label: str) -> dict[str, Any]:
    if res.status_code >= 400:
        if res.status_code == 429:
            raise RuntimeError(error_label)
        raise RuntimeError(error_label)

    data = res.json()
    candidates = data.get("candidates") if isinstance(data, dict) else None
    if not isinstance(candidates, list) or not candidates:
        raise RuntimeError(error_label)
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
    parts_out = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts_out, list) or not parts_out:
        raise RuntimeError(error_label)
    text = parts_out[0].get("text") if isinstance(parts_out[0], dict) else ""
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError(error_label)

    usage = data.get("usageMetadata") if isinstance(data, dict) else {}
    if not isinstance(usage, dict):
        usage = {}
    return {
        "text": text.strip(),
        "model": data.get("modelVersion") if isinstance(data, dict) else model,
        "inputTokens": usage.get("promptTokenCount") or 0,
        "outputTokens": usage.get("candidatesTokenCount") or 0,
    }


def gemini_generate_json_sync(
    system: str,
    prompt: str,
    *,
    inline: tuple[str, str] | None = None,
    temperature: float = 0.4,
    max_output_tokens: int = 520,
    error_label: str = "Screen analysis failed",
) -> dict[str, Any]:
    api_key = gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini is not configured.")

    body = _request_body(
        system,
        prompt,
        inline=inline,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    last_error = error_label
    with httpx.Client(timeout=90) as client:
        for model in gemini_model_candidates():
            url = GEMINI_URL.format(model=model)
            res = client.post(url, params={"key": api_key}, json=body)
            if res.status_code == 429:
                last_error = error_label
                continue
            if res.status_code >= 400:
                last_error = error_label
                if res.status_code in {401, 403}:
                    break
                continue
            return _parse_gemini_response(res, model=model, error_label=error_label)
    raise RuntimeError(last_error)


async def gemini_generate_json(
    system: str,
    prompt: str,
    *,
    inline: tuple[str, str] | None = None,
    temperature: float = 0.4,
    max_output_tokens: int = 520,
    error_label: str = "Screen analysis failed",
) -> dict[str, Any]:
    api_key = gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini is not configured.")

    body = _request_body(
        system,
        prompt,
        inline=inline,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    last_error = error_label
    async with httpx.AsyncClient(timeout=90) as client:
        for model in gemini_model_candidates():
            url = GEMINI_URL.format(model=model)
            res = await client.post(url, params={"key": api_key}, json=body)
            if res.status_code == 429:
                last_error = error_label
                continue
            if res.status_code >= 400:
                last_error = error_label
                if res.status_code in {401, 403}:
                    break
                continue
            return _parse_gemini_response(res, model=model, error_label=error_label)
    raise RuntimeError(last_error)
