from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.deps import get_session_payload
from app.core.auth_mode import auth_bypass
from app.core.roles import normalize_role, permissions_for
from app.core.session import SESSION_COOKIE, sign_session
from app.modules.auth import service

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None


class SignupBody(BaseModel):
    email: str | None = None
    password: str | None = None
    name: str | None = None
    workspace: str | None = None


def _set_session_cookie(response: Response, token: str, *, clear: bool = False) -> None:
    opts = service.clear_cookie_options() if clear else service.cookie_options()
    response.set_cookie(
        SESSION_COOKIE,
        "" if clear else token,
        httponly=opts["httponly"],
        samesite=opts["samesite"],
        secure=opts["secure"],
        path=opts["path"],
        max_age=opts.get("max_age"),
    )


@router.post("/login")
async def login_route(body: LoginBody, response: Response) -> dict[str, Any]:
    email = (body.email or "").strip().lower()
    password = body.password or ""
    try:
        payload, token = service.login(email, password)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except PermissionError as exc:
        msg = str(exc)
        if msg == "deactivated":
            return JSONResponse({"error": "This account has been deactivated."}, status_code=403)
        if msg == "invited":
            return JSONResponse(
                {
                    "error": "Your account was invited but not activated yet. Please sign up with this email to set your password.",
                },
                status_code=403,
            )
        return JSONResponse({"error": "Invalid email or password."}, status_code=401)
    _set_session_cookie(response, token)
    return payload


@router.post("/signup")
async def signup_route(body: SignupBody, response: Response) -> dict[str, Any]:
    email = (body.email or "").strip().lower()
    password = body.password or ""
    name = (body.name or "").strip()
    workspace_name = (body.workspace or "").strip() or f"{(name.split(' ')[0] if name else 'My')}'s Workspace"
    try:
        payload, token = service.signup(
            email=email,
            password=password,
            name=name,
            workspace_name=workspace_name,
        )
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except FileExistsError:
        return JSONResponse({"error": "An account with this email already exists."}, status_code=409)
    _set_session_cookie(response, token)
    return payload


@router.get("/me")
async def me_route(
    response: Response,
    session: Annotated[dict[str, Any] | None, Depends(get_session_payload)],
) -> dict[str, Any]:
    if not session:
        return JSONResponse({"authenticated": False}, status_code=401)
    if auth_bypass():
        role = normalize_role(session.get("role"))
        token = sign_session(
            {
                "userId": session["userId"],
                "email": session["email"],
                "name": session["name"],
                "role": role,
                "workspaceId": session["workspaceId"],
                "workspace": session["workspace"],
            },
        )
        payload = {
            "authenticated": True,
            "user": {
                "id": session["userId"],
                "email": session["email"],
                "name": session["name"],
                "role": role,
                "workspace": session["workspace"],
                "workspaceId": session["workspaceId"],
                "plan": "free",
            },
            "membership": {"workspaceId": session["workspaceId"], "role": role},
            "permissions": permissions_for(role),
        }
        _set_session_cookie(response, token)
        return payload
    try:
        payload, token = service.me(session)
    except PermissionError:
        return JSONResponse({"authenticated": False}, status_code=401)
    _set_session_cookie(response, token)
    return payload


@router.post("/logout")
async def logout_route(response: Response) -> dict[str, bool]:
    _set_session_cookie(response, "", clear=True)
    return {"ok": True}


@router.get("/providers")
async def providers_route() -> dict[str, bool]:
    return service.auth_providers()
