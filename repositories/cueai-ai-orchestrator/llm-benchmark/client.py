"""OpenRouter client via the OpenAI Python SDK."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from openai import OpenAI

from config import (
    OPENROUTER_APP_TITLE,
    OPENROUTER_BASE_URL,
    OPENROUTER_HTTP_REFERER,
    REQUEST_TIMEOUT_SEC,
    ROOT,
)


def load_api_key() -> str:
    load_dotenv(ROOT / ".env", override=True)
    key = (os.getenv("OPENROUTER_API_KEY") or "").strip().strip("\"'")
    if not key or key == "your_key_here":
        raise RuntimeError(
            "OPENROUTER_API_KEY missing. Copy .env.example to .env and set your key."
        )
    return key


@lru_cache(maxsize=1)
def get_client() -> OpenAI:
    api_key = load_api_key()
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
