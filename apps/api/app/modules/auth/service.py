from __future__ import annotations

import os
import re
import uuid
from typing import Any

from app.core.auth_mode import credentials_bypass
from app.core.roles import normalize_role, permissions_for
from app.core.session import (
    hash_password,
    session_cookie_kwargs,
    sign_session,
    verify_password,
)
from app.modules.auth.bypass import generate_bypass_signup_email, resolve_bypass_user
from app.persistence.store import append_audit, public_user, read_store, update_store


def _session_token(
    *,
    user_id: str,
    email: str,
    name: str,
    role: str,
    workspace_id: str,
    workspace: str,
) -> str:
    return sign_session(
        {
            "userId": user_id,
            "email": email,
            "name": name,
            "role": normalize_role(role),
            "workspaceId": workspace_id,
            "workspace": workspace,
        },
    )


def login(email: str, password: str) -> tuple[dict[str, Any], str]:
    if credentials_bypass():
        user, workspace, workspace_id = resolve_bypass_user(
            email=email,
            complete_onboarding=True,
        )
        role = normalize_role(user["role"])
        token = _session_token(
            user_id=user["id"],
            email=user["email"],
            name=user["name"],
            role=role,
            workspace_id=workspace_id,
            workspace=workspace,
        )
        body = {
            "user": {**public_user(user), "role": role, "workspace": workspace, "workspaceId": workspace_id},
            "membership": {"workspaceId": workspace_id, "role": role},
        }
        return body, token

    if not email or not password:
        raise ValueError("Email and password are required.")

    store = read_store()
    user = next((u for u in store["users"] if u["email"] == email), None)
    if not user or not user.get("passwordHash") or not verify_password(password, user["passwordHash"]):
        raise PermissionError("Invalid email or password.")
    if user.get("status") == "Deactivated":
        raise PermissionError("deactivated")
    if user.get("status") == "Invited":
        raise PermissionError("invited")

    user_id = user["id"]

    def mutate(s: dict[str, Any]) -> None:
        u = next((x for x in s["users"] if x["id"] == user_id), None)
        if not u:
            return
        u["lastActiveAt"] = _iso_now()
        for inv in s.get("invites", []):
            if (
                inv.get("email") == u["email"]
                and (inv.get("workspaceId") or s["workspace"]["id"]) == u.get("workspaceId")
                and inv.get("status") in {"sent", "pending"}
            ):
                inv["status"] = "active"
                if not inv.get("acceptedAt"):
                    inv["acceptedAt"] = _iso_now()
        append_audit(
            s,
            {
                "actorId": u["id"],
                "actorName": u["name"],
                "action": "user.login",
                "resourceType": "user",
                "resourceId": u["id"],
                "metadata": {"role": u["role"]},
            },
        )

    updated = update_store(mutate)
    fresh = next(u for u in updated["users"] if u["id"] == user_id)
    role = normalize_role(fresh["role"])
    workspace_id = fresh.get("workspaceId") or updated["workspace"]["id"]
    token = _session_token(
        user_id=fresh["id"],
        email=fresh["email"],
        name=fresh["name"],
        role=role,
        workspace_id=workspace_id,
        workspace=updated["workspace"]["name"],
    )
    body = {
        "user": {
            **public_user(fresh),
            "role": role,
            "workspace": updated["workspace"]["name"],
            "workspaceId": workspace_id,
        },
        "membership": {"workspaceId": workspace_id, "role": role},
    }
    return body, token


