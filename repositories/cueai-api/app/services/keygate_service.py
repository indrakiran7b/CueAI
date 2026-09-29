"""
Keygate HTTP client — CueAI FastAPI backend only.

Desktop apps must NEVER call Keygate or hold KEYGATE_SERVER_API_KEY.

Architecture:
  Windows/macOS → CueAI API → Keygate

Public SDK routes use license_key in the JSON body.
KEYGATE_SERVER_API_KEY is only for optional /admin/* automation.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("cueai.keygate")

FREE_MEETING_QA_LIMIT = 5


def is_keygate_enabled() -> bool:
    return bool(os.environ.get("KEYGATE_BASE_URL", "").strip())


def _base_url() -> str:
    base = os.environ.get("KEYGATE_BASE_URL", "").strip().rstrip("/")
    if not base:
        raise RuntimeError("KEYGATE_BASE_URL is not configured.")
    if base.lower().endswith("/api/v1"):
        return base
    return f"{base}/api/v1"


def _admin_key() -> str | None:
    key = (
        os.environ.get("KEYGATE_SERVER_API_KEY", "").strip()
        or os.environ.get("KEYGATE_API_KEY", "").strip()
    )
    return key or None


def _product_id() -> str | None:
    pid = os.environ.get("KEYGATE_PRODUCT_ID", "").strip()
    return pid or None


def map_keygate_status(
    status: str | None,
    *,
    http_status: int | None = None,
    error_code: str | None = None,
) -> str:
    if http_status == 409 or error_code == "ACTIVATION_LIMIT":
        return "DEVICE_LIMIT_REACHED"
    if http_status == 429 or error_code == "LOCKED_OUT":
        return "NETWORK_ERROR"
    if http_status == 404 or error_code == "LICENSE_NOT_FOUND":
        return "INVALID"

    s = (status or "").lower()
    if s in {"active", "trialing", "activated", "already_activated"}:
        return "ACTIVE"
    if s == "expired":
        return "EXPIRED"
    if s in {"suspended", "past_due"}:
        return "SUSPENDED"
    if s in {"revoked", "canceled", "cancelled"}:
        return "REVOKED"
    if http_status == 403:
        return "REVOKED"
    return "INVALID"


def user_message_for_state(state: str) -> str:
    return {
        "EXPIRED": "Your CueAI license has expired.",
        "SUSPENDED": "Your CueAI license is suspended. Contact support or renew your subscription.",
        "REVOKED": "Your CueAI license has been revoked.",
        "DEVICE_LIMIT_REACHED": "This license has reached its device limit.",
        "INVALID": "That license key is invalid or cannot be used on this device.",
        "NOT_ACTIVATED": "This device is not activated.",
        "NETWORK_ERROR": "Unable to reach the license service. Please try again shortly.",
        "ACTIVE": "License valid.",
    }.get(state, "License validation failed.")


def entitlements_from_keygate(
    plan_name: str | None = None,
    features: dict[str, Any] | None = None,
) -> dict[str, Any]:
    plan_raw = (plan_name or "").strip().lower()
    plan = "free"
    if "enterprise" in plan_raw:
        plan = "enterprise"
    elif "business" in plan_raw or "team" in plan_raw:
        plan = "business"
    elif any(tok in plan_raw for tok in ("pro", "premium", "professional")):
        plan = "pro"

    features = features or {}

    def feature_enabled(key: str) -> bool | None:
        value = features.get(key)
        if value is True or value == "true" or value == 1:
            return True
        if value is False or value == "false" or value == 0:
            return False
        if isinstance(value, dict) and "enabled" in value:
            return bool(value.get("enabled"))
        return None

    premium_plan = plan in {"pro", "business", "enterprise"}
    full = (
        feature_enabled("meeting.full_summary")
        or feature_enabled("meeting_full_summary")
        or feature_enabled("full_summary")
    )
    if full is None:
        full = premium_plan

    companion = feature_enabled("desktop_companion")
    if companion is None:
        companion = feature_enabled("desktop.companion")
    if companion is None:
        companion = True

    max_questions = -1 if full else FREE_MEETING_QA_LIMIT
    max_feat = (
        features.get("meeting.max_questions")
        or features.get("meeting_max_questions")
        or features.get("max_questions")
    )
    if isinstance(max_feat, (int, float)):
        max_questions = int(max_feat)
    elif isinstance(max_feat, str) and max_feat.strip():
        try:
            max_questions = int(max_feat)
        except ValueError:
            pass
    elif isinstance(max_feat, dict) and max_feat.get("value") is not None:
        try:
            max_questions = int(max_feat["value"])
        except (TypeError, ValueError):
            pass

    return {
        "plan": plan,
        "entitlements": {
            "meeting.full_summary": bool(full),
            "meeting.max_questions": max_questions,
            "desktop_companion": bool(companion),
        },
    }


async def _request(
    path: str,
    *,
    method: str = "POST",
    body: dict[str, Any] | None = None,
    admin: bool = False,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    url = f"{_base_url()}{path if path.startswith('/') else '/' + path}"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if admin:
        key = _admin_key()
        if not key:
            return {
                "ok": False,
                "http_status": 503,
                "error_code": "KEYGATE_ADMIN_KEY_MISSING",
                "error_message": "Keygate admin API key is not configured.",
            }
        headers["Authorization"] = f"Bearer {key}"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key[:256]

    payload = dict(body or {})
    pid = _product_id()
    if admin and pid and "product_id" not in payload:
        payload["product_id"] = pid

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.request(
                method,
                url,
                headers=headers,
                json=payload if method.upper() != "GET" else None,
            )
    except httpx.HTTPError as exc:
        logger.error("keygate network_error: %s", exc)
        return {
            "ok": False,
            "http_status": 0,
            "error_code": "NETWORK_ERROR",
            "error_message": "Unable to reach Keygate.",
        }

    try:
        data = response.json()
    except ValueError:
        data = {}

    if not response.is_success or data.get("success") is False:
        err = data.get("error") or {}
        return {
            "ok": False,
            "http_status": response.status_code,
            "error_code": err.get("code"),
            "error_message": err.get("message"),
            "data": data.get("data"),
        }

    return {
        "ok": True,
        "http_status": response.status_code,
        "data": data.get("data"),
    }


def _idempotency_hint(license_key: str) -> str:
    normalized = "".join(ch for ch in license_key.upper() if ch.isalnum())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


async def activate(*, license_key: str, device_id: str, label: str | None = None) -> dict[str, Any]:
    result = await _request(
        "/license/activate",
        body={
            "license_key": license_key,
            "identifier": device_id,
            "identifier_type": "device",
            "label": label or "CueAI Desktop",
        },
        idempotency_key=f"act:{device_id}:{_idempotency_hint(license_key)}",
    )
    if not result["ok"]:
        state = (
            "NETWORK_ERROR"
            if result["http_status"] == 0
            else map_keygate_status(
                None,
                http_status=result["http_status"],
                error_code=result.get("error_code"),
            )
        )
        return {
            "ok": False,
            "state": state,
            "message": user_message_for_state(state),
        }
    return {
        "ok": True,
        "state": "ACTIVE",
        "data": result.get("data") or {},
        "message": "License activated.",
    }


async def verify(*, license_key: str, device_id: str) -> dict[str, Any]:
    result = await _request(
        "/license/verify",
        body={"license_key": license_key, "identifier": device_id},
    )
    if not result["ok"]:
        state = (
            "NETWORK_ERROR"
            if result["http_status"] == 0
            else map_keygate_status(
                None,
                http_status=result["http_status"],
                error_code=result.get("error_code"),
            )
        )
        return {"ok": False, "state": state, "message": user_message_for_state(state)}

    data = result.get("data") or {}
    state = map_keygate_status(data.get("status"))
    mapped = entitlements_from_keygate(data.get("plan_name"), data.get("features"))
    return {
        "ok": state == "ACTIVE",
        "state": state,
        "data": data,
        "message": user_message_for_state(state),
        **mapped,
    }


async def deactivate(*, license_key: str, device_id: str) -> dict[str, Any]:
    result = await _request(
        "/license/deactivate",
        body={"license_key": license_key, "identifier": device_id},
    )
    if not result["ok"] and result["http_status"] not in {0, 404}:
        state = map_keygate_status(
            None,
            http_status=result["http_status"],
            error_code=result.get("error_code"),
        )
        return {"ok": False, "state": state, "message": user_message_for_state(state)}
    return {
        "ok": True,
        "state": "NOT_ACTIVATED",
        "message": "Device deactivated.",
    }


async def entitlements(*, license_key: str, feature: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"license_key": license_key}
    if feature:
        body["feature"] = feature
    result = await _request("/license/entitlements", body=body)
    if not result["ok"]:
        state = (
            "NETWORK_ERROR"
            if result["http_status"] == 0
            else map_keygate_status(
                (result.get("data") or {}).get("status"),
                http_status=result["http_status"],
                error_code=result.get("error_code"),
            )
        )
        return {"ok": False, "state": state, "message": user_message_for_state(state)}

    data = result.get("data") or {}
    state = map_keygate_status(data.get("status") or "active")
    mapped = entitlements_from_keygate(data.get("plan_name"), data.get("features"))
    return {
        "ok": bool(data.get("licensed", state == "ACTIVE")),
        "state": state,
        "message": user_message_for_state(state),
        **mapped,
    }
