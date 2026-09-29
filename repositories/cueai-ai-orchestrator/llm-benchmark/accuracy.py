"""Separate accuracy evaluation — never treat SUCCESS as correct."""

from __future__ import annotations

import re
from typing import Any, Optional

from prompts import PromptCase


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _keyword_hits(response: str, keywords: tuple[str, ...]) -> tuple[int, int]:
    body = _norm(response)
    if not keywords:
        return 0, 0
    hits = sum(1 for kw in keywords if kw.lower() in body)
    return hits, len(keywords)


def _has_accepted_answer(response: str, accepted: tuple[str, ...], expected: str) -> bool:
    body = _norm(response)
    compact = body.replace(",", "")
    candidates = list(accepted)
    if expected:
        candidates.append(expected)
    for ans in candidates:
        token = _norm(ans)
        if not token:
            continue
        if token in body or token in compact:
            return True
        # numeric exact token boundary
        if re.fullmatch(r"-?\d+(?:\.\d+)?%?", token):
            if re.search(rf"(?<![\d.]){re.escape(token)}(?![\d.])", compact):
                return True
    return False


def _label_from_score(score: float) -> str:
    if score >= 0.7:
        return "correct"
    if score >= 0.35:
        return "partially_correct"
    return "incorrect"


def _instruction_following(prompt: PromptCase, text: str) -> float:
    words = len(text.split())
    if prompt.bullet_count:
        bullets = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))
        if bullets == 0:
            bullets = text.count("\n- ")
        if bullets == prompt.bullet_count:
            return 1.0
        return max(0.0, 1.0 - abs(bullets - prompt.bullet_count) * 0.35)
    if prompt.word_limit:
        if words <= prompt.word_limit:
            return 1.0
        overflow = words - prompt.word_limit
        return max(0.0, 1.0 - overflow / max(prompt.word_limit, 1))
    if words < 4:
        return 0.3
    if words > 400:
        return 0.55
    return 0.85


def _quality_and_relevance(prompt: PromptCase, text: str, acc: float) -> tuple[float, float]:
    hits, total = _keyword_hits(text, prompt.expected_keywords)
    relevance = (hits / total) if total else min(1.0, acc)
    words = len(text.split())
    quality = acc
    if prompt.eval_type == "behavioral":
        quality = min(1.0, acc * 0.7 + (0.3 if words >= 25 else 0.1))
    elif prompt.eval_type == "scenario":
        steps = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))
        quality = min(1.0, acc * 0.7 + (0.3 if steps >= 4 or words >= 40 else 0.1))
    return round(quality, 4), round(float(relevance), 4)


