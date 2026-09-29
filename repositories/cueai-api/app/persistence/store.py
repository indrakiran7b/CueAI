from __future__ import annotations

import json
import os
import threading
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable

from app.core.session import hash_password

_write_lock = threading.Lock()
_memory: dict[str, Any] | None = None
_loaded_mtime: float = 0.0


def _data_dir() -> Path:
    raw = os.environ.get("CUEAI_DATA_DIR", "").strip()
    if raw:
        return Path(raw)
    web_data = os.environ.get("CUEAI_WEB_DATA_DIR", "").strip()
    if web_data:
        return Path(web_data)
    repo_root = Path(__file__).resolve().parents[4]
    return repo_root / "apps" / "web" / ".data"


def store_path() -> Path:
    return _data_dir() / "workspace-store.json"


def _default_store() -> dict[str, Any]:
    workspace_id = "ws_default"
    admin_id = "usr_bootstrap_admin"
    now = _iso_now()
    return {
        "workspace": {
            "id": workspace_id,
            "name": "CueAI Workspace",
            "seats": 25,
            "privacy": {
                "shareTranscriptsWithTeam": False,
                "allowAiTrainingOptIn": False,
                "redactPiiInExports": True,
                "requireInviteForJoin": True,
            },
            "retention": {
                "meetingDays": 365,
                "transcriptDays": 365,
                "notesDays": 365,
                "resumeDays": 180,
                "knowledgeDays": 730,
                "autoDeleteEnabled": False,
            },
            "createdAt": now,
        },
        "users": [
            {
                "id": admin_id,
                "name": "Workspace Admin",
                "email": "admin@cueai.local",
                "passwordHash": hash_password("admin123"),
                "role": "Admin",
                "status": "Active",
                "workspaceId": workspace_id,
                "createdAt": now,
                "lastActiveAt": now,
            },
        ],
        "invites": [],
        "knowledge": [],
        "usage": [],
        "audit": [],
        "meetings": [],
        "devices": [],
        "activeMeetingId": None,
        "ai": {
            "provider": "groq",
            "model": "openai/gpt-oss-20b",
            "enabledProviders": ["groq"],
            "enabledModels": [
                "openai/gpt-oss-20b",
                "llama-3.3-70b-versatile",
                "whisper-large-v3",
            ],
            "defaultModel": "openai/gpt-oss-20b",
            "endpoint": "https://api.groq.com/openai/v1",
            "apiKeyEnc": "",
        },
    }


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _persist(store: dict[str, Any]) -> None:
    global _memory, _loaded_mtime
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2), encoding="utf-8")
    _memory = store
    try:
        _loaded_mtime = path.stat().st_mtime
    except OSError:
        _loaded_mtime = 0.0


def _load_store_locked() -> dict[str, Any]:
    global _memory, _loaded_mtime
    path = store_path()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = 0.0

    if _memory is not None and mtime and _loaded_mtime and mtime <= _loaded_mtime:
        return _memory

    if path.is_file():
        store = json.loads(path.read_text(encoding="utf-8"))
        if not store.get("devices"):
            store["devices"] = []
        _memory = store
        _loaded_mtime = mtime or _loaded_mtime
        return store

    store = _default_store()
    _persist(store)
    return store


def read_store() -> dict[str, Any]:
    with _write_lock:
        return deepcopy(_load_store_locked())


def update_store(mutator: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    with _write_lock:
        store = _load_store_locked()
        mutator(store)
        _persist(store)
        return deepcopy(store)


def append_audit(
    store: dict[str, Any],
    entry: dict[str, Any],
) -> None:
    store.setdefault("audit", [])
    store["audit"].insert(
        0,
        {
            "id": f"aud_{uuid.uuid4().hex[:8]}",
            "createdAt": _iso_now(),
            "workspaceId": entry.get("workspaceId") or store["workspace"]["id"],
            "actorId": entry["actorId"],
            "actorName": entry["actorName"],
            "action": entry["action"],
            "resourceType": entry["resourceType"],
            "resourceId": entry.get("resourceId"),
            "metadata": entry.get("metadata"),
        },
    )
    store["audit"] = store["audit"][:500]


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    onboarding = user.get("onboarding") or {}
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
        "workspaceId": user.get("workspaceId"),
        "createdAt": user.get("createdAt"),
        "lastActiveAt": user.get("lastActiveAt"),
        "onboardingCompleted": bool(onboarding.get("completedAt")),
        "plan": "premium" if user.get("plan") == "premium" else "free",
    }
