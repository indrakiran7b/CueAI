"""
License routes on the FastAPI CueAI API.

Desktop licensing is disabled. These routes stay for leftover clients and
always report an authorized device.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/license", tags=["license"])


def _licensing_disabled(device_id: str = "") -> dict:
    return {
        "valid": True,
        "state": "ACTIVE",
        "status": "active",
        "message": "Licensing is disabled.",
        "provider": "local",
        "deviceId": device_id,
        "plan": "pro",
        "entitlements": {
            "meeting.full_summary": True,
            "meeting.max_questions": 999,
            "desktop_companion": True,
        },
    }


class ActivateBody(BaseModel):
    license_key: str = Field(default="", alias="licenseKey")
    device_id: str = Field(default="", alias="deviceId")
    platform: str | None = None
    app_version: str | None = Field(default=None, alias="appVersion")
    label: str | None = None

    model_config = {"populate_by_name": True}


class VerifyBody(BaseModel):
    license_key: str | None = Field(default=None, alias="licenseKey")
    device_id: str = Field(default="", alias="deviceId")
    platform: str | None = None

    model_config = {"populate_by_name": True}


class DeactivateBody(BaseModel):
    license_key: str = Field(default="", alias="licenseKey")
    device_id: str = Field(default="", alias="deviceId")

    model_config = {"populate_by_name": True}


@router.post("/activate")
async def activate_license(body: ActivateBody) -> dict:
    return _licensing_disabled(body.device_id.strip())


@router.post("/verify")
async def verify_license(body: VerifyBody) -> dict:
    return _licensing_disabled(body.device_id.strip())


@router.post("/deactivate")
async def deactivate_license(body: DeactivateBody) -> dict:
    return _licensing_disabled(body.device_id.strip())


@router.get("/status")
async def license_status(licenseKey: str = "", deviceId: str = "") -> dict:
    return _licensing_disabled(deviceId.strip())
