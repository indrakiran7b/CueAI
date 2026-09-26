"""
License routes on the FastAPI CueAI API.

Desktop clients should prefer the Next.js `/api/license/*` routes that already
power Windows/macOS. These FastAPI routes mirror the same Keygate intermediary
contract for the migration path.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import keygate_service

router = APIRouter(prefix="/license", tags=["license"])


class ActivateBody(BaseModel):
    license_key: str = Field(min_length=8, alias="licenseKey")
    device_id: str = Field(min_length=8, alias="deviceId")
    platform: str | None = None
    app_version: str | None = Field(default=None, alias="appVersion")
    label: str | None = None

    model_config = {"populate_by_name": True}


class VerifyBody(BaseModel):
    license_key: str | None = Field(default=None, alias="licenseKey")
    device_id: str = Field(min_length=8, alias="deviceId")
    platform: str | None = None

    model_config = {"populate_by_name": True}


class DeactivateBody(BaseModel):
    license_key: str = Field(min_length=8, alias="licenseKey")
    device_id: str = Field(min_length=8, alias="deviceId")

    model_config = {"populate_by_name": True}


def _ensure_keygate() -> None:
    if not keygate_service.is_keygate_enabled():
        raise HTTPException(
            status_code=503,
            detail="Keygate is not configured on this CueAI API instance.",
        )


@router.post("/activate")
async def activate_license(body: ActivateBody) -> dict:
    _ensure_keygate()
    result = await keygate_service.activate(
        license_key=body.license_key.strip(),
        device_id=body.device_id.strip(),
        label=body.label or f"CueAI {body.platform or 'desktop'} {body.app_version or ''}".strip(),
    )
    if not result.get("ok"):
        state = result.get("state") or "INVALID"
        status = 409 if state == "DEVICE_LIMIT_REACHED" else 403 if state != "INVALID" else 404
        if state == "NETWORK_ERROR":
            status = 503
        raise HTTPException(status_code=status, detail=result.get("message") or "Activation failed.")

    verified = await keygate_service.verify(
        license_key=body.license_key.strip(),
        device_id=body.device_id.strip(),
    )
    return {
        "valid": verified.get("ok", False),
        "state": verified.get("state"),
        "message": verified.get("message"),
        "plan": verified.get("plan"),
        "entitlements": verified.get("entitlements"),
        "provider": "keygate",
        "data": verified.get("data"),
    }


@router.post("/verify")
async def verify_license(body: VerifyBody) -> dict:
    _ensure_keygate()
    if not body.license_key:
        raise HTTPException(status_code=400, detail="licenseKey is required.")
    result = await keygate_service.verify(
        license_key=body.license_key.strip(),
        device_id=body.device_id.strip(),
    )
    return {
        "valid": result.get("ok", False),
        "state": result.get("state"),
        "message": result.get("message"),
        "plan": result.get("plan"),
        "entitlements": result.get("entitlements"),
        "provider": "keygate",
        "data": result.get("data"),
    }


@router.post("/deactivate")
async def deactivate_license(body: DeactivateBody) -> dict:
    _ensure_keygate()
    result = await keygate_service.deactivate(
        license_key=body.license_key.strip(),
        device_id=body.device_id.strip(),
    )
    return {
        "valid": False,
        "state": result.get("state"),
        "message": result.get("message"),
        "provider": "keygate",
    }


@router.get("/status")
async def license_status(licenseKey: str, deviceId: str) -> dict:
    _ensure_keygate()
    result = await keygate_service.verify(
        license_key=licenseKey.strip(),
        device_id=deviceId.strip(),
    )
    return {
        "valid": result.get("ok", False),
        "state": result.get("state"),
        "message": result.get("message"),
        "plan": result.get("plan"),
        "entitlements": result.get("entitlements"),
        "provider": "keygate",
        "data": result.get("data"),
    }
