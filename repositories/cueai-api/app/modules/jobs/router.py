from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.jobs import get_job
from app.core.session import SESSION_COOKIE, verify_session

router = APIRouter(prefix="/jobs", tags=["jobs"])

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-CueAI-Device-Id, X-CueAI-Device-Credential",
}


def _require_session(request: Request) -> dict[str, Any] | JSONResponse:
    payload = verify_session(request.cookies.get(SESSION_COOKIE))
    user_id = payload.get("userId") if payload else None
    if not isinstance(user_id, str) or not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401, headers=_CORS)
    return {
        "userId": user_id,
        "workspaceId": str(payload.get("workspaceId") or ""),
        "name": str(payload.get("name") or ""),
    }


@router.options("/{job_id}")
async def job_status_options(job_id: str) -> JSONResponse:
    return JSONResponse({}, headers=_CORS)


@router.get("/{job_id}")
async def job_status(job_id: str, request: Request) -> JSONResponse:
    session = _require_session(request)
    if isinstance(session, JSONResponse):
        return session
    job = await get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found."}, status_code=404, headers=_CORS)
    meta = job.get("meta") if isinstance(job.get("meta"), dict) else {}
    owner = meta.get("session") if isinstance(meta.get("session"), dict) else {}
    owner_id = owner.get("userId")
    if not isinstance(owner_id, str) or owner_id != session["userId"]:
        return JSONResponse({"error": "Job not found."}, status_code=404, headers=_CORS)
    return JSONResponse(job, headers=_CORS)
