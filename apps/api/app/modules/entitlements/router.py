from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.deps import RequireAuth
from app.modules.entitlements.service import entitlements_for_user
from app.persistence.store import read_store

router = APIRouter(prefix="/entitlements", tags=["entitlements"])


@router.get("/me")
async def entitlements_me(session: RequireAuth) -> dict[str, Any]:
    store = read_store()
    user = next((u for u in store["users"] if u["id"] == session["userId"]), None)
    if not user:
        user = {
            "role": session.get("role"),
            "plan": session.get("plan"),
        }
    return entitlements_for_user(user)
