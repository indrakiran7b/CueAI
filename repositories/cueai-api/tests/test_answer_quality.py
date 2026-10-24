"""Answer-quality contract: question analysis, grounding and the deterministic guard (no network)."""

import asyncio
import json

import httpx
import pytest

from app.modules.live.answer_service import generate_live_answer, plan_live_answer, reset_http_client
from app.modules.live.grounding import grounding_notes, split_briefing, tech_evidence
from app.modules.live.guard import check_python_static, guard_live_answer, redact_secrets
from app.modules.live.question import analyze_question, describe_analysis

BRIEFING = """Interview at: Brightline Software
Job description:
Junior Python Developer. Requirements: Python, Flask or FastAPI, REST APIs, SQL. Nice to have: React, AWS, Docker.
CANDIDATE RESUME:
Asha Rao. B.Tech Computer Science 2025. Skills: Python, Flask, MySQL, basic JavaScript.
Project: AI Resume Analyzer - Flask app; PDF text extracted with pdfplumber; text sent to the Gemini API; key loaded from an environment variable."""

PRIOR = [{"question": "Which API key did you use?", "answer": "I used the Gemini API key from an environment variable."}]


@pytest.fixture(autouse=True)
def _reset_live_http():
    reset_http_client()
    yield
    reset_http_client()


@pytest.mark.parametrize(
    ("question", "kind", "category", "history"),
    [
        ("Give me a ready-to-say self-introduction from my resume and the job briefing.", "introduction", "self_introduction", None),
        ("Why did you use Flask instead of FastAPI?", "comparison", "framework_comparison", None),
        ("Explain your project.", "project", "project", None),
        ("How did you pass the PDF?", "project", "project", None),
        ("Which API key did you use?", "project", "project", None),
        ("Why not GPT?", "why", "follow_up", PRIOR),
        ("Do you know ReactJS? Explain.", "experience", "resume_background", None),
        ("What is PHP?", "definition", "programming_language", None),
        ("Write a Python program to check a prime number without built-in functions", "coding", "coding", None),
        ("Write a Python program to print prime numbers", "coding", "coding", None),
        ("Merge two arrays", "coding", "coding", None),
        ("Design a URL shortener", "scenario", "system_design", None),
        ("What is a decorator in Python?", "definition", "technical_concept", None),
        ("Tell me about a time you disagreed with your manager.", "behavioral", "behavioral_hr", None),
    ],
)
def test_classification(question, kind, category, history) -> None:
    a = analyze_question(question, history=history)
    assert a.response_type == kind
    assert a.category == category


def test_personal_questions_need_resume_and_rationale_is_guarded() -> None:
    assert analyze_question("How did you pass the PDF?").needs_personal_context
    assert not analyze_question("What is PHP?").needs_personal_context
    why_not = analyze_question("Why not GPT?", history=PRIOR)
    assert why_not.is_follow_up and why_not.asks_rationale
    assert "do not invent reasons" in describe_analysis(why_not, PRIOR)


def test_coding_and_topic_directives() -> None:
    prime = analyze_question("Write a Python program to check a prime number without built-in functions")
    text = describe_analysis(prime)
    assert prime.no_builtins and prime.max_tokens >= 600
    assert "math.isqrt" in text and "input()" in text and "Time/Space complexity" in text
    loop = describe_analysis(analyze_question("How do you prevent event loop starvation?"))
    assert "GIL" in loop
    assert "CancelledError" not in describe_analysis(analyze_question("How would you cancel an order in an e-commerce app?"))


def test_grounding_separates_resume_from_job() -> None:
    parts = split_briefing(BRIEFING)
    assert "pdfplumber" in parts.candidate and "Nice to have" not in parts.candidate
    evidence = dict(tech_evidence("Flask, AWS or Kubernetes?", parts))
    assert evidence == {"Flask": "candidate", "AWS": "job_only", "Kubernetes": "absent"}
    q = "Do you know ReactJS? Explain."
    notes = grounding_notes(q, analyze_question(q), parts)
    assert "React: appears only in the job requirements" in notes
    intro = grounding_notes("Tell me about yourself.", analyze_question("Tell me about yourself."), split_briefing(""))
    assert "No resume or profile is available" in intro


