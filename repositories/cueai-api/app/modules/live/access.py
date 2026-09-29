"""Authorization for live vs admin translation.

Companion live translation: any authenticated session.
Admin transcript translation: admin.access (Admin or Manager).
"""

from __future__ import annotations

from app.core.roles import can_access_admin


def companion_translate_status(*, authenticated: bool) -> int:
    return 200 if authenticated else 401


def admin_translate_status(*, authenticated: bool, role: str | None) -> int:
    if not authenticated:
        return 401
    if not can_access_admin(role):
        return 403
    return 200
