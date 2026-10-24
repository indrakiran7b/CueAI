"""Question analysis ported from apps/web/src/lib/live-question.ts. Keep the two in sync."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

I = re.IGNORECASE

INTRODUCTION = re.compile(
    r"\b(tell me about yourself|introduce yourself|walk me through your (resume|background|profile)|about your background|self[- ]?introduction|self[- ]intro|introduce (me|myself)|my introduction)\b",
    I,
)
BEHAVIORAL = re.compile(
    r"\b(tell me about a time|describe a (time|situation)|give (me )?an example of a time|a time when you|how do you (handle|deal with) (conflict|pressure|stress|criticism|failure|deadlines)|(biggest|greatest) (weakness|strength)|why should we hire|why do you want (to work|this (job|role))|where do you see yourself|disagree(d)? with (your|a) (manager|teammate|colleague))\b",
    I,
)
CODING = re.compile(
    r"\b(write|implement|code|program)\b[^?.]{0,60}\b(function|program|code|query|class|method|script|algorithm|solution)\b"
    r"|\bwrite (a|an|the) (sql |python |java |javascript )?(query|program|function)\b"
    r"|\b(a |the )?program (to|that|for)\b"
    r"|\b(reverse|sort|find|count|remove|merge)\b[^?.]{0,40}\b(array|list|string|linked list|duplicates|words|numbers)\b[^?.]{0,30}\b(in|using) (python|java|javascript|sql|c\+\+)\b"
    r"|^(merge|flatten|reverse|sort|rotate|dedupe|deduplicate|remove duplicates (from|in)|find (the )?(second )?(largest|smallest|max|min|duplicates?|missing))\b[^?]{0,60}\b(arrays?|lists?|strings?|numbers?|elements?|integers?)\b",
    I,
)
DEBUGGING = re.compile(
    r"\b(debug|troubleshoot|flaky|root cause)\b|\b(fix|investigate)\b[^?.]{0,40}\b(bug|issue|failure|error|exception|leak)\b|\b(fails|failing|crash(es|ing)?)\b[^?.]{0,40}\b(how|why|what)\b|\b(how|what) would you do if\b[^?.]{0,40}\b(fails|breaks|is slow|crash)",
    I,
)
PROJECT = re.compile(
    r"\b(your|the) (last |current |final[- ]year |recent )?project\b|\bin your (project|experience|last (role|job|company)|current (role|job|company))\b|\bhow (have|did) you (use|used|implement|implemented|apply|applied|build|built)\b|\byou (have )?(used|built|implemented|worked on)\b[^?.]{0,30}\bproject\b",
    I,
)
PERSONAL_PAST = re.compile(
    r"\b(how|why|which|what|where|when) (did|have) you\b|\bdid you (use|choose|pick|build|implement|parse|pass|handle|store|deploy|test|train|integrate)\b|\byou (used|chose|picked|built|implemented|deployed)\b",
    I,
)
PERSONAL_CHOICE = re.compile(r"\b(instead of|over|rather than|vs\.?|versus|and not)\b|^(and |so |but )?why not\b", I)
COMPARISON = re.compile(
    r"\b(difference(s)? between|differ(s|ent)? from|vs\.?|versus|compare|compared (to|with)|which is (better|faster|preferred)|pros and cons)\b|\bwhen (would|should|do) you use\b[^?]{0,60}\b(instead of|over|rather than|vs)\b",
    I,
)
SCENARIO = re.compile(
    r"^(suppose|imagine|let'?s say|say you|assume|if you (had|were|need)|what would you do|how would you (handle|approach|design|scale|test|prioriti[sz]e|deal))\b|\bhow would you (design|architect|scale)\b",
    I,
)
SYSTEM_DESIGN = re.compile(
    r"\bsystem design\b|\b(design|architect)\b[^?.]{0,40}\b(system|service|url shortener|shortener|chat|feed|rate limiter|cache|notification|payment|booking|platform|backend|api)\b",
    I,
)
EXPERIENCE = re.compile(
    r"\b(have you (ever )?(used|worked (with|on)|done|tested|written|automated|learned|learnt)|do you have (any )?experience|how (much|many years of) experience|are you (familiar|comfortable|good|experienced) (with|at|in)|do you know|do you use|can you work (with|in))\b",
    I,
)
WHY = re.compile(r"^(and |so |but )?why\b", I)
HOW_TO = re.compile(r"^(and |so |but )?(how (do|does|would|can|could|should|to|is|are)|what are the steps)\b", I)
DEFINITION = re.compile(
    r"^(and |so )?(what (is|are|'s|was|were) (a |an |the )?|define\b|what do you (mean|understand) by\b|explain (the concept of|what)\b|can you explain what\b)",
    I,
)
YES_NO = re.compile(r"^(is|are|can|could|does|do|should|will|would|has|have|was|were)\b", I)

EXPLICIT_FOLLOW_UP = re.compile(
    r"\b(you mentioned|you said|you talked about|earlier you|as you said|going back to|following up|follow[- ]up|you just (said|mentioned)|in that case|based on (that|your answer))\b",
    I,
)
LEADING_CONNECTOR = re.compile(r"^(and|so|but|then|also|okay so|ok so|right so|alright)\b", I)
PRONOUN_REFERENCE = re.compile(r"\b(it|that|this|those|these|they|them|its|such)\b", I)
TERSE_FOLLOW_UP = re.compile(r"^(and |so |but )?(why|how( so)?|what about|why not|really|meaning)\b", I)
CODE_ONLY = re.compile(r"\b(code only|only (the )?code|just (the )?code|just write (it|the code))\b", I)
BRIEF = re.compile(r"\b(briefly|in brief|in short|one (line|sentence|word)|quick(ly)?|short answer|in a nutshell|keep it short)\b", I)
DETAILED = re.compile(r"\b(in detail|in depth|deep dive|elaborate|thoroughly|step by step|walk me through)\b", I)
SECRET = re.compile(r"\b(api[ -]?keys?|secret( key)?s?|access tokens?|credentials?|passwords?)\b", I)
ADVANCED_TECH = re.compile(
    r"\b(event[- ]?loop|asyncio|async ?io|asgi|wsgi|gil|global interpreter lock|concurren\w*|parallelism|race condition|deadlock|cancel\w*|starvation|backpressure|task ?group|coroutines?|garbage collect\w*|memory leak|isolation level|transactions?|indexing|sharding|replication|consistency|idempotenc\w*|distributed|thread[- ]?safe\w*|mutex|semaphore)\b",
    I,
)
BACKEND_API = re.compile(
    r"\b(rest(ful)?|api|endpoint|http|flask|fastapi|django|express|spring|middleware|jwt|oauth|auth(entication|orization)?|cors|status codes?|graphql|websocket|asgi|wsgi)\b",
    I,
)
DATABASE = re.compile(
    r"\b(sql|mysql|postgres\w*|mongodb|nosql|database|db|query|queries|join|index(es|ing)?|normali[sz]ation|primary key|foreign key|transaction|orm|sqlalchemy|redis)\b",
    I,
)
FRAMEWORKS = re.compile(
    r"\b(flask|fastapi|django|express|spring( boot)?|react(js)?|angular|vue|next\.?js|node(\.js)?|laravel|rails|pytorch|tensorflow|pandas|numpy|selenium|playwright|cypress|pytest|junit)\b",
    I,
)
LANGUAGE_ONLY = re.compile(
    r"^(and |so )?(what is|what's|explain|define)\s+(python|java|javascript|typescript|php|c\+\+|c#|go|golang|ruby|rust|kotlin|swift|sql|html|css)\s*\??$",
    I,
)
NO_BUILTINS = re.compile(r"\bwithout (using )?(any )?(built[- ]?in|inbuilt|library|libraries)\b", I)
RATIONALE = re.compile(r"\bwhy (did|do|would|have) you\b|\bwhy (choose|chose|pick|use|go with)\b", I)
LANGUAGES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bpython\b", I), "Python"),
    (re.compile(r"\btype ?script\b", I), "TypeScript"),
    (re.compile(r"\bjava ?script\b|\bnode(\.js| js)?\b", I), "JavaScript"),
    (re.compile(r"\bjava\b", I), "Java"),
    (re.compile(r"\bc\+\+|\bcpp\b", I), "C++"),
    (re.compile(r"\bsql\b|\bmysql\b|\bpostgres", I), "SQL"),
    (re.compile(r"\bgolang\b", I), "Go"),
]

BUDGETS: dict[str, tuple[int, int]] = {
    "introduction": (80, 140),
    "behavioral": (90, 150),
    "coding": (40, 120),
    "debugging": (70, 130),
    "scenario": (70, 130),
    "project": (70, 130),
    "experience": (40, 90),
    "comparison": (50, 100),
    "why": (40, 90),
    "how_to": (50, 100),
    "definition": (30, 70),
    "yes_no": (25, 60),
    "general": (40, 90),
}

TOPIC_HINTS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\b(event[- ]?loop|asyncio|async ?io|starv\w*|blocking call|coroutines?)\b", I),
        "asyncio runs all coroutines on one thread, so any blocking call or long CPU loop stalls every task. Offload blocking I/O with asyncio.to_thread or loop.run_in_executor. CPU-bound pure-Python code in a thread still contends for the GIL (except free-threaded builds), so chunk it and await asyncio.sleep(0) between chunks, or move it to a process pool if allowed. Awaiting something that is already complete may not yield. Debug mode (PYTHONASYNCIODEBUG=1, loop.slow_callback_duration) reports slow callbacks.",
    ),
    (
        re.compile(
            r"\b(cancelled ?error|task ?group|asyncio\.shield)\b|\b(cancel\w*|disconnect\w*)\b.*\b(async\w*|tasks?|asgi|coroutines?)\b|\b(async\w*|tasks?|asgi|coroutines?)\b.*\b(cancel\w*|disconnect\w*)\b",
            I,
        ),
        "task.cancel() raises CancelledError at the task's next await; clean up in try/finally or async with, and if you catch CancelledError, re-raise it. asyncio.TaskGroup (Python 3.11+) cancels the remaining children when one child fails or the enclosing task is cancelled, waits for them, and raises an ExceptionGroup for failures. asyncio.shield protects the inner awaitable, but the awaiting task is still cancelled. On ASGI client disconnect the server sends http.disconnect; whether the handler is cancelled depends on the framework (e.g., Starlette cancels a StreamingResponse, while a regular endpoint keeps running unless it checks request.is_disconnected()).",
    ),
    (
        re.compile(r"\b(gil|global interpreter lock|multithreading|multiprocessing)\b", I),
        "In CPython the GIL lets only one thread run Python bytecode at a time, so threads help I/O-bound work but not CPU-bound pure-Python work; multiprocessing or native extensions that release the GIL give real parallelism (free-threaded 3.13+ builds are the exception).",
    ),
]

TYPE_DIRECTIVES: dict[str, str] = {
    "introduction": "Self-introduction: a ready-to-say first-person intro of about 45-75 seconds: name and current status (degree/role) from the briefing, core skills that overlap the job, one or two real projects or internships with what the candidate actually did, and one closing line on why this role fits. Use only resume facts; job requirements the resume lacks may only be mentioned as interest or learning. Omit any detail the resume doesn't give (such as the college name) — never fill it with an invented or placeholder name.",
    "behavioral": "Behavioral: use STAR briefly (situation, task, action, result) in first person. Only use a real story from the briefing; otherwise give an honest, clearly generic approach the candidate can adapt.",
    "coding": 'Coding: default to Python unless another language is named. Give the simplest correct beginner-friendly solution first in one fenced code block with the language tag; if the question says "program", write a complete runnable script that reads input with input() and prints the result, and if it says "function", write the function plus a short usage line. Handle edge cases (empty input, 0, 1, negatives, duplicates) explicitly. After the code: the logic in 2-3 short sentences, an Example: line showing sample input and its exact output, and Time/Space complexity. Simplest means a plain loop a beginner can explain (e.g., trial division up to the square root), not a micro-optimised variant; mention a faster alternative in at most one sentence instead of replacing the simple one. Never hardcode a single sample value as the only input of a program.',
    "debugging": "Debugging: lead with the most likely causes, then the concrete steps you would take to isolate and fix it, in order.",
    "scenario": "Scenario: state the recommended approach first, then the key steps and one trade-off.",
    "project": 'Project question: answer from the briefing\'s project facts only, in first person. For a full project explanation use: what it does and for whom (as the resume describes it), architecture and flow (input -> processing -> output), technologies with the role each played, your contribution, how it was tested exactly as stated, and the result as stated. Mention a challenge only if the resume names one; otherwise you may name one honest limitation or next improvement, framed as such. Attribute each tool to the project or internship it is listed under — never move tools between them. For a narrow question ("how did you…", "which… did you use") answer exactly that step with the actual library/service/flow from the briefing. If a detail is not in the briefing, say it plainly or describe how you would do it, clearly marked as such. Never invent metrics, users, team size, deployment, or rationale.',
    "experience": "Experience question: answer honestly from the briefing first (yes / some exposure / not yet), then explain the technology correctly in a few sentences. If it is not in the candidate's background, say so plainly and describe related skills or how you'd ramp up — do not claim projects with it.",
    "comparison": "Comparison: state the core difference first, then contrast both sides on the practical points that matter, and say when to use each. If the question asks why the candidate chose one option, give the reason only if the briefing states it; otherwise ground the answer in the project's real needs and present the trade-off honestly without claiming a deliberate decision that isn't documented.",
    "why": "Why question: give the main reason first, then one supporting reason or consequence.",
    "how_to": "How question: describe the process as clear ordered steps in spoken form.",
    "definition": "Definition: one-sentence definition, then how it works or why it matters, plus a tiny example if helpful.",
    "yes_no": "Yes/no question: answer yes or no first, then justify in a sentence or two.",
    "general": "Answer the exact question directly and concretely.",
}


@dataclass
class QuestionAnalysis:
    response_type: str
    category: str
    is_follow_up: bool
    personal_past: bool
    asks_secret: bool
    asks_rationale: bool
    malformed: bool
    advanced: bool
    no_builtins: bool
    code_only: bool
    multi_part: bool
    brevity: str
    needs_personal_context: bool
    complexity: str
    target_words: tuple[int, int]
    max_tokens: int
    low_confidence: bool = False
    language: str | None = None
    ambiguous_task: str | None = None
    topic_text: str = ""
    hints: list[str] = field(default_factory=list)


def _classify(q: str) -> str:
    if INTRODUCTION.search(q):
        return "introduction"
    if BEHAVIORAL.search(q):
        return "behavioral"
    if CODING.search(q):
        return "coding"
    if DEBUGGING.search(q):
        return "debugging"
    if PERSONAL_PAST.search(q) and PERSONAL_CHOICE.search(q):
        return "comparison"
    if PROJECT.search(q) or PERSONAL_PAST.search(q) or re.search(r"\b(explain|describe|walk me through) (your|the|my) project\b", q, I):
        return "project"
    if COMPARISON.search(q):
        return "comparison"
    if SCENARIO.search(q) or SYSTEM_DESIGN.search(q):
        return "scenario"
    if EXPERIENCE.search(q):
        return "experience"
    if WHY.search(q):
        return "why"
    if DEFINITION.search(q):
        return "definition"
    if HOW_TO.search(q):
        return "how_to"
    if YES_NO.search(q):
        return "yes_no"
    return "general"


def _categorize(q: str, kind: str, follow_up: bool, malformed: bool) -> str:
    direct = {
        "introduction": "self_introduction",
        "behavioral": "behavioral_hr",
        "coding": "coding",
        "debugging": "debugging",
        "project": "project",
    }
    if kind in direct:
        return direct[kind]
    if SYSTEM_DESIGN.search(q):
        return "system_design"
    if kind == "scenario":
        return "scenario"
    if kind == "experience":
        return "resume_background"
    if follow_up and len(q.split()) <= 6:
        return "follow_up"
    if malformed and kind == "general":
        return "ambiguous"
    if kind == "comparison" and FRAMEWORKS.search(q):
        return "framework_comparison"
    if LANGUAGE_ONLY.search(q):
        return "programming_language"
    if DATABASE.search(q) and not BACKEND_API.search(q):
        return "database"
    if BACKEND_API.search(q):
        return "backend_api"
    if DATABASE.search(q):
        return "database"
    return "technical_concept"


def _ambiguous_task(q: str) -> str | None:
    if re.search(r"\bmerge\b", q, I) and not re.search(r"\bsorted\b|\bmerge sort\b", q, I):
        return 'Ambiguous: "merge" could mean concatenate, merge two sorted arrays keeping order, or merge without duplicates.'
    if re.search(r"\bflatten\b", q, I) and not re.search(r"\b(one level|single level|deep(ly)?|any depth|fully)\b", q, I):
        return 'Ambiguous: "flatten" could mean one level or any depth, and whether the input may be mutated.'
    if re.search(r"\b(remove|delete) duplicates\b", q, I) and not re.search(r"\b(order|sorted)\b", q, I):
        return "Ambiguous: whether the original order must be preserved."
    return None


def analyze_question(
    question: str,
    *,
    history: list[dict[str, str]] | None = None,
    transcript: list[dict[str, str]] | None = None,
    uncertain: bool = False,
) -> QuestionAnalysis:
    q = re.sub(r"\s+", " ", question.strip())
    has_prior = bool(history) or any(
        str(line.get("text", "")).strip() and str(line.get("text", "")).strip() != q for line in (transcript or [])
    )
    kind = _classify(q)
    language = next((name for rx, name in LANGUAGES if rx.search(q)), None)
    words = len(q.split())
    terse = has_prior and words <= 4 and bool(TERSE_FOLLOW_UP.search(q))
    follow_up = (
        bool(EXPLICIT_FOLLOW_UP.search(q))
        or (has_prior and bool(LEADING_CONNECTOR.search(q)))
        or (has_prior and words <= 14 and bool(PRONOUN_REFERENCE.search(q)) and not language)
        or terse
    )
    code_only = bool(CODE_ONLY.search(q))
    if code_only:
        kind = "coding"
    personal_past = bool(PERSONAL_PAST.search(q))
    malformed = words >= 16 and not re.search(r"[?.!,;]", q)
    advanced = bool(ADVANCED_TECH.search(q))
    marks = q.count("?")
    joins = len(re.findall(r"\b(and|also|plus)\s+(when|why|how|what|which|where|can you|could you)\b", q, I))
    multi_part = max(marks, 1 + joins) > 1
    brevity = "brief" if BRIEF.search(q) else "detailed" if DETAILED.search(q) else "normal"
    needs_personal = (
        kind in {"introduction", "behavioral", "project", "experience"}
        or personal_past
        or terse
        or bool(re.search(r"\b(your|yourself|did you|have you|you used|do you (know|have|use|like|prefer))\b", q, I))
    )
    complexity = (
        "complex"
        if kind in {"coding", "debugging", "scenario"} or multi_part or brevity == "detailed" or advanced or malformed
        else "simple"
    )
    lo, hi = BUDGETS[kind]
    if advanced and kind != "coding":
        lo, hi = max(lo, 90), max(hi, 170)
    elif SYSTEM_DESIGN.search(q):
        lo, hi = max(lo, 100), max(hi, 180)
    if brevity == "brief":
        lo, hi = min(lo, 20), min(hi, 50)
    if brevity == "detailed":
        lo, hi = hi, round(hi * 1.6)
    if multi_part and brevity != "brief":
        hi = round(hi * 1.3)
    max_tokens = (600 if code_only else 750) if kind == "coding" else min(700, round(hi * 1.9) + 60)
    return QuestionAnalysis(
        response_type=kind,
        category=_categorize(q, kind, follow_up, malformed),
        is_follow_up=follow_up,
        personal_past=personal_past,
        asks_secret=bool(SECRET.search(q)),
        asks_rationale=bool(RATIONALE.search(q)) or (bool(re.search(r"^(and |so |but )?why( not)?\b", q, I)) and (terse or personal_past)),
        malformed=malformed,
        advanced=advanced,
        no_builtins=kind == "coding" and bool(NO_BUILTINS.search(q)),
        code_only=code_only,
        multi_part=multi_part,
        brevity=brevity,
        needs_personal_context=needs_personal,
        complexity=complexity,
        target_words=(lo, hi),
        max_tokens=max_tokens,
        low_confidence=uncertain,
        language=language,
        ambiguous_task=_ambiguous_task(q) if kind == "coding" else None,
        topic_text=q,
    )


def describe_analysis(a: QuestionAnalysis, history: list[dict[str, str]] | None = None) -> str:
    lines = [f"Type: {a.response_type}. {TYPE_DIRECTIVES[a.response_type]}"]
    if a.is_follow_up:
        last = (history or [])[-1:] or None
        lines.append(
            f'Follow-up to the previous question ("{str(last[0].get("question", ""))[:140]}"). Resolve "it/that/you mentioned" against that exchange, answer only the new angle, and do not repeat the earlier answer.'
            if last
            else "Follow-up: resolve references using the recent transcript; answer only the new angle."
        )
    if a.category == "system_design":
        lines.append(
            "System design: clarify the core requirements in one line, then cover API, data model, high-level components, the key scaling choice, and one trade-off. Keep it spoken, not a document."
        )
    if a.malformed:
        lines.append(
            'The question is a run-on transcript. Infer the most likely technical question, restate it in a few words at the start (e.g., "So, on what happens to tasks when the client disconnects:"), then answer every part.'
        )
    if a.advanced and a.response_type != "coding":
        lines.append(
            "Advanced topic: be precise about mechanics and edge cases (exact exception names, what is and isn't guaranteed). Prefer current, non-deprecated APIs and name version requirements when relevant."
        )
    for rx, hint in TOPIC_HINTS:
        if rx.search(a.topic_text):
            lines.append(f"Accuracy notes: {hint}")
    if a.asks_rationale:
        lines.append(
            "Rationale question: if the resume does not state why the choice was made, do not invent reasons (cost, free tier, benchmarks, team decisions). Say honestly that you didn't run a formal comparison if that is the case, then give the factual trade-offs between the options and name the alternative from the question explicitly."
        )
    if a.ambiguous_task:
        lines.append(
            f"{a.ambiguous_task} State your assumption in one short sentence, solve that version, and name the alternative interpretation in one sentence."
        )
    if a.no_builtins:
        lines.append(
            '"Without built-in functions": do not use helpers such as math.isqrt, sqrt, sum, any, all, sorted, set or imported libraries for the core logic; basic syntax plus input(), int(), print() and range() is fine.'
        )
    if a.asks_secret:
        lines.append(
            "Credential question: never output a key, token or password value. Name the provider/model and where the key is kept (e.g., environment variable, secret manager) only as the briefing states; if storage isn't stated, say how you keep keys out of code."
        )
    if a.multi_part:
        lines.append("Multi-part: answer every part, in the order asked.")
    if a.code_only:
        lines.append("The interviewer asked for code only: return just the code block.")
    if a.language:
        lines.append(f"Language/stack: {a.language}.")
    if a.low_confidence:
        lines.append(
            "The transcript is low-confidence (speech-to-text was unsure). If the intended question is still clear, answer it. If a key word is ambiguous enough that you could answer the wrong question, give one short clarifying question instead of guessing."
        )
    if not a.code_only:
        lo, hi = a.target_words
        lines.append(
            f"Keep prose to about {lo}-{hi} words besides the code." if a.response_type == "coding" else f"Length: about {lo}-{hi} words."
        )
    return "\n".join(lines)
