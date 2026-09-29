from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any

from app.core.roles import WorkspaceRole, normalize_role

SESSION_COOKIE = "cueai_admin_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14


@dataclass(frozen=True)
class SessionPayload:
    user_id: str
    email: str
    name: str
    role: WorkspaceRole
    workspace_id: str
    workspace: str
    exp: int


def _secret() -> bytes:
    raw = (
        os.environ.get("AUTH_SECRET")
        or os.environ.get("NEXTAUTH_SECRET")
        or "cueai-dev-secret-change-me"
    )
    return raw.encode("utf-8")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _from_b64url(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + pad)


def sign_session(
    payload: dict[str, Any],
    ttl_seconds: int = SESSION_TTL_SECONDS,
) -> str:
    body: dict[str, Any] = {
        **payload,
        "role": normalize_role(payload.get("role")),
        "exp": int(time.time()) + ttl_seconds,
    }
    # Match Next.js JSON field names (camelCase in cookie payload).
    if "userId" not in body and "user_id" in payload:
        body["userId"] = payload["user_id"]
    data = _b64url(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    sig = _b64url(hmac.new(_secret(), data.encode("ascii"), hashlib.sha256).digest())
    return f"{data}.{sig}"


def verify_session(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    parts = token.split(".", 1)
    if len(parts) != 2:
        return None
    data, sig = parts
    expected = _b64url(hmac.new(_secret(), data.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_from_b64url(data).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    exp = payload.get("exp")
    if not exp or int(exp) < int(time.time()):
        return None
    payload["role"] = normalize_role(payload.get("role"))
    return payload


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    return f"{salt}:{derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hash_hex = stored.split(":", 1)
    except ValueError:
        return False
    if not salt or not hash_hex:
        return False
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
        dklen=64,
    )
    return hmac.compare_digest(derived.hex(), hash_hex)


def session_cookie_kwargs(max_age: int = SESSION_TTL_SECONDS) -> dict[str, Any]:
    secure = os.environ.get("NODE_ENV") == "production" or os.environ.get(
        "CUEAI_ENV",
        "",
    ).lower() in {"production", "prod"}
    return {
        "key": SESSION_COOKIE,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
        "max_age": max_age,
    }
