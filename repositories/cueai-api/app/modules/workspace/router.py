from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.deps import RequireAuth
from app.persistence.store import read_store

router = APIRouter(prefix="/workspaces", tags=["workspace"])


class WorkspaceSelectBody(BaseModel):
    workspaceId: str | None = None


@router.get("")
async def list_workspaces(session: RequireAuth) -> dict[str, Any]:
    store = read_store()
    workspace_id = session.get("workspaceId") or store["workspace"]["id"]
    name = store["workspace"]["name"] or session.get("workspace")
    return {
        "workspaces": [
            {"id": workspace_id, "name": name, "current": True},
        ],
    }


@router.post("")
async def select_workspace(body: WorkspaceSelectBody, session: RequireAuth) -> dict[str, Any]:
    requested = (body.workspaceId or "").strip()
    if not requested or requested != session.get("workspaceId"):
        return JSONResponse(
            {"error": "You can only use workspaces you belong to."},
            status_code=403,
        )
    return {
        "ok": True,
        "workspaceId": session["workspaceId"],
        "workspace": session.get("workspace"),
    }
