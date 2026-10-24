"""Resume vs job-description grounding ported from apps/web/src/lib/live-grounding.ts."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.modules.live.question import QuestionAnalysis

I = re.IGNORECASE
HEADER = re.compile(r"^(Interview at|Job description|Job posting|Resume on file|CANDIDATE RESUME|Context|Guidance|Call|Meeting)\s*:", I)


@dataclass
class BriefingParts:
    candidate: str
    job: str
    other: str


def split_briefing(session_context: str, profile_context: str = "") -> BriefingParts:
    buckets = {"candidate": [profile_context.strip()] if profile_context.strip() else [], "job": [], "other": []}
    bucket = "other"
    for line in session_context.splitlines():
        m = HEADER.match(line)
        if m:
            header = m.group(1).lower()
            bucket = (
                "candidate"
                if header == "candidate resume"
                else "job"
                if header.startswith("job") or header == "interview at"
                else "other"
            )
            if header in {"resume on file", "guidance"}:
                continue
        buckets[bucket].append(line)
    return BriefingParts(*("\n".join(buckets[k]) for k in ("candidate", "job", "other")))


TECH: list[tuple[str, re.Pattern[str]]] = [
    (name, re.compile(rx, I))
    for name, rx in [
        ("Python", r"\bpython\b"),
        ("Java", r"\bjava\b(?!\s*script)"),
        ("JavaScript", r"\bjava ?script\b|\bjs\b"),
        ("TypeScript", r"\btype ?script\b"),
        ("PHP", r"\bphp\b"),
        ("C++", r"\bc\+\+|\bcpp\b"),
        ("C#", r"\bc#|\bc sharp\b|\.net\b"),
        ("Go", r"\bgolang\b"),
        ("Rust", r"\brust\b"),
        ("Kotlin", r"\bkotlin\b"),
        ("SQL", r"\bsql\b"),
        ("MySQL", r"\bmysql\b"),
        ("PostgreSQL", r"\bpostgres(ql)?\b"),
        ("MongoDB", r"\bmongo(db)?\b"),
        ("Redis", r"\bredis\b"),
        ("React", r"\breact(\.?js)?\b"),
        ("Angular", r"\bangular\b"),
        ("Vue", r"\bvue(\.?js)?\b"),
        ("Next.js", r"\bnext\.?js\b"),
        ("Node.js", r"\bnode(\.?js)?\b"),
        ("Express", r"\bexpress(\.?js)?\b"),
        ("Django", r"\bdjango\b"),
        ("Flask", r"\bflask\b"),
        ("FastAPI", r"\bfast ?api\b"),
        ("Spring", r"\bspring( boot)?\b"),
        ("Laravel", r"\blaravel\b"),
        ("AWS", r"\baws\b|\bamazon web services\b"),
        ("Azure", r"\bazure\b"),
        ("GCP", r"\bgcp\b|\bgoogle cloud\b"),
        ("Docker", r"\bdocker\b"),
        ("Kubernetes", r"\bkubernetes\b|\bk8s\b"),
        ("Git", r"\bgit\b(?!hub)"),
        ("CI/CD", r"\bci/cd\b|\bjenkins\b|\bgithub actions\b"),
        ("TensorFlow", r"\btensorflow\b"),
        ("PyTorch", r"\bpytorch\b"),
        ("Pandas", r"\bpandas\b"),
        ("NumPy", r"\bnumpy\b"),
        ("Selenium", r"\bselenium\b"),
        ("pytest", r"\bpytest\b"),
        ("GraphQL", r"\bgraphql\b"),
        ("Kafka", r"\bkafka\b"),
        ("OpenAI GPT", r"\bgpt(-?\d[\w.-]*)?\b|\bopenai\b|\bchatgpt\b"),
        ("Gemini", r"\bgemini\b"),
        ("LangChain", r"\blangchain\b"),
    ]
]


def tech_evidence(question: str, parts: BriefingParts) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for term, rx in TECH:
        if not rx.search(question):
            continue
        status = "candidate" if rx.search(parts.candidate) else "job_only" if rx.search(parts.job) else "absent"
        out.append((term, status))
    return out


def grounding_notes(question: str, analysis: QuestionAnalysis, parts: BriefingParts) -> str:
    has_candidate = len(parts.candidate.strip()) > 40
    personal = analysis.needs_personal_context
    notes: list[str] = []
    if personal and not has_candidate:
        notes.append(
            "No resume or profile is available for this candidate. Do not state any personal facts (name, degree, employers, years of experience, projects, metrics). For a self-introduction or background question, give a short ready-to-adapt structure with [bracketed placeholders] for the personal details and one line suggesting the candidate add a resume for a personalized answer. For project or experience questions, answer with how you would approach it, clearly framed as approach rather than past work."
        )
    if parts.job.strip():
        notes.append(
            "The job description lists the employer's requirements. They are never evidence that the candidate has those skills; only the resume/profile is."
        )
    if has_candidate:
        for term, status in tech_evidence(question, parts):
            if status == "candidate":
                notes.append(f"{term}: in the candidate's background — use only the specific details written there.")
            elif status == "job_only":
                notes.append(
                    f"{term}: appears only in the job requirements, not in the candidate's resume. Do not claim experience with it; explain it accurately and, if personal, say honestly it is something the candidate is learning or would ramp up on."
                )
            elif personal:
                notes.append(
                    f"{term}: not in the candidate's resume or profile. Do not claim projects, coursework or experience with it; answer the technical part accurately and be honest about the candidate's level."
                )
    if (analysis.asks_rationale or (analysis.personal_past and analysis.response_type == "comparison")) and has_candidate:
        notes.append(
            "Asked why the candidate made a choice: state a reason only if the resume gives one. Otherwise answer honestly from the project's real scope (what it needed, what the candidate knew) and the factual trade-offs, without inventing benchmarks, team decisions or requirements."
        )
    return "\n".join(f"- {n}" for n in notes)
