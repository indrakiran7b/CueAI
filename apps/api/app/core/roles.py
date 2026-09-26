from __future__ import annotations

from typing import Literal

WorkspaceRole = Literal["Admin", "Manager", "User"]
AdminPermission = str

_MATRIX: dict[WorkspaceRole, list[AdminPermission]] = {
    "Admin": [
        "admin.access",
        "workspace.read",
        "workspace.write",
        "users.read",
        "users.invite",
        "users.remove",
        "users.role",
        "knowledge.read",
        "knowledge.write",
        "ai.read",
        "ai.write",
        "usage.read",
        "privacy.read",
        "privacy.write",
        "retention.write",
        "audit.read",
        "devices.read",
        "devices.write",
        "licenses.read",
        "licenses.write",
    ],
    "Manager": [
        "admin.access",
        "workspace.read",
        "users.read",
        "knowledge.read",
        "ai.read",
        "usage.read",
        "privacy.read",
        "audit.read",
        "devices.read",
        "licenses.read",
    ],
    "User": [],
}


def normalize_role(value: object | None) -> WorkspaceRole:
    if not isinstance(value, str):
        return "User"
    compact = value.strip()
    if compact in ("Admin", "Manager", "User"):
        return compact  # type: ignore[return-value]
    lowered = compact.lower()
    if lowered == "admin":
        return "Admin"
    if lowered == "manager":
        return "Manager"
    if lowered in {"user", "member", "viewer"}:
        return "User"
    return "User"


def permissions_for(role: str | None) -> list[AdminPermission]:
    return list(_MATRIX.get(normalize_role(role), []))


def can(role: str | None, permission: AdminPermission) -> bool:
    return permission in permissions_for(role)


def can_access_admin(role: str | None) -> bool:
    return can(role, "admin.access")
