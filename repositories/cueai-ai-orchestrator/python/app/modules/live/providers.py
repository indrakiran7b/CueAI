"""Providers actually used by the Next.js live stack (not a plugin system).

- Groq: primary chat, vision, speech-to-text, translation
- Gemini: fallback chat/vision
- Qwen-VL: optional local sidecar at CUEAI_QWEN_VL_URL (separate process)

Live answer stays synchronous in FastAPI. Screen analysis uses Celery ai.vision + Gemini.
"""

PROVIDERS = ("groq", "gemini", "qwen-vl")
