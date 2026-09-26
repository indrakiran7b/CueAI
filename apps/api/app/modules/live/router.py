from __future__ import annotations

from typing import Any

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.modules.live.answer_service import (
    LiveAnswerError,
    _groq_key,
    build_prompts,
    generate_live_answer,
    iter_groq_tokens,
)
from app.modules.live.screen_service import ScreenAnalysisError, enqueue_screen_analysis
from app.core.session import SESSION_COOKIE, verify_session
from app.modules.live.context import active_meeting_id, append_exchange, record_usage

router = APIRouter(prefix="/live", tags=["live"])

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
}


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.options("/answer")
async def live_answer_options() -> JSONResponse:
    return JSONResponse({}, headers=_CORS)


@router.options("/screen")
async def live_screen_options() -> JSONResponse:
    return JSONResponse({}, headers=_CORS)


def _optional_session(request: Request) -> dict[str, str] | None:
    payload = verify_session(request.cookies.get(SESSION_COOKIE))
    user_id = payload.get("userId") if payload else None
    if not isinstance(user_id, str) or not user_id:
        return None
    return {
        "userId": user_id,
        "workspaceId": str(payload.get("workspaceId") or ""),
        "name": str(payload.get("name") or ""),
    }


@router.post("/answer")
async def live_answer(request: Request, body: dict[str, Any]):
    """Session cookie is optional. An invalid cookie is ignored, not trusted."""
    session = _optional_session(request)
    try:
        if body.get("stream") is True:
            async def events():
                try:
                    if not _groq_key():
                        payload = await generate_live_answer(body)
                        text = str(payload.get("answer") or "")
                        if text:
                            yield _sse({"type": "token", "text": text})
                        yield _sse({
                            "type": "done",
                            "answer": text,
                            "confidence": payload.get("confidence", 0.78),
                            "model": payload.get("model"),
                            "provider": payload.get("provider"),
                        })
                        return
                    system, user_prompt, _session = build_prompts(body)
                    parts: list[str] = []
                    model = ""
                    async for delta, used in iter_groq_tokens(system, user_prompt):
                        parts.append(delta)
                        model = used
                        yield _sse({"type": "token", "text": delta})
                    text = "".join(parts)
                    yield _sse({
                        "type": "done",
                        "answer": text,
                        "confidence": 0.78,
                        "model": model,
                        "provider": "groq",
                    })
                    append_exchange(
                        active_meeting_id(),
                        str(body.get("prompt") or ""),
                        text,
                        provider="groq",
                        model=model,
                    )
                    record_usage(
                        session,
                        provider="groq",
                        model=model,
                        total=1,
                        feature="live_answer_stream",
                    )
                except LiveAnswerError as exc:
                    yield _sse({"type": "error", "error": str(exc)})

            return StreamingResponse(
                events(),
                media_type="text/event-stream",
                headers={**_CORS, "Cache-Control": "no-cache, no-transform"},
            )
        payload = await generate_live_answer(body)
        record_usage(
            session,
            provider=str(payload.get("provider") or ""),
            model=str(payload.get("model") or ""),
            total=1,
            feature="live_answer",
        )
        append_exchange(
            active_meeting_id(),
            str(body.get("prompt") or ""),
            str(payload.get("answer") or ""),
            provider=str(payload.get("provider") or ""),
            model=str(payload.get("model") or ""),
        )
    except LiveAnswerError as exc:
        return JSONResponse({"error": str(exc)}, status_code=exc.status, headers=_CORS)
    return JSONResponse(payload, headers=_CORS)


@router.post("/screen")
async def live_screen(request: Request, body: dict[str, Any]):
    session = _optional_session(request)
    try:
        payload = await enqueue_screen_analysis(body, session)
    except ScreenAnalysisError as exc:
        return JSONResponse({"error": str(exc)}, status_code=exc.status, headers=_CORS)
    return JSONResponse(payload, headers=_CORS)
