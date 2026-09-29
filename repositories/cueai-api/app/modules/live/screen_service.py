from __future__ import annotations

import re
import uuid
from typing import Any

from app.core.jobs import create_job
from app.modules.live.answer_service import parse_inline_image
from app.modules.live.gemini import gemini_api_key
MAX_IMAGE_DATA_URL_CHARS = 6_000_000


class ScreenAnalysisError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def validate_screen_request(body: dict[str, Any]) -> tuple[str, str, str]:
    image = body.get("image")
    if not isinstance(image, str) or not image.startswith("data:image/"):
        raise ScreenAnalysisError("Screenshot image is required.", 400)
    if len(image) > MAX_IMAGE_DATA_URL_CHARS:
        raise ScreenAnalysisError("Screenshot is too large. Try again.", 413)

    match = re.match(r"^data:([^;]+);base64,(.+)$", image)
    if not match or not match.group(1).startswith("image/") or not match.group(2).strip():
        raise ScreenAnalysisError("Invalid screenshot image payload.", 400)

    prompt = str(body.get("prompt") or "").strip()
    recent_context = str(body.get("recentContext") or "").strip()
    return image, prompt, recent_context


async def enqueue_screen_analysis(
    body: dict[str, Any],
    session: dict[str, Any] | None,
) -> dict[str, str]:
    if not gemini_api_key():
        raise ScreenAnalysisError(
            "Unable to analyze the screen. Add GEMINI_API_KEY to the server environment.",
            503,
        )

    image, prompt, recent_context = validate_screen_request(body)
    if parse_inline_image(image) is None:
        raise ScreenAnalysisError("Invalid screenshot image payload.", 400)

    job_id = str(uuid.uuid4())
    meta: dict[str, Any] = {}
    if session:
        meta["session"] = {
            "userId": session.get("userId"),
            "workspaceId": session.get("workspaceId"),
            "name": session.get("name"),
        }

    await create_job(job_id, job_type="screen", meta=meta or None)
    from app.tasks.vision import analyze_screen_task

    analyze_screen_task.apply_async(
        args=[job_id, image, prompt, recent_context],
        queue="ai.vision",
    )
    return {"jobId": job_id}
