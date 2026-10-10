from __future__ import annotations

from typing import Any

import json
import logging
import time
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.modules.live.answer_service import (
    LiveAnswerError,
    _groq_key,
    build_prompts,
    generate_live_answer,
    iter_groq_tokens,
)
from app.modules.live.gemini import gemini_api_key
from app.modules.live.screen_service import ScreenAnalysisError, enqueue_screen_analysis
from app.core.session import SESSION_COOKIE, verify_session
from app.modules.live.context import active_meeting_id, append_exchange, record_usage

router = APIRouter(prefix="/live", tags=["live"])
logger = logging.getLogger("cueai.live.router")

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-CueAI-Device-Id, X-CueAI-Device-Credential",
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


def _require_session(request: Request) -> dict[str, str] | JSONResponse:
    """Option A: Next authenticates (session or device) and forwards a signed cueai_admin_session."""
    session = _optional_session(request)
    if session:
        return session
    return JSONResponse({"error": "Unauthorized"}, status_code=401, headers=_CORS)


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


@router.post("/answer")
async def live_answer(request: Request, body: dict[str, Any]):
    """Requires the existing HMAC session cookie minted by Next after browser or device auth."""
    session = _require_session(request)
    if isinstance(session, JSONResponse):
        return session
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()
    try:
        if body.get("stream") is True:
            async def events():
                try:
                    if body.get("image") or not _groq_key():
                        payload = await generate_live_answer(body, request_id=request_id)
                        text = str(payload.get("answer") or "")
                        if text:
                            yield _sse({"type": "token", "text": text})
                        yield _sse({
                            "type": "done",
                            "answer": text,
                            "confidence": payload.get("confidence", 0.78),
                            "model": payload.get("model"),
                            "provider": payload.get("provider"),
                            "requestId": request_id,
                        })
                        return
                    system, user_prompt, _session = build_prompts(body)
                    parts: list[str] = []
                    model = ""
                    first_token_ms: int | None = None
                    try:
                        async for delta, used in iter_groq_tokens(system, user_prompt):
                            if first_token_ms is None:
                                first_token_ms = _ms(started)
                            parts.append(delta)
                            model = used
                            yield _sse({"type": "token", "text": delta})
                    except LiveAnswerError as exc:
                        if parts:
                            logger.warning(
                                "live_answer_stream request_id=%s provider=groq error_category=%s interrupted_after_tokens=true",
                                request_id,
                                exc.category,
                            )
                            yield _sse({
                                "type": "error",
                                "error": "Answer stream interrupted. Ask again if the reply looks incomplete.",
                                "requestId": request_id,
                            })
                            return
                        if gemini_api_key() and exc.status != 400:
                            logger.warning(
                                "live_answer_stream request_id=%s provider=groq error_category=%s fallback=gemini",
                                request_id,
                                exc.category,
                            )
                            payload = await generate_live_answer(
                                body,
                                skip_primary=True,
                                request_id=request_id,
                            )
                            text = str(payload.get("answer") or "")
                            if text:
                                yield _sse({"type": "token", "text": text})
                            yield _sse({
                                "type": "done",
                                "answer": text,
                                "confidence": payload.get("confidence", 0.78),
                                "model": payload.get("model"),
                                "provider": payload.get("provider"),
                                "requestId": request_id,
                            })
                            append_exchange(
                                active_meeting_id(),
                                str(body.get("prompt") or ""),
                                text,
                                provider=str(payload.get("provider") or "gemini"),
                                model=str(payload.get("model") or ""),
                            )
                            record_usage(
                                session,
                                provider=str(payload.get("provider") or "gemini"),
                                model=str(payload.get("model") or ""),
                                total=1,
                                feature="live_answer_stream",
                            )
                            return
                        yield _sse({"type": "error", "error": str(exc), "requestId": request_id})
                        return
                    text = "".join(parts)
                    logger.info(
                        "live_answer_stream request_id=%s provider=groq ttft_ms=%s total_ms=%s",
                        request_id,
                        first_token_ms if first_token_ms is not None else -1,
                        _ms(started),
                    )
                    yield _sse({
                        "type": "done",
                        "answer": text,
                        "confidence": 0.78,
                        "model": model,
                        "provider": "groq",
                        "requestId": request_id,
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
                    yield _sse({"type": "error", "error": str(exc), "requestId": request_id})

            return StreamingResponse(
                events(),
                media_type="text/event-stream",
                headers={**_CORS, "Cache-Control": "no-cache, no-transform"},
            )
        payload = await generate_live_answer(body, request_id=request_id)
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
        return JSONResponse({"error": str(exc), "requestId": request_id}, status_code=exc.status, headers=_CORS)
    return JSONResponse(payload, headers=_CORS)


@router.post("/screen")
async def live_screen(request: Request, body: dict[str, Any]):
    session = _require_session(request)
    if isinstance(session, JSONResponse):
        return session
    try:
        payload = await enqueue_screen_analysis(body, session)
    except ScreenAnalysisError as exc:
        return JSONResponse({"error": str(exc)}, status_code=exc.status, headers=_CORS)
    return JSONResponse(payload, headers=_CORS)