def signup(
    *,
    email: str,
    password: str,
    name: str,
    workspace_name: str,
) -> tuple[dict[str, Any], str]:
    if credentials_bypass():
        user, workspace, workspace_id = resolve_bypass_user(
            email=email or generate_bypass_signup_email(),
            name=name,
            complete_onboarding=False,
        )
        role = normalize_role(user["role"])
        token = _session_token(
            user_id=user["id"],
            email=user["email"],
            name=user["name"],
            role=role,
            workspace_id=workspace_id,
            workspace=workspace,
        )
        body = {
            "user": {**public_user(user), "role": role, "workspace": workspace, "workspaceId": workspace_id},
            "membership": {"workspaceId": workspace_id, "role": role},
        }
        return body, token

    if not email or not password or not name:
        raise ValueError("Name, email, and password are required.")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise ValueError("Enter a valid email.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    store = read_store()
    invited = next(
        (u for u in store["users"] if u["email"] == email and u.get("status") == "Invited"),
        None,
    )
    active_existing = next(
        (
            u
            for u in store["users"]
            if u["email"] == email and u.get("status") == "Active" and u.get("passwordHash")
        ),
        None,
    )
    if active_existing:
        raise FileExistsError("exists")

    user_id = ""
    role = "User"
    workspace_id = store["workspace"]["id"]
    workspace_label = store["workspace"]["name"]

    def mutate(s: dict[str, Any]) -> None:
        nonlocal user_id, role, workspace_id, workspace_label
        if invited:
            invited["name"] = name
            invited["passwordHash"] = hash_password(password)
            invited["status"] = "Active"
            invited["lastActiveAt"] = _iso_now()
            role = normalize_role(invited["role"])
            workspace_id = invited.get("workspaceId") or s["workspace"]["id"]
            user_id = invited["id"]
            for inv in s.get("invites", []):
                if (
                    inv.get("email") == email
                    and inv.get("status") != "revoked"
                    and (inv.get("workspaceId") or s["workspace"]["id"]) == workspace_id
                ):
                    inv["status"] = "active"
                    inv["acceptedAt"] = _iso_now()
            append_audit(
                s,
                {
                    "actorId": user_id,
                    "actorName": name,
                    "action": "user.activated_from_invite",
                    "resourceType": "user",
                    "resourceId": user_id,
                    "metadata": {"role": role, "workspaceId": workspace_id, "email": email},
                },
            )
            return

        active_users = [
            u for u in s["users"] if u.get("status") == "Active" and u["email"] != "admin@cueai.local"
        ]
        only_bootstrap = (
            len([u for u in s["users"] if u.get("status") == "Active"]) == 1
            and any(u["email"] == "admin@cueai.local" and u.get("status") == "Active" for u in s["users"])
        )
        role = "Admin" if len(active_users) == 0 or only_bootstrap else "User"
        user_id = f"usr_{uuid.uuid4().hex[:10]}"
        if role == "Admin":
            s["workspace"]["name"] = workspace_name
            workspace_label = workspace_name
        s["users"].append(
            {
                "id": user_id,
                "name": name,
                "email": email,
                "passwordHash": hash_password(password),
                "role": normalize_role(role),
                "status": "Active",
                "workspaceId": s["workspace"]["id"],
                "createdAt": _iso_now(),
                "lastActiveAt": _iso_now(),
            },
        )
        workspace_id = s["workspace"]["id"]
        append_audit(
            s,
            {
                "actorId": user_id,
                "actorName": name,
                "action": "user.signed_up",
                "resourceType": "user",
                "resourceId": user_id,
                "metadata": {"role": role},
            },
        )

    update_store(mutate)
    fresh = read_store()
    workspace_label = fresh["workspace"]["name"]
    user = next(u for u in fresh["users"] if u["id"] == user_id)
    role_norm = normalize_role(role)
    token = _session_token(
        user_id=user_id,
        email=email,
        name=name,
        role=role_norm,
        workspace_id=workspace_id,
        workspace=workspace_label,
    )
    body = {
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "role": role_norm,
            "workspace": workspace_label,
            "workspaceId": workspace_id,
            "onboardingCompleted": bool(user.get("onboarding", {}).get("completedAt")),
        },
        "membership": {"workspaceId": workspace_id, "role": role_norm},
    }
    return body, token


def me(session: dict[str, Any]) -> tuple[dict[str, Any], str]:
    store = read_store()
    user = next((u for u in store["users"] if u["id"] == session["userId"]), None)
    if not user or user.get("status") == "Deactivated":
        raise PermissionError("unauthorized")

    role = normalize_role(user["role"])
    workspace_id = user.get("workspaceId") or store["workspace"]["id"]
    token = _session_token(
        user_id=user["id"],
        email=user["email"],
        name=user["name"],
        role=role,
        workspace_id=workspace_id,
        workspace=store["workspace"]["name"],
    )
    body = {
        "authenticated": True,
        "user": {
            **public_user(user),
            "role": role,
            "workspace": store["workspace"]["name"],
            "workspaceId": workspace_id,
        },
        "membership": {"workspaceId": workspace_id, "role": role},
        "permissions": permissions_for(role),
    }
    return body, token


def auth_providers() -> dict[str, bool]:
    def is_real(value: str | None) -> bool:
        if not value:
            return False
        v = value.strip().lower()
        return v not in {"", "your-client-id", "your-client-secret", "changeme", "xxx", "todo"}

    return {
        "google": is_real(os.environ.get("AUTH_GOOGLE_ID")) and is_real(os.environ.get("AUTH_GOOGLE_SECRET")),
        "github": is_real(os.environ.get("AUTH_GITHUB_ID")) and is_real(os.environ.get("AUTH_GITHUB_SECRET")),
        "apple": is_real(os.environ.get("AUTH_APPLE_ID")) and is_real(os.environ.get("AUTH_APPLE_SECRET")),
    }


def cookie_options() -> dict[str, Any]:
    return session_cookie_kwargs()


def clear_cookie_options() -> dict[str, Any]:
    opts = session_cookie_kwargs(0)
    opts["max_age"] = 0
    return opts


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