def test_guard_removes_fabrications_and_keeps_supported_facts() -> None:
    raw = (
        "Sure, here's the answer: I'm Asha, a final-year B.Tech student at XYZ University. "
        "I have five years of experience building APIs. I led a team of four. It served millions of users. "
        "I built the AI Resume Analyzer with Flask and pdfplumber."
    )
    r = guard_live_answer(raw, context=BRIEFING, personal=True)
    assert r.answer.startswith("I'm Asha, a final-year B.Tech student.")
    for bad in ("XYZ", "five years", "led a team", "millions"):
        assert bad not in r.answer
    assert "pdfplumber" in r.answer
    assert {"preamble_removed", "placeholder_removed", "unsupported_years_removed"} <= set(r.changes)
    template = "Hi, I'm [Your Name]. I also led a small team on a [project]. I enjoy backend work."
    assert guard_live_answer(template, context="Tell me about yourself.", personal=True).answer == "Hi, I'm [Your Name]. I enjoy backend work."
    general = "Python 3.11 is about 25% faster than 3.10 in some benchmarks. I used the Google Gemini API."
    assert guard_live_answer(general, context=BRIEFING).answer == general


def test_guard_redacts_secrets_and_validates_code_statically() -> None:
    fake = "sk-" + "a1" * 16
    assert fake not in guard_live_answer(f"The key is {fake}").answer
    assert redact_secrets("Bearer " + "x" * 30) == "Bearer [redacted]"
    good = "```python\nn = int(input())\nif n < 2:\n    print('not prime')\nelse:\n    print('check')\n```"
    assert guard_live_answer(good).validation_status == "static_ok"
    assert guard_live_answer("```python\nfor i in range(3)\n    print(i)\n```").validation_status == "static_issues"
    assert "expected an indented block" in ",".join(check_python_static("def f(n):\nreturn n"))
    assert check_python_static("def f(\n    a,\n):\n    return a\n") == []
    assert guard_live_answer("PHP is a server\u2011side language.").answer == "PHP is a server-side language."


def test_plan_uses_history_analysis_and_type_budgets() -> None:
    plan = plan_live_answer(
        {"prompt": "Why not GPT?", "history": PRIOR, "sessionContext": BRIEFING, "skipKnowledge": True}
    )
    assert "CONVERSATION SO FAR" in plan.user_prompt and "Which API key did you use?" in plan.user_prompt
    assert "QUESTION ANALYSIS" in plan.user_prompt and "GROUNDING" in plan.user_prompt
    coding = plan_live_answer({"prompt": "Write a Python program to print prime numbers", "skipKnowledge": True})
    assert coding.max_tokens >= 600
    summary = plan_live_answer({"prompt": "Summarize the call", "mode": "summarize", "skipKnowledge": True})
    assert "QUESTION ANALYSIS" not in summary.user_prompt


def test_generated_answer_is_guarded_before_return(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    sent: dict = {}
    fabricated = "Great question! I have 8 years of experience at Google. Flask is a micro-framework."

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "model": "openai/gpt-oss-20b",
                "choices": [{"message": {"content": json.dumps({"answer": fabricated, "confidence": 0.9})}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 4},
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, url, *args, **kwargs):
            sent["max_tokens"] = kwargs["json"]["max_tokens"]
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        generate_live_answer({"prompt": "Have you used Flask?", "sessionContext": BRIEFING, "skipKnowledge": True})
    )
    assert result["answer"] == "Flask is a micro-framework."
    assert result["validationStatus"] == "not_applicable"
    assert sent["max_tokens"] > 150
