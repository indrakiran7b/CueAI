from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.jobs import get_job

router = APIRouter(prefix="/jobs", tags=["jobs"])

_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
}


@router.options("/{job_id}")
async def job_status_options(job_id: str) -> JSONResponse:
    return JSONResponse({}, headers=_CORS)


@router.get("/{job_id}")
async def job_status(job_id: str) -> JSONResponse:
    job = await get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found."}, status_code=404, headers=_CORS)
    return JSONResponse(job, headers=_CORS)
