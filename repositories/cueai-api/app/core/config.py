from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _API_ROOT / ".env"


def _load_dotenv() -> None:
    if not _ENV_FILE.is_file():
        return
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _parse_cors_origins(raw: str) -> list[str]:
    origins = [part.strip() for part in raw.split(",") if part.strip()]
    return origins


@dataclass(frozen=True)
class Settings:
    cueai_env: str
    api_host: str
    api_port: int
    cors_origins: list[str]
    redis_url: str
    database_url: str | None

    @property
    def is_production(self) -> bool:
        return self.cueai_env.lower() in {"production", "prod"}


def get_settings() -> Settings:
    _load_dotenv()
    cors_raw = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    cors_origins = _parse_cors_origins(cors_raw)
    if not cors_origins:
        raise RuntimeError(
            "CORS_ORIGINS must list at least one origin (comma-separated URLs).",
        )
    port_raw = os.environ.get("API_PORT", "8000")
    try:
        api_port = int(port_raw)
    except ValueError:
        raise RuntimeError("API_PORT must be an integer.") from None

    redis_url = os.environ.get("REDIS_URL", "").strip()
    if not redis_url:
        raise RuntimeError(
            "REDIS_URL is required (example: redis://localhost:6379/0)",
        )

    database_raw = os.environ.get("DATABASE_URL", "").strip()
    database_url = database_raw or None

    return Settings(
        cueai_env=os.environ.get("CUEAI_ENV", "development"),
        api_host=os.environ.get("API_HOST", "127.0.0.1"),
        api_port=api_port,
        cors_origins=cors_origins,
        redis_url=redis_url,
        database_url=database_url,
    )
