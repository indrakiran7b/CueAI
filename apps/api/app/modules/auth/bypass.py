from __future__ import annotations

import uuid
from typing import Any

from app.core.auth_mode import BYPASS_LOGIN_EMAIL, BYPASS_PASSWORD
from app.core.session import hash_password
from app.persistence.store import append_audit, update_store


def _name_from_email(email: str) -> str:
    local = email.split("@", 1)[0] or "Tester"
    parts = [p for p in local.replace("+", ".").split(".") if p]
    return " ".join(p[:1].upper() + p[1:] for p in parts) or "Tester"


def generate_bypass_signup_email() -> str:
    return f"tester-{uuid.uuid4().hex[:6]}@cueai.local"


def resolve_bypass_user(
    *,
    email: str | None = None,
    name: str | None = None,
    complete_onboarding: bool,
) -> tuple[dict[str, Any], str, str]:
    normalized_email = (email or "").strip().lower() or BYPASS_LOGIN_EMAIL
    display_name = (name or "").strip()
    now = _iso_now()
    user_id = ""

    def mutate(store: dict[str, Any]) -> None:
        nonlocal user_id
        users = store["users"]
        user = next((u for u in users if u["email"] == normalized_email), None)
        if user is None:
            user = {
                "id": f"usr_{uuid.uuid4().hex[:10]}",
                "name": display_name or _name_from_email(normalized_email),
                "email": normalized_email,
                "passwordHash": hash_password(BYPASS_PASSWORD),
                "role": "Admin",
                "status": "Active",
                "workspaceId": store["workspace"]["id"],
                "createdAt": now,
            }
            users.append(user)
            append_audit(
                store,
                {
                    "actorId": user["id"],
                    "actorName": user["name"],
                    "action": "user.signed_up",
                    "resourceType": "user",
                    "resourceId": user["id"],
                    "metadata": {"role": user["role"], "bypass": True},
                    "workspaceId": user["workspaceId"],
                },
            )

        user["status"] = "Active"
        if not user.get("passwordHash"):
            user["passwordHash"] = hash_password(BYPASS_PASSWORD)
        if display_name:
            user["name"] = display_name
        user["lastActiveAt"] = now

        if complete_onboarding and not (user.get("onboarding") or {}).get("completedAt"):
            onboarding = dict(user.get("onboarding") or {})
            onboarding.update(
                {"completedAt": now, "skipped": True, "updatedAt": now},
            )
            user["onboarding"] = onboarding

        user_id = user["id"]

    store = update_store(mutate)
    user = next(u for u in store["users"] if u["id"] == user_id)
    workspace_id = user.get("workspaceId") or store["workspace"]["id"]
    return user, store["workspace"]["name"], workspace_id


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
