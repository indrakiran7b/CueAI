"""OpenRouter client via the OpenAI Python SDK."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from config import (
    OPENROUTER_APP_TITLE,
    OPENROUTER_BASE_URL,
    OPENROUTER_HTTP_REFERER,
    REQUEST_TIMEOUT_SEC,
)

PROJECT_ROOT = Path(__file__).resolve().parent
ENV_FILE = PROJECT_ROOT / ".env"

_PLACEHOLDERS = frozenset(
    {
        "your_key_here",
        "your_key",
        "changeme",
        "xxx",
        "replace_me",
        "OPENROUTER_API_KEY",
    }
)


def print_env_diagnostics(*, api_key: str | None) -> None:
    """Safe diagnostics only. Never print the secret or any substring of it."""
    exists = ENV_FILE.is_file()
    print(f"ENV FILE EXISTS: {'YES' if exists else 'NO'}", flush=True)
    print(f"ENV FILE PATH: {ENV_FILE}", flush=True)
    found = bool(api_key)
    print(f"API KEY FOUND: {'YES' if found else 'NO'}", flush=True)
    print(f"API KEY LENGTH: {len(api_key) if api_key else 0}", flush=True)


def _normalize_key(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().strip("\"'")
    if not key:
        return None
    return key


def load_api_key(*, diagnose: bool = True) -> str:
    """Load OPENROUTER_API_KEY from llm-benchmark/.env via pathlib (cwd-independent)."""
    # Prefer process env when it already has a real key; otherwise load the file.
    existing = _normalize_key(os.getenv("OPENROUTER_API_KEY"))
    if ENV_FILE.is_file():
        override = not existing or existing.lower() in _PLACEHOLDERS
        load_dotenv(dotenv_path=ENV_FILE, override=override)

    api_key = _normalize_key(os.getenv("OPENROUTER_API_KEY"))
    if diagnose:
        print_env_diagnostics(api_key=api_key)

    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY missing. Create llm-benchmark/.env "
            f"(expected at {ENV_FILE}) with OPENROUTER_API_KEY=<your key>. "
            "The key is never logged."
        )
    if api_key.lower() in _PLACEHOLDERS:
        raise RuntimeError(
            "OPENROUTER_API_KEY is still a placeholder. Replace it in "
            f"{ENV_FILE} with a real OpenRouter key. The key is never logged."
        )
    return api_key


@lru_cache(maxsize=1)
def get_client() -> OpenAI:
    api_key = load_api_key(diagnose=False)
    return OpenAI(
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
        timeout=REQUEST_TIMEOUT_SEC,
        default_headers={
            "HTTP-Referer": OPENROUTER_HTTP_REFERER,
            "X-Title": OPENROUTER_APP_TITLE,
        },
    )


def reset_client_cache() -> None:
    get_client.cache_clear()
