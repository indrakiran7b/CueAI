from __future__ import annotations

from typing import Literal

from app.core.roles import can_access_admin

CuePlan = Literal["free", "premium"]

FREE_MEETING_QA_LIMIT = 5


def resolve_plan(value: str | None) -> CuePlan:
    raw = str(value or "").strip().lower()
    if raw in {"premium", "pro", "enterprise"}:
        return "premium"
    return "free"


def can_view_full_transcript(*, role: str | None, plan: str | None) -> bool:
    """Same gate as full Q&A: admin or premium plan."""
    return can_view_full_meeting_qa(role=role, plan=plan)


def can_view_full_meeting_qa(
    *,
    role: str | None,
    plan: str | None,
) -> bool:
    if can_access_admin(role):
        return True
    return resolve_plan(plan) == "premium"


def entitlements_for_user(user: dict) -> dict:
    plan = resolve_plan(user.get("plan"))
    role = user.get("role")
    return {
        "plan": plan,
        "freeMeetingQaLimit": FREE_MEETING_QA_LIMIT,
        "canViewFullMeetingQa": can_view_full_meeting_qa(role=role, plan=plan),
        "canAccessAdmin": can_access_admin(role),
    }
