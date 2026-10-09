from __future__ import annotations

import os

DEV_AUTH_SECRET_FALLBACK = "cueai-dev-secret-change-me"
DEV_ONLY_BOOTSTRAP_EMAIL = "admin@cueai.local"
DEV_ONLY_BOOTSTRAP_PASSWORD = "admin123"

_KNOWN_AUTH_SECRET_PLACEHOLDERS = {
    "",
    "<change-me>",
    "change-me",
    "changeme",
    "cueai-dev-secret-change-me",
}


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


def is_cueai_production() -> bool:
    # NODE_ENV=production is normal inside the web/API images.
    # CueAI production policy is CUEAI_ENV=production|prod only.
    env = os.environ.get("CUEAI_ENV", "").strip().lower()
    return env in {"production", "prod"}


def is_auth_secret_placeholder(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw:
        return True
    return raw.lower() in _KNOWN_AUTH_SECRET_PLACEHOLDERS or raw == "<change-me>"


def resolve_auth_secret() -> str:
    raw = (
        os.environ.get("AUTH_SECRET") or os.environ.get("NEXTAUTH_SECRET") or ""
    ).strip()
    if is_cueai_production():
        if is_auth_secret_placeholder(raw):
            raise RuntimeError(
                "AUTH_SECRET is required in production and must not be a known placeholder.",
            )
        return raw
    if is_auth_secret_placeholder(raw):
        return DEV_AUTH_SECRET_FALLBACK
    return raw


def assert_auth_bypass_not_enabled_in_production() -> None:
    if not is_cueai_production():
        return
    if _flag("NEXT_PUBLIC_SKIP_AUTH") or _flag("CUEAI_SKIP_AUTH") or _flag(
        "NEXT_PUBLIC_AUTH_BYPASS",
    ):
        raise RuntimeError(
            "NEXT_PUBLIC_SKIP_AUTH / NEXT_PUBLIC_AUTH_BYPASS cannot be enabled when CUEAI_ENV is production.",
        )


def bootstrap_admin_enabled() -> bool:
    return _flag("CUEAI_BOOTSTRAP_ADMIN_ENABLED")


def configured_bootstrap_email() -> str:
    return os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()


def configured_bootstrap_password() -> str:
    return os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")


def is_default_bootstrap_pair(email: str, password: str) -> bool:
    return (
        email.strip().lower() == DEV_ONLY_BOOTSTRAP_EMAIL
        and password == DEV_ONLY_BOOTSTRAP_PASSWORD
    )


def is_bootstrap_admin_email(email: str | None) -> bool:
    value = (email or "").strip().lower()
    if not value:
        return False
    configured = configured_bootstrap_email()
    if configured:
        return value == configured
    return value == DEV_ONLY_BOOTSTRAP_EMAIL


def resolve_bootstrap_admin() -> dict[str, str] | None:
    if not bootstrap_admin_enabled():
        return None

    email = configured_bootstrap_email() or DEV_ONLY_BOOTSTRAP_EMAIL
    password = configured_bootstrap_password() or DEV_ONLY_BOOTSTRAP_PASSWORD

    if is_cueai_production():
        if not configured_bootstrap_email() or not configured_bootstrap_password():
            raise RuntimeError(
                "CUEAI_BOOTSTRAP_ADMIN_ENABLED in production requires BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.",
            )
        if is_default_bootstrap_pair(email, password):
            raise RuntimeError(
                "Production cannot start with the default development bootstrap credentials.",
            )
        if len(password) < 8:
            raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.")

    return {
        "email": email,
        "password": password,
        "name": "Workspace Admin",
    }
