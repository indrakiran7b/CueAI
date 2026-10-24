"""Deterministic answer guard ported from apps/web/src/lib/live-answer-guard.ts.

No model call and no code execution: code is only checked statically, so a passing result
is reported as "static_ok", never as "tests passed".
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

I = re.IGNORECASE

SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), "[redacted private key]"),
    (re.compile(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}"), "[redacted]"),
    (re.compile(r"\bgsk_[A-Za-z0-9]{20,}"), "[redacted]"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{30,}"), "[redacted]"),
    (re.compile(r"\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}"), "[redacted]"),
    (re.compile(r"\bxox[abpr]-[A-Za-z0-9-]{10,}"), "[redacted]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[redacted]"),
    (re.compile(r"(\bBearer\s+)[A-Za-z0-9._~+/-]{20,}=*", I), r"\1[redacted]"),
]

PREAMBLE = re.compile(
    r"^\s*(?:(?:sure|certainly|of course|absolutely|great question|good question|that's a (?:great|good) question|okay|ok)[,.!:]?\s+)+(?:here(?:'s| is) (?:the|my|an?) (?:answer|response|explanation)[^.:\n]*[.:]\s*)?"
    r"|^\s*here(?:'s| is) (?:the|my|an?) (?:answer|response|explanation)[^.:\n]*[.:]\s*",
    I,
)
FENCE = re.compile(r"```([^\n`]*)\n([\s\S]*?)```")
PLACEHOLDER_ORG = re.compile(
    r",?\s+(?:at|from|with|in) (?:the )?((?:XYZ|ABC|PQR|XXX|Acme)(?: [A-Z][a-z]+)? (?:University|College|Institute(?: of Technology)?|School|Company|Corp(?:oration)?|Inc\.?|Technologies|Solutions|Labs|Pvt\.? Ltd\.?))(?=\W)"
)
FIRST_PERSON = re.compile(r"\b(i|i'm|i've|i'd|i'll|my|me|we|we've|our)\b", I)
PROJECT_SUBJECT = re.compile(r"\b(it|this|the (project|app|application|system|tool|model|analy[sz]er|platform|website|api))\b", I)
NUMBER_WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10"}
BIG_EMPLOYERS = "Google|Amazon|Microsoft|Meta|Facebook|Apple|Netflix|Infosys|TCS|Tata Consultancy Services|Wipro|Accenture|Cognizant|Deloitte|IBM|Oracle|Capgemini|HCL|Flipkart|Adobe|Salesforce|Uber"
YEARS = re.compile(r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many)\+?\s*(?:\+\s*)?(?:years?|yrs?)\b", I)
YEARS_CONTEXT = re.compile(r"\b(experience|experienced|working|worked|been|industry|professional|career|developer|engineer)\b", I)
SCALE = re.compile(
    r"\b(millions?|thousands?|hundreds?|lakhs?) of (users|customers|clients|people|requests|students|recruiters|records|transactions)\b"
    r"|\b(\d[\d,.]*\s?(?:k|m|million|thousand)?)\+?\s+(?:active |daily |monthly |concurrent )?(users|customers|clients|downloads|requests per)\b",
    I,
)
LEADERSHIP = re.compile(
    r"\b(i|we)\s+((also|have|had|then)\s+)?(led|managed|mentored|supervised|headed)\b|\b(led|managed|headed) (a|the|my|our)( \w+)? (team|group|squad)\b|\bteam lead\b|\bas (the )?(team )?lead\b",
    I,
)
EMPLOYER = re.compile(
    rf"\b(work(?:ed|ing)?|intern(?:ed|ing|ship)?|employed|joined|role|position|job)\b[^.]{{0,25}}\b(?:at|for|with)\s+({BIG_EMPLOYERS})\b(?!\s+(?:cloud|gemini|api|apis|colab|maps|drive|services|sdk|web services|azure))",
    I,
)
PY_OPENER = re.compile(r"^(async\s+)?(def|class|if|elif|else|for|while|try|except|finally|with)\b")
CODE_LINE = re.compile(
    r"^\s*(def |class |for |while |if |elif |else\s*:|try\s*:|except\b|return\b|print\(|import |from \w+ import|function |const |let |var |public |private |#include|[A-Za-z_][\w.\[\]]*\s*[+\-*/]?=\s*\S|\}|\{$)"
)


@dataclass
class GuardResult:
    answer: str
    changes: list[str] = field(default_factory=list)
    validation_status: str = "not_applicable"
    issues: list[str] = field(default_factory=list)


def redact_secrets(text: str) -> str:
    for rx, repl in SECRET_PATTERNS:
        text = rx.sub(repl, text)
    return text


def _unsupported_scale(sentence: str, ctx: str) -> str | None:
    for m in re.finditer(r"\b(\d{1,3}(?:\.\d+)?)\s?(%|percent\b)", sentence, I):
        if not re.search(rf"\b{re.escape(m.group(1))}\s?(%|percent)", ctx, I):
            return "metric"
    m = SCALE.search(sentence)
    if m:
        token = (m.group(1) or m.group(3) or "").strip().lower()
        if not token or token.rstrip("s") not in ctx.lower():
            return "scale"
    return None


def _unsupported_claim(sentence: str, ctx: str, personal: bool) -> str | None:
    if not FIRST_PERSON.search(sentence):
        if not personal or not PROJECT_SUBJECT.search(sentence):
            return None
        return _unsupported_scale(sentence, ctx)
    y = YEARS.search(sentence)
    if y and YEARS_CONTEXT.search(sentence):
        n = NUMBER_WORDS.get(y.group(1).lower(), y.group(1).lower())
        supported = (
            re.search(rf"\b{n}\+?\s*(years?|yrs?)\b", ctx, I) if n.isdigit() else re.search(r"\b\d+\+?\s*(years?|yrs?)\b", ctx, I)
        )
        if not supported:
            return "years"
    scale = _unsupported_scale(sentence, ctx)
    if scale:
        return scale
    if LEADERSHIP.search(sentence) and not re.search(r"\b(led|lead|managed|mentored|supervised|headed)\b", ctx, I):
        return "leadership"
    e = EMPLOYER.search(sentence)
    if e and not re.search(rf"\b{re.escape(e.group(2))}\b", ctx, I):
        return "employer"
    return None


def _drop_unsupported(prose: str, ctx: str, personal: bool, reasons: set[str]) -> str:
    out = []
    for line in prose.split("\n"):
        sentences = re.split(r"(?<=[.!?])\s+", line)
        kept = []
        for s in sentences:
            reason = _unsupported_claim(s, ctx, personal) if s.strip() else None
            if reason:
                reasons.add(reason)
            else:
                kept.append(s)
        out.append(line if len(kept) == len(sentences) else " ".join(kept).strip())
    return "\n".join(out)


def _fence_bare_code(text: str, lang: str) -> str | None:
    lines = text.split("\n")
    start = end = -1
    for i, line in enumerate(lines):
        is_code = bool(CODE_LINE.search(line)) or (start >= 0 and bool(re.match(r"^\s{2,}\S", line)))
        if is_code:
            if start < 0:
                start = i
            end = i
        elif start >= 0 and line.strip() and end - start >= 2:
            break
        elif start >= 0 and line.strip():
            start = -1
    if start < 0 or end - start < 2:
        return None
    return "\n".join([*lines[:start], f"```{lang}", *lines[start : end + 1], "```", *lines[end + 1 :]])


def _strip_py_strings(code: str) -> str:
    code = re.sub(r"(\"\"\"|''')[\s\S]*?\1", lambda m: re.sub(r"[^\n]", " ", m.group(0)), code)
    return re.sub(r"([\"'])(?:\\.|(?!\1)[^\\\n])*\1", lambda m: " " * len(m.group(0)), code)


def check_python_static(code: str) -> list[str]:
    issues: list[str] = []
    lines = [re.sub(r"#.*$", "", line) for line in _strip_py_strings(code).split("\n")]
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    indents = [0]
    expect_indent = False
    opener_line = 0
    logical_is_opener = False
    logical_has_colon = False
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        continuation = bool(stack) or (i > 0 and lines[i - 1].rstrip().endswith("\\"))
        if not continuation:
            lead = re.match(r"^[ \t]*", line).group(0)  # type: ignore[union-attr]
            if "\t" in lead and " " in lead:
                issues.append(f"line {i + 1}: mixed tabs and spaces")
            indent = len(lead.replace("\t", "    "))
            top = indents[-1]
            if expect_indent:
                if indent <= top:
                    issues.append(f"line {i + 1}: expected an indented block after line {opener_line}")
                else:
                    indents.append(indent)
            elif indent > top:
                issues.append(f"line {i + 1}: unexpected indent")
            elif indent < top:
                while len(indents) > 1 and indents[-1] > indent:
                    indents.pop()
                if indents[-1] != indent:
                    issues.append(f"line {i + 1}: unindent does not match any outer level")
            expect_indent = False
            logical_is_opener = bool(PY_OPENER.match(line.strip()))
            logical_has_colon = False
            opener_line = i + 1
        for ch in line:
            if ch in "([{":
                stack.append(ch)
            elif ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    issues.append(f"line {i + 1}: unbalanced '{ch}'")
                    return issues
        if ":" in line:
            logical_has_colon = True
        if not stack and not line.rstrip().endswith("\\") and logical_is_opener:
            if line.rstrip().endswith(":"):
                expect_indent = True
            elif not logical_has_colon:
                issues.append(f"line {opener_line}: missing colon")
    if stack:
        issues.append(f"unclosed '{stack[-1]}'")
    if expect_indent:
        issues.append(f"line {opener_line}: block has no body")
    return issues[:5]


def check_braces_static(code: str) -> list[str]:
    clean = re.sub(r"/\*[\s\S]*?\*/", "", code)
    clean = re.sub(r"//.*$", "", clean, flags=re.M)
    clean = re.sub(r"([\"'`])(?:\\.|(?!\1)[^\\])*\1", "", clean)
    pairs = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    for ch in clean:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs and (not stack or stack.pop() != pairs[ch]):
            return [f"unbalanced '{ch}'"]
    return [f"unclosed '{stack[-1]}'"] if stack else []


def _check_block(lang: str, code: str) -> list[str]:
    lang = lang.strip().lower()
    if lang in {"python", "py"} or (not lang and re.search(r"^\s*(def |import |print\(|for .+:\s*$)", code, re.M)):
        return check_python_static(code)
    if re.fullmatch(r"js|javascript|ts|typescript|java|c|cpp|c\+\+|cs|csharp|c#|go|kotlin|swift|rust|php", lang):
        return check_braces_static(code)
    return []


def guard_live_answer(
    raw: str,
    *,
    context: str = "",
    response_type: str | None = None,
    language: str | None = None,
    personal: bool = False,
) -> GuardResult:
    changes: list[str] = []
    text = raw.strip()

    redacted = redact_secrets(text)
    if redacted != text:
        changes.append("secret_redacted")
    text = redacted

    normalized = re.sub(r"[\u2010\u2011]", "-", text)
    normalized = FENCE.sub(
        lambda m: m.group(0).replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'").replace("\u2212", "-"),
        normalized,
    )
    if normalized != text:
        changes.append("characters_normalized")
    text = normalized

    placeholder = PLACEHOLDER_ORG.sub(lambda m: m.group(0) if m.group(1) in context else "", text)
    if placeholder != text:
        changes.append("placeholder_removed")
    text = placeholder

    stripped = PREAMBLE.sub("", text, count=1)
    if stripped != text and stripped.strip():
        text = stripped[0].upper() + stripped[1:]
        changes.append("preamble_removed")

    if text.count("```") % 2 == 1:
        text += "\n```"
        changes.append("fence_closed")

    if response_type == "coding" and "```" not in text:
        lang = (language or "python").lower().replace("c++", "cpp").replace("c#", "csharp")
        fenced = _fence_bare_code(text, lang)
        if fenced:
            text = fenced
            changes.append("code_fenced")

    reasons: set[str] = set()
    pieces: list[str] = []
    last = 0
    for m in FENCE.finditer(text):
        pieces.append(_drop_unsupported(text[last : m.start()], context, personal, reasons))
        pieces.append(m.group(0))
        last = m.end()
    pieces.append(_drop_unsupported(text[last:], context, personal, reasons))
    filtered = re.sub(r"\n{3,}", "\n\n", "".join(pieces)).strip()
    if reasons:
        if FENCE.sub("", filtered).strip():
            text = filtered
            changes.extend(f"unsupported_{r}_removed" for r in sorted(reasons))
        else:
            changes.append("unsupported_claim_kept")

    issues: list[str] = []
    blocks = 0
    for m in FENCE.finditer(text):
        blocks += 1
        issues.extend(_check_block(m.group(1) or language or "", m.group(2)))
    status = "not_applicable" if not blocks else "static_issues" if issues else "static_ok"
    return GuardResult(answer=text, changes=changes, validation_status=status, issues=issues)
