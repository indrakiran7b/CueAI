"""Knowledge snippets and live-session side effects on the existing JSON store.

Meeting-aware retrieval:
  1) Documents with meeting_id == active meeting (Meeting Knowledge)
  2) Workspace documents (meeting_id empty), optionally limited to attached ids
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.persistence.store import read_store, update_store


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _tokenize(question: str) -> list[str]:
    return [
        t
        for t in re.sub(r"[^a-z0-9+#.\s-]", " ", question.lower()).split()
        if len(t) > 2
    ]


def _should_retrieve(question: str) -> bool:
    q = question.strip()
    if len(q) < 12:
        return False
    lower = q.lower()
    if re.match(r"^(okay|ok|alright|thanks|thank you|got it|sure|yeah|yes|no|hmm)\b", lower):
        return False
    if re.match(r"^(let'?s move on|moving on|next question|continue)\b", lower):
        return False
    if "?" in q:
        return True
    if re.match(
        r"^(what|why|how|when|where|who|which|can you|could you|tell me|describe|explain)\b",
        lower,
    ):
        return True
    if re.search(
        r"\b(project|architecture|technolog|stack|experience|implement|integrat|requirement|client)\b",
        lower,
    ):
        return True
    return False


def _score_doc(doc: dict[str, Any], tokens: list[str]) -> int:
    hay = f"{doc.get('title', '')}\n{doc.get('content', '')}".lower()
    score = 0
    for token in tokens:
        if token in hay:
            score += 2 if len(token) > 5 else 1
    title = str(doc.get("title") or "").lower()
    if any(token in title for token in tokens):
        score += 3
    return score


def _format_chunks(ranked: list[tuple[int, dict[str, Any]]], *, limit: int, max_chars: int) -> str:
    chunks: list[str] = []
    for _score, doc in ranked[:limit]:
        body = re.sub(r"\s+", " ", str(doc.get("content") or "")).strip()[:max_chars]
        name = doc.get("originalFilename") or doc.get("title")
        chunks.append(f"Source: {name}\n{body or '(title match only)'}")
    return "\n\n".join(chunks)


def retrieve_knowledge(
    question: str,
    *,
    limit: int = 3,
    max_chars: int = 900,
    workspace_id: str | None = None,
    meeting_id: str | None = None,
    document_ids: list[str] | None = None,
) -> str:
    if not _should_retrieve(question):
        return ""
    tokens = _tokenize(question)
    if not tokens:
        return ""
    store = read_store()
    docs = list(store.get("knowledge") or [])
    attach = set(document_ids or [])

    def in_workspace(doc: dict[str, Any]) -> bool:
        wid = doc.get("workspaceId")
        if workspace_id and wid and wid != workspace_id:
            return False
        return True

    meeting_ranked: list[tuple[int, dict[str, Any]]] = []
    if meeting_id:
        for doc in docs:
            if not in_workspace(doc):
                continue
            if doc.get("status") == "failed":
                continue
            if doc.get("meetingId") != meeting_id:
                continue
            if doc.get("status") not in (None, "indexed", "processing", "uploaded"):
                # Prefer indexed; still allow content from processing if text present
                if doc.get("status") != "indexed":
                    continue
            if doc.get("status") != "indexed":
                continue
            score = _score_doc(doc, tokens)
            if score:
                meeting_ranked.append((score, doc))
        meeting_ranked.sort(key=lambda item: item[0], reverse=True)
        if meeting_ranked:
            body = _format_chunks(meeting_ranked, limit=limit, max_chars=max_chars)
            return f"MEETING KNOWLEDGE\n\n{body}" if body else ""

    workspace_ranked: list[tuple[int, dict[str, Any]]] = []
    for doc in docs:
        if not in_workspace(doc):
            continue
        if doc.get("status") != "indexed":
            continue
        if doc.get("meetingId"):
            continue
        if attach and doc.get("id") not in attach:
            continue
        score = _score_doc(doc, tokens)
        if score:
            workspace_ranked.append((score, doc))
    workspace_ranked.sort(key=lambda item: item[0], reverse=True)
    if not workspace_ranked:
        return ""
    body = _format_chunks(workspace_ranked, limit=limit, max_chars=max_chars)
    return f"WORKSPACE KNOWLEDGE\n\n{body}" if body else ""


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


def active_meeting_document_ids() -> list[str]:
    store = read_store()
    mid = active_meeting_id()
    if mid:
        for meeting in store.get("meetings") or []:
            if meeting.get("id") == mid:
                return list(meeting.get("documentIds") or [])
    briefing = store.get("liveBriefing") or {}
    return list(briefing.get("documentIds") or [])
