from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.core.redis import check_redis, dispose_redis, init_redis
from app.db.session import check_database, dispose_db, init_db

logger = logging.getLogger("cueai.api")

api_v1 = APIRouter(prefix="/v1", tags=["v1"])


def _build_health_payload(
    redis_ok: bool,
    database_ok: bool | None,
) -> tuple[dict[str, str], int]:
    payload: dict[str, str] = {
        "redis": "ok" if redis_ok else "unavailable",
    }
    if database_ok is not None:
        payload["database"] = "ok" if database_ok else "unavailable"

    dependencies_ok = redis_ok and (
        database_ok is None or database_ok
    )
    payload["status"] = "ok" if dependencies_ok else "degraded"
    status_code = 200 if dependencies_ok else 503
    return payload, status_code


@api_v1.get("/health")
async def health(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    redis_ok = await check_redis()
    database_ok: bool | None
    if settings.database_url:
        database_ok = await check_database()
    else:
        database_ok = None

    payload, status_code = _build_health_payload(redis_ok, database_ok)
    return JSONResponse(status_code=status_code, content=payload)


def _configure_logging() -> None:
    if logging.getLogger().handlers:
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s %(message)s",
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    _configure_logging()
    cfg = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "Starting CueAI API (env=%s, host=%s, port=%s)",
            cfg.cueai_env,
            cfg.api_host,
            cfg.api_port,
        )
        await init_redis(cfg.redis_url)
        if cfg.database_url:
            await init_db(cfg.database_url)
        try:
            yield
        finally:
            await dispose_redis()
            if cfg.database_url:
                await dispose_db()
            logger.info("Shutting down CueAI API")

    app = FastAPI(
        title="CueAI API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if not cfg.is_production else None,
        redoc_url="/redoc" if not cfg.is_production else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    from app.modules.auth.router import router as auth_router
    from app.modules.jobs.router import router as jobs_router
    from app.modules.live.router import router as live_router
    from app.modules.entitlements.router import router as entitlements_router
    from app.modules.license.router import router as license_router
    from app.modules.onboarding.router import router as onboarding_router
    from app.modules.workspace.router import router as workspace_router

    app.include_router(api_v1)
    app.include_router(auth_router, prefix="/v1")
    app.include_router(live_router, prefix="/v1")
    app.include_router(jobs_router, prefix="/v1")
    app.include_router(workspace_router, prefix="/v1")
    app.include_router(onboarding_router, prefix="/v1")
    app.include_router(entitlements_router, prefix="/v1")
    app.include_router(license_router, prefix="/v1")

    @app.exception_handler(HTTPException)
    async def cueai_http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        if isinstance(exc.detail, str):
            return JSONResponse({"error": exc.detail}, status_code=exc.status_code)
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code)

    app.state.settings = cfg
    return app


app = create_app()
