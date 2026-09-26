"""Knowledge snippets and live-session side effects on the existing JSON store."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.persistence.store import read_store, update_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def retrieve_knowledge(question: str, *, limit: int = 3, max_chars: int = 900) -> str:
    tokens = [
        t
        for t in re.sub(r"[^a-z0-9+#.\s-]", " ", question.lower()).split()
        if len(t) > 2
    ]
    if not tokens:
        return ""
    store = read_store()
    ranked: list[tuple[int, dict[str, Any]]] = []
    for doc in store.get("knowledge") or []:
        if doc.get("status") == "failed":
            continue
        hay = f"{doc.get('title', '')}\n{doc.get('content', '')}".lower()
        score = 0
        for token in tokens:
            if token in hay:
                score += 2 if len(token) > 5 else 1
        title = str(doc.get("title") or "").lower()
        if any(token in title for token in tokens):
            score += 3
        if score:
            ranked.append((score, doc))
    ranked.sort(key=lambda item: item[0], reverse=True)
    chunks: list[str] = []
    for _score, doc in ranked[:limit]:
        body = re.sub(r"\s+", " ", str(doc.get("content") or "")).strip()[:max_chars]
        chunks.append(f"Document: {doc.get('title')}\n{body or '(title match only)'}")
    return "\n\n".join(chunks)


def record_usage(
    session: dict[str, Any] | None,
    *,
    provider: str,
    model: str,
    total: int,
    feature: str,
) -> bool:
    """Same rule as Next.js: no session means nothing is written."""
    if not session or not session.get("userId"):
        return False

    def mutate(store: dict[str, Any]) -> None:
        store.setdefault("usage", [])
        store["usage"].insert(
            0,
            {
                "id": f"use_{uuid.uuid4().hex[:8]}",
                "createdAt": _now(),
                "workspaceId": session.get("workspaceId") or store["workspace"]["id"],
                "userId": session["userId"],
                "userName": session.get("name") or "",
                "type": "tokens",
                "quantity": max(1, total),
                "provider": provider,
                "model": model,
                "metadata": {"feature": feature},
            },
        )
        store["usage"] = store["usage"][:2000]

    update_store(mutate)
    return True


def append_exchange(meeting_id: str | None, prompt: str, answer: str, *, provider: str, model: str) -> None:
    if not meeting_id or not answer.strip():
        return
    now = _now()

    def mutate(store: dict[str, Any]) -> None:
        meeting = next((m for m in store.get("meetings") or [] if m.get("id") == meeting_id), None)
        if not meeting or meeting.get("status") != "live":
            return
        meeting.setdefault("answers", [])
        meeting["answers"].insert(
            0,
            {
                "prompt": prompt[:2000],
                "answer": answer[:4000],
                "at": now,
                "provider": provider,
                "model": model,
                "source": "auto",
                "status": "ok",
                "questionWho": "Interviewer",
            },
        )
        meeting["answers"] = meeting["answers"][:80]
        meeting.setdefault("transcript", [])
        meeting["transcript"].append(
            {"who": "Interviewer", "text": prompt[:1000], "at": now, "source": "system"}
        )
        meeting["transcript"].append(
            {"who": "CueAI", "text": answer[:2000], "at": now, "source": "cueai"}
        )

    try:
        update_store(mutate)
    except Exception:
        return


def active_meeting_id() -> str | None:
    store = read_store()
    active = store.get("activeMeetingId")
    if isinstance(active, str) and active:
        return active
    for meeting in store.get("meetings") or []:
        if meeting.get("status") == "live":
            return meeting.get("id")
    return None
