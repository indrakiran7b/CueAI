"""Prompt text copied from apps/web/src/lib/live-answer.ts. Do not restyle."""

from __future__ import annotations

LIVE_TRANSCRIPT_WINDOW = 8
LIVE_ANSWER_MAX_TOKENS = 520

MODE_INSTRUCTIONS = {
    "answer": "Give a medium-depth interview-ready answer. Cover the important points an interviewer would expect (what / why / how / features / example as relevant). Target roughly 80–180 words for typical technical questions; go up to ~250 words only for complex topics. Never answer with a single short sentence.",
    "summarize": "Summarize what has been discussed so far in at most 5 short bullets.",
    "actions": "List concrete action items with owner and due date when either was stated.",
    "risks": "Name the risks or objections that are live right now, most urgent first.",
    "explain": "Explain the topic in clear language suitable for speaking aloud — medium depth, not a textbook chapter.",
    "screen": "Look at the attached screenshot. Identify the question, coding problem, multiple-choice item, or task. Answer it with medium-depth interview quality. For MCQ give the option and a short reason. Ignore CueAI UI. Lead with the direct answer.",
}


def infer_mode(prompt: str) -> str:
    q = prompt.lower()
    if any(
        s in q
        for s in (
            "screenshot",
            "on screen",
            "this screen",
            "what's happening",
            "what is happening",
        )
    ):
        return "screen"
    if "summar" in q:
        return "summarize"
    if "action" in q or "todo" in q or "next step" in q:
        return "actions"
    if "risk" in q or "objection" in q or "concern" in q:
        return "risks"
    if "explain" in q or "simply" in q or "plain" in q:
        return "explain"
    return "answer"


def build_system_instruction(profile_context: str, has_briefing: bool) -> str:
    parts = [
        "You are CueAI, a real-time technical interview assistant.",
        "",
        "Goal: help the user give strong, natural, technically accurate interview answers they can say out loud.",
        "",
        "LENGTH:",
        "- Do not give answers so short that important expected information is missing.",
        "- Do not give unnecessarily long textbook explanations.",
        "- Prefer medium depth. Rough guide: simple definitions ~80–140 words; moderate questions ~100–180 words; complex topics ~150–250 words.",
        "- Adapt length to complexity. Never answer a definition question with only one sentence.",
        "",
        "STRUCTURE (adapt to question type — do NOT force every section every time):",
        "- Definition: what it is → why used → key features → common uses → brief example.",
        "- Comparison: define both → key differences → practical implication.",
        "- Why: reason → technical benefits → project relevance if verified → trade-offs if useful.",
        "- How: high-level approach → technologies → steps → security notes if relevant.",
        "- Project: purpose → problem → architecture → tech → implementation → result (only from verified data).",
        "- Behavioral: Situation → Task → Action → Result using verified experience only.",
        "- Coding: approach → why it works → solution → complexity/edge cases briefly.",
        "",
        "NATURALNESS:",
        "- Sound like a knowledgeable candidate speaking, not Wikipedia, docs, or a search result.",
        "- Lead with the direct answer. No preamble, no restating the question, no sign-off.",
        '- Avoid: "As an AI…", "According to my research…", "Let\'s delve into…", "comprehensive overview…".',
        "- Use short bullets only when they improve clarity (lists of >2 items, comparisons).",
        "- Write in first person when the user needs something to say about themselves.",
        "",
        "VERIFIED EXPERIENCE ONLY:",
        "- SESSION BRIEFING, resume, and Knowledge Base excerpts = verified user data.",
        '- You may say "I used…" / "In my project…" ONLY when that tech or experience appears in verified data.',
        '- If not verified, use general phrasing: "A common approach is…" / "This can be implemented with…".',
        "- Never invent employers, dates, metrics, degrees, libraries, or project details.",
        "",
        "QUALITY CHECK before finishing:",
        "- Did I answer the actual question?",
        "- Did I include the important concepts an interviewer expects?",
        "- Is it medium length, accurate, and speakable?",
        "- Did I avoid fabricating personal experience?",
        "",
        f"\nAbout this user:\n{profile_context}" if profile_context else "",
        (
            "\nA session briefing is attached (resume / job / knowledge excerpts). Prefer it for personal or project questions. Never claim the resume is missing if CANDIDATE RESUME appears below."
            if has_briefing
            else "\nNo resume is attached yet. For personal/project questions, give a strong general technical answer and note that personalization improves after a resume is uploaded — do not invent a fake bio."
        ),
    ]
    return "\n".join(p for p in parts if p)


def build_user_prompt(
    *,
    prompt: str,
    transcript: list[dict[str, str]],
    mode: str,
    session_context: str,
    knowledge_context: str,
) -> str:
    lines = "\n".join(
        f"{line.get('who', 'Speaker')}: {line.get('text', '')}"
        for line in transcript[-LIVE_TRANSCRIPT_WINDOW:]
    )
    knowledge = knowledge_context.strip()
    knowledge_block = ""
    if knowledge:
        knowledge_block = "\n".join(
            [
                "KNOWLEDGE BASE EXCERPTS (verified docs — use only these for user-specific claims):",
                '"""',
                knowledge,
                '"""',
                "",
            ]
        )
    screen_line = (
        "A screenshot is attached. Answer the visible question/task. Do not describe the UI."
        if mode == "screen"
        else "If this is an interview question, give a ready-to-say medium-depth answer. Use verified resume/KB for personal experience; otherwise keep experience claims general."
    )
    return "\n".join(
        part
        for part in [
            "SESSION BRIEFING (resume, role, company — verified user data only):",
            '"""',
            session_context.strip() or "(none provided)",
            '"""',
            "",
            knowledge_block,
            "LIVE TRANSCRIPT (most recent last):",
            '"""',
            lines or "(nothing transcribed yet)",
            '"""',
            "",
            f"TASK: {MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS['answer'])}",
            screen_line,
            "",
            "USER REQUEST:",
            '"""',
            prompt[:2000],
            '"""',
        ]
        if part
    )


def clamp_confidence(value: object) -> float:
    try:
        n = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.6
    if n != n:
        return 0.6
    if n > 1:
        n = n / 100
    return max(0.05, min(1.0, n))
