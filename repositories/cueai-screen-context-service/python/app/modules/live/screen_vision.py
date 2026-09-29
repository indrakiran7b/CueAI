from __future__ import annotations

from typing import Any

from app.modules.live.answer_service import image_inline_parts, parse_answer
from app.modules.live.gemini import gemini_generate_json_sync
from app.modules.live.screen_prompts import SCREEN_CONTEXT_SYSTEM, build_screen_user_prompt


def analyze_screen_with_gemini(
    image_data_url: str,
    prompt: str,
    recent_context: str,
) -> dict[str, Any]:
    inline = image_inline_parts(image_data_url)
    if not inline:
        raise RuntimeError("Invalid screenshot image payload.")

    user_prompt = build_screen_user_prompt(prompt, recent_context)
    result = gemini_generate_json_sync(
        SCREEN_CONTEXT_SYSTEM,
        user_prompt,
        inline=inline,
        temperature=0.25,
        max_output_tokens=500,
    )
    answer, confidence = parse_answer(result["text"])
    if not answer.strip():
        raise RuntimeError("Screen analysis failed")
    return {
        "ok": True,
        "answer": answer,
        "confidence": confidence,
        "model": str(result.get("model") or "gemini-2.5-flash"),
        "provider": "gemini",
        "inputTokens": result.get("inputTokens") or 0,
        "outputTokens": result.get("outputTokens") or 0,
    }
