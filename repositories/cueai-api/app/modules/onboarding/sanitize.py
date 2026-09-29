from __future__ import annotations

from typing import Any

_ONBOARDING_CHOICES: dict[str, dict[str, Any]] = {
    "persona": {
        "kind": "single",
        "choices": {
            "job_seeker",
            "sales",
            "consultant",
            "engineer",
            "recruiter",
            "founder",
            "student",
            "other",
        },
    },
    "goals": {
        "kind": "multi",
        "max": 6,
        "choices": {
            "job_interviews",
            "sales_calls",
            "client_meetings",
            "team_meetings",
            "hiring_interviews",
            "lectures",
        },
    },
    "assistLevel": {
        "kind": "single",
        "choices": {"minimal", "balanced", "maximum"},
    },
    "referral": {
        "kind": "single",
        "choices": {"search", "friend", "social", "video", "work", "other"},
        "optional": True,
    },
}


def is_onboarding_answered(answers: dict[str, Any]) -> bool:
    for field, spec in _ONBOARDING_CHOICES.items():
        if spec.get("optional"):
            continue
        value = answers.get(field)
        if spec["kind"] == "multi":
            if not isinstance(value, list) or len(value) == 0:
                return False
        elif not isinstance(value, str) or not value.strip():
            return False
    return True


def sanitize_onboarding_answers(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    answers: dict[str, Any] = {}
    for field, spec in _ONBOARDING_CHOICES.items():
        value = raw.get(field)
        allowed = spec["choices"]
        if spec["kind"] == "multi":
            if not isinstance(value, list):
                continue
            picked = []
            seen = set()
            for item in value:
                if isinstance(item, str) and item in allowed and item not in seen:
                    seen.add(item)
                    picked.append(item)
                if len(picked) >= spec["max"]:
                    break
            if picked:
                answers[field] = picked
            continue
        if isinstance(value, str) and value in allowed:
            answers[field] = value
    return answers
