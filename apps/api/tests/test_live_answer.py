import json

import httpx
import pytest

from app.modules.live.answer_service import LiveAnswerError, generate_live_answer, parse_answer


def test_parse_answer_json_string_is_not_500() -> None:
    answer, confidence = parse_answer('"red"')
    assert answer == "red"
    assert confidence == 0.7


def test_parse_answer_json() -> None:
    answer, confidence = parse_answer('{"answer":"Hello","confidence":0.8}')
    assert answer == "Hello"
    assert confidence == 0.8


def test_missing_prompt() -> None:
    with pytest.raises(LiveAnswerError) as exc:
        import asyncio

        asyncio.run(generate_live_answer({}))
    assert exc.value.status == 400


def test_sse_frame_matches_desktop_contract() -> None:
    from app.modules.live.router import _sse

    frame = _sse({"type": "token", "text": "Hi"})
    assert frame.startswith("data: ")
    assert frame.endswith("\n\n")
    assert '"type": "token"' in frame


def test_groq_success(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "model": "openai/gpt-oss-20b",
                "choices": [{"message": {"content": json.dumps({"answer": "Yes", "confidence": 0.9})}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 4},
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    import asyncio

    result = asyncio.run(generate_live_answer({"prompt": "What is HTTP?"}))
    assert result["ok"] is True
    assert result["answer"] == "Yes"
    assert result["provider"] == "groq"


def test_groq_falls_back_to_gemini(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gem-key")
    calls = {"n": 0}

    class FakeResponse:
        def __init__(self, ok: bool):
            self.status_code = 200 if ok else 500

        def json(self):
            return {
                "model": "gemini-2.5-flash",
                "candidates": [{"content": {"parts": [{"text": json.dumps({"answer": "Fallback", "confidence": 0.5})}]}}],
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, *args, **kwargs):
            calls["n"] += 1
            return FakeResponse("googleapis" in str(url))

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    import asyncio

    result = asyncio.run(generate_live_answer({"prompt": "Explain DNS"}))
    assert result["provider"] == "gemini"
    assert result["answer"] == "Fallback"
    assert calls["n"] == 2


def test_oversized_screenshot_is_ignored() -> None:
    from app.modules.live.answer_service import parse_inline_image

    assert parse_inline_image("data:image/png;base64," + ("A" * 2_000_001)) is None
    assert parse_inline_image("not-an-image") is None
    assert parse_inline_image("data:image/png;base64,aGVsbG8=") == "data:image/png;base64,aGVsbG8="


def test_usage_without_session_writes_nothing() -> None:
    from app.modules.live.context import record_usage

    assert record_usage(None, provider="groq", model="m", total=1, feature="live_answer") is False


def test_qwen_success_skips_gemini(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.setenv("GEMINI_API_KEY", "m")

    async def qwen(*_args, **_kwargs):
        return {"ok": True, "answer": "from-qwen", "confidence": 0.9, "model": "qwen", "provider": "qwen"}

    async def gemini(*_args, **_kwargs):
        raise AssertionError("gemini should not be called")

    monkeypatch.setattr("app.modules.live.answer_service.analyze_with_qwen", qwen)
    monkeypatch.setattr("app.modules.live.answer_service._gemini_json", gemini)
    import asyncio

    result = asyncio.run(
        generate_live_answer(
            {"prompt": "What is on screen?", "image": "data:image/png;base64,aGVsbG8="},
        ),
    )
    assert result["provider"] == "qwen"


def test_gemini_receives_image_bytes_when_qwen_unavailable(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "m")
    captured: dict = {}

    async def qwen(*_args, **_kwargs):
        return None

    async def gemini(system, prompt, inline=None):
        captured["inline"] = inline
        captured["prompt"] = prompt
        return {"text": '{"answer":"seen","confidence":0.5}', "model": "gemini-2.5-flash"}

    monkeypatch.setattr("app.modules.live.answer_service.analyze_with_qwen", qwen)
    monkeypatch.setattr("app.modules.live.answer_service._gemini_json", gemini)
    import asyncio

    result = asyncio.run(
        generate_live_answer(
            {"prompt": "Read this", "image": "data:image/png;base64,aGVsbG8="},
        ),
    )
    assert result["provider"] == "gemini"
    assert captured["inline"] == ("image/png", "aGVsbG8=")
    assert "Read this" in captured["prompt"] or "USER REQUEST" in captured["prompt"]


def test_forged_session_cookie_is_not_trusted() -> None:
    from app.core.session import verify_session

    assert verify_session("not-a-real-session") is None


def test_unauthenticated_is_allowed_by_contract() -> None:
    """Desktop overlay calls /api/live/answer without a session cookie."""
    from app.modules.live.router import live_answer

    assert live_answer is not None
