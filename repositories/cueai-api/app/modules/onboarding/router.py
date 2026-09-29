from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.deps import RequireAuth
from app.modules.onboarding.sanitize import is_onboarding_answered, sanitize_onboarding_answers
from app.persistence.store import append_audit, read_store, update_store

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardingPutBody(BaseModel):
    answers: Any = None
    skipped: bool | None = None


@router.get("")
async def get_onboarding(session: RequireAuth) -> dict[str, Any]:
    store = read_store()
    profile = next(
        (u.get("onboarding") for u in store["users"] if u["id"] == session["userId"]),
        None,
    ) or {}
    return {
        "completed": bool(profile.get("completedAt")),
        "skipped": bool(profile.get("skipped")),
        "answers": profile or {},
    }


@router.put("")
async def put_onboarding(body: OnboardingPutBody, session: RequireAuth) -> dict[str, Any]:
    skipped = body.skipped is True
    answers = sanitize_onboarding_answers(body.answers)
    if not skipped and not is_onboarding_answered(answers):
        return JSONResponse(
            {"error": "Please answer the required questions before continuing."},
            status_code=400,
        )

    now = _iso_now()
    holder: dict[str, Any] = {}

    def mutate(store: dict[str, Any]) -> None:
        user = next((u for u in store["users"] if u["id"] == session["userId"]), None)
        if not user:
            return
        first_time = not (user.get("onboarding") or {}).get("completedAt")
        existing = user.get("onboarding") or {}
        saved_local = {
            **answers,
            "completedAt": existing.get("completedAt") or now,
            "skipped": skipped,
            "updatedAt": now,
        }
        user["onboarding"] = saved_local
        holder["saved"] = saved_local
        append_audit(
            store,
            {
                "actorId": user["id"],
                "actorName": user["name"],
                "action": "user.onboarding_completed" if first_time else "user.onboarding_updated",
                "resourceType": "user",
                "resourceId": user["id"],
                "metadata": {
                    "skipped": skipped,
                    "persona": answers.get("persona"),
                    "goals": ",".join(answers.get("goals") or []),
                },
                "workspaceId": user.get("workspaceId"),
            },
        )

    update_store(mutate)
    saved = holder.get("saved") or {
        **answers,
        "completedAt": now,
        "skipped": skipped,
        "updatedAt": now,
    }
    return {"completed": True, "skipped": skipped, "answers": saved}


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
