from __future__ import annotations

import os

from app.core.security import assert_auth_bypass_not_enabled_in_production


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


def auth_bypass() -> bool:
    """NEXT_PUBLIC_SKIP_AUTH — full session bypass (dev/test only)."""
    assert_auth_bypass_not_enabled_in_production()
    return _flag("NEXT_PUBLIC_SKIP_AUTH") or _flag("CUEAI_SKIP_AUTH")


def credentials_bypass() -> bool:
    """NEXT_PUBLIC_AUTH_BYPASS — passwordless login/signup (dev/test only)."""
    assert_auth_bypass_not_enabled_in_production()
    return _flag("NEXT_PUBLIC_AUTH_BYPASS")


BYPASS_LOGIN_EMAIL = "tester@cueai.local"
BYPASS_PASSWORD = "cueai-bypass"
