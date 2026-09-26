from __future__ import annotations

from typing import Annotated, Any

from fastapi import Cookie, Depends, HTTPException, Request

from app.core.auth_mode import auth_bypass
from app.core.roles import normalize_role
from app.core.session import SESSION_COOKIE, verify_session
from app.persistence.store import read_store


def _bypass_session() -> dict[str, Any]:
    return {
        "userId": "dev-guest",
        "email": "user@cueai.local",
        "name": "User",
        "role": "Admin",
        "workspaceId": "ws_default",
        "workspace": "Your Workspace",
        "exp": 2**31 - 1,
    }


async def get_session_payload(
    request: Request,
    cueai_admin_session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, Any] | None:
    if auth_bypass():
        return _bypass_session()

    token = cueai_admin_session or request.cookies.get(SESSION_COOKIE)
    session = verify_session(token)
    if not session:
        return None

    store = read_store()
    user = next((u for u in store["users"] if u["id"] == session.get("userId")), None)
    if not user or user.get("status") == "Deactivated":
        return None

    return {
        **session,
        "role": normalize_role(user.get("role")),
        "name": user["name"],
        "email": user["email"],
        "workspace": store["workspace"]["name"],
        "workspaceId": user.get("workspaceId") or store["workspace"]["id"],
        "plan": user.get("plan"),
    }


async def require_auth(
    session: Annotated[dict[str, Any] | None, Depends(get_session_payload)],
) -> dict[str, Any]:
    if not session:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return session


RequireAuth = Annotated[dict[str, Any], Depends(require_auth)]