def evaluate_response(prompt: PromptCase, response: str) -> dict[str, Any]:
    """
    Returns accuracy fields. Does not invent timing.
    For coding/debugging also sets syntax_ok / logic_ok / correctness_ok.
    """
    text = (response or "").strip()
    if not text:
        return {
            "accuracy_label": "incorrect",
            "accuracy_score": 0.0,
            "syntax_ok": None,
            "logic_ok": None,
            "correctness_ok": False,
            "edge_cases_ok": None,
            "time_complexity_ok": None,
            "quality": 0.0,
            "relevance": 0.0,
            "instruction_following": 0.0,
            "accuracy_notes": "Empty response",
        }

    hits, total = _keyword_hits(text, prompt.expected_keywords)
    ratio = (hits / total) if total else None
    body = _norm(text)

    syntax_ok: Optional[bool] = None
    logic_ok: Optional[bool] = None
    correctness_ok: Optional[bool] = None
    edge_ok: Optional[bool] = None
    complexity_ok: Optional[bool] = None
    notes: list[str] = []
    score = 0.0
    label = "incorrect"

    if prompt.eval_type in {"aptitude", "logical"}:
        exact = _has_accepted_answer(
            text, prompt.accepted_answers, prompt.expected_answer
        )
        if exact:
            score = 1.0
            label = "correct"
            correctness_ok = True
            notes.append("verified_answer_match")
        elif ratio is not None and ratio >= 0.5:
            score = 0.5
            label = "partially_correct"
            correctness_ok = False
            notes.append(f"keywords={hits}/{total}; no exact answer match")
        else:
            score = float(ratio or 0.0) * 0.3
            label = "incorrect"
            correctness_ok = False
            notes.append("expected_answer_missing")

    elif prompt.eval_type == "coding":
        checks = prompt.coding_checks or ("def", "return")
        check_hits = sum(1 for c in checks if c.lower() in body)
        has_def = "def " in body or body.startswith("def")
        has_complexity = "o(" in body or "o(n" in body or "log" in body
        syntax_ok = has_def and check_hits >= max(1, len(checks) // 2)
        logic_ok = (ratio is not None and ratio >= 0.35) or check_hits >= 2
        edge = any(k in body for k in ("edge", "empty", "none", "n <", "n<="))
        score = 0.0
        score += 0.35 * (check_hits / max(1, len(checks)))
        score += 0.35 * (ratio or 0.0)
        score += 0.15 if has_complexity else 0.0
        score += 0.15 if edge else 0.0
        score = min(1.0, score)
        label = _label_from_score(score)
        correctness_ok = label == "correct"
        edge_ok = edge
        complexity_ok = has_complexity
        notes.append(
            f"coding_checks={check_hits}/{len(checks)}; complexity={has_complexity}; edge={edge}"
        )

    elif prompt.eval_type == "debugging":
        checks = prompt.coding_checks or ()
        check_hits = sum(1 for c in checks if c.lower() in body)
        explains = any(
            k in body
            for k in ("error", "bug", "fix", "because", "cause", "issue")
        )
        has_fix_code = "def " in body or "for " in body or "while " in body or ":" in text
        syntax_ok = explains or check_hits > 0
        logic_ok = check_hits >= max(1, len(checks) // 2) if checks else explains
        score = 0.0
        score += 0.45 * ((check_hits / max(1, len(checks))) if checks else (1.0 if explains else 0.0))
        score += 0.35 * (ratio or 0.0)
        score += 0.20 if has_fix_code else 0.0
        score = min(1.0, score)
        label = _label_from_score(score)
        correctness_ok = label == "correct"
        notes.append(f"debug_checks={check_hits}/{len(checks) if checks else 0}")

    elif prompt.eval_type == "sql":
        has_select = "select" in body
        syntax_ok = has_select
        score = (0.4 if has_select else 0.0) + 0.6 * (ratio or 0.0)
        logic_ok = score >= 0.5
        label = _label_from_score(score)
        correctness_ok = label == "correct"
        notes.append(f"keywords={hits}/{total}; select={has_select}")

    elif prompt.eval_type in {"behavioral", "scenario"}:
        if total == 0:
            score = 0.6 if len(text.split()) >= 20 else 0.3
        else:
            score = ratio or 0.0
        if len(text.split()) >= 25:
            score = min(1.0, score + 0.15)
        if prompt.eval_type == "scenario":
            steps = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))
            if steps >= 4:
                score = min(1.0, score + 0.1)
        label = _label_from_score(score)
        correctness_ok = label == "correct"
        notes.append(f"keywords={hits}/{total}; words={len(text.split())}")

    else:
        # conceptual / factual
        if prompt.accepted_answers or (
            prompt.expected_answer
            and prompt.eval_type == "factual"
            and re.search(r"\d", prompt.expected_answer)
        ):
            if _has_accepted_answer(
                text, prompt.accepted_answers, prompt.expected_answer
            ):
                score = 1.0
                label = "correct"
                correctness_ok = True
                notes.append("verified_answer_match")
            elif total:
                score = ratio or 0.0
                label = _label_from_score(score)
                correctness_ok = label == "correct"
                notes.append(f"keywords={hits}/{total}")
            else:
                score = 0.0
                label = "incorrect"
                correctness_ok = False
                notes.append("expected_answer_missing")
        elif total == 0:
            return {
                "accuracy_label": "not_evaluated",
                "accuracy_score": None,
                "syntax_ok": None,
                "logic_ok": None,
                "correctness_ok": None,
                "edge_cases_ok": None,
                "time_complexity_ok": None,
                "quality": None,
                "relevance": None,
                "instruction_following": _instruction_following(prompt, text),
                "accuracy_notes": "No expected keywords configured",
            }
        else:
            score = ratio or 0.0
            label = _label_from_score(score)
            correctness_ok = label == "correct"
            notes.append(f"keywords={hits}/{total}")

    instr = _instruction_following(prompt, text)
    quality, relevance = _quality_and_relevance(prompt, text, float(score))
    return {
        "accuracy_label": label,
        "accuracy_score": round(float(score), 4),
        "syntax_ok": syntax_ok,
        "logic_ok": logic_ok,
        "correctness_ok": correctness_ok,
        "edge_cases_ok": edge_ok,
        "time_complexity_ok": complexity_ok,
        "quality": quality,
        "relevance": relevance,
        "instruction_following": round(instr, 4),
        "accuracy_notes": "; ".join(notes),
    }


def accuracy_numeric(label: str | None, score: float | None) -> Optional[float]:
    if score is not None:
        return float(score)
    if label == "correct":
        return 1.0
    if label == "partially_correct":
        return 0.5
    if label == "incorrect":
        return 0.0
    return None
