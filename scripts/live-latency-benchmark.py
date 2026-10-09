"""Server-side live-answer TTFT benchmark. Does not log questions or answers."""

from __future__ import annotations

import asyncio
import statistics
import time

QUESTIONS = [
    "What is Python?",
    "Explain OOP concepts.",
    "What is a database index?",
    "Difference between list and tuple?",
    "Explain REST API.",
    "What is normalization?",
    "What is inheritance?",
    "Explain SQL JOIN.",
    "What is an API?",
    "Explain your project.",
]


async def main() -> None:
    from app.modules.live.answer_service import build_prompts, iter_groq_tokens, _groq_key

    if not _groq_key():
        print("BLOCKED — GROQ_API_KEY not configured")
        return

    totals: list[float] = []
    print("[CueAI Performance]")
    print("Platform: server")
    print("")

    for i, question in enumerate(QUESTIONS, 1):
        body = {"prompt": question, "stream": True, "skipKnowledge": True, "transcript": []}
        t_req = time.perf_counter()
        system, user_prompt, _ = build_prompts(body)
        t_built = time.perf_counter()
        first = None
        chars = 0
        model = ""
        async for delta, used in iter_groq_tokens(system, user_prompt):
            if first is None:
                first = time.perf_counter()
            chars += len(delta)
            model = used
        t_done = time.perf_counter()
        if first is None:
            print(f"Question ID: {i:02d} FAILED")
            continue
        api_ms = (t_built - t_req) * 1000
        ttft_ms = (first - t_built) * 1000
        total_ms = (first - t_req) * 1000
        totals.append(total_ms)
        print(f"Question ID: {i:02d}")
        print(f"API: {api_ms:.0f}ms")
        print(f"LLM TTFT: {ttft_ms:.0f}ms")
        print(f"TOTAL FIRST ANSWER: {total_ms / 1000:.3f}s")
        print(f"model: {model}")
        print(f"complete_ms: {(t_done - t_req) * 1000:.0f}")
        print("")

    if not totals:
        print("No successful samples")
        return
    totals.sort()
    p50 = totals[int(round(0.5 * (len(totals) - 1)))]
    p90 = totals[int(round(0.9 * (len(totals) - 1)))]
    print(f"P50: {p50 / 1000:.3f}s")
    print(f"P90: {p90 / 1000:.3f}s")
    print(f"MAX: {max(totals) / 1000:.3f}s")
    print(f"AVG: {statistics.mean(totals) / 1000:.3f}s")
    print(f"MIN: {min(totals) / 1000:.3f}s")


if __name__ == "__main__":
    asyncio.run(main())
