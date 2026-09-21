"""Streaming benchmark runner with high-resolution timing and accuracy."""

from __future__ import annotations

import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    NotFoundError,
    OpenAI,
    RateLimitError,
)

from accuracy import evaluate_response
from config import (
    MAX_RETRIES,
    MAX_TOKENS,
    RETRY_BACKOFF_SEC,
    SYSTEM_PROMPT,
    TEMPERATURE,
    ModelConfig,
)
from prompts import PromptCase


def _redact(text: str) -> str:
    cleaned = re.sub(r"sk-or-v1-[A-Za-z0-9]+", "[REDACTED]", text or "")
    cleaned = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", cleaned, flags=re.I)
    return cleaned[:400]


@dataclass
class RunResult:
    timestamp: str
    provider: str
    model_name: str
    model_id: str
    question_id: str
    category: str
    difficulty: str
    question: str
    run_number: int
    request_start_time: str
    first_token_time: str
    completion_time: str
    ttft_ms: Optional[float]
    ttft_seconds: Optional[float]
    total_latency_ms: Optional[float]
    total_latency_seconds: Optional[float]
    generation_time_ms: Optional[float]
    generation_time_seconds: Optional[float]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]
    tokens_per_second: Optional[float]
    complete_response: str
    status: str
    error_type: str
    error_message: str
    expected_answer: str = ""
    accuracy_label: str = ""
    accuracy_score: Optional[float] = None
    syntax_ok: Optional[bool] = None
    logic_ok: Optional[bool] = None
    correctness_ok: Optional[bool] = None
    edge_cases_ok: Optional[bool] = None
    time_complexity_ok: Optional[bool] = None
    quality: Optional[float] = None
    relevance: Optional[float] = None
    instruction_following: Optional[float] = None
    consistency: Optional[float] = None
    retry_count: int = 0
    input_cost: str = "UNKNOWN"
    output_cost: str = "UNKNOWN"
    total_cost: str = "UNKNOWN"
    accuracy_notes: str = ""
    question_number: int = 0
    question_total: int = 0

    def to_row(self) -> dict[str, Any]:
        row = asdict(self)
        row["model"] = self.model_name
        row["response"] = self.complete_response
        row["accuracy"] = self.accuracy_label
        return row


def _wall_now() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _usage_int(usage: Any, field: str) -> Optional[int]:
    if usage is None:
        return None
    value = getattr(usage, field, None)
    if value is None and isinstance(usage, dict):
        value = usage.get(field)
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def classify_error(exc: BaseException) -> tuple[str, str]:
    """Return (error_type, safe_message). Never include secrets."""
    msg = str(exc).replace("\n", " ")[:400]
    if isinstance(exc, AuthenticationError):
        return "invalid_api_key", "OpenRouter rejected the API key (unauthorized)"
    if isinstance(exc, NotFoundError):
        return "model_unavailable", f"Model unavailable: {_redact(msg)}"
    if isinstance(exc, RateLimitError):
        return "rate_limit", f"Rate limited: {_redact(msg)}"
    if isinstance(exc, APITimeoutError):
        return "timeout", f"Request timed out: {_redact(msg)}"
    if isinstance(exc, APIConnectionError):
        return "network_error", f"Network error: {_redact(msg)}"
    if isinstance(exc, APIStatusError):
        code = getattr(exc, "status_code", None)
        if code == 401:
            return "invalid_api_key", "OpenRouter unauthorized (401)"
        if code == 404:
            return "model_unavailable", f"Not found (404): {msg}"
        if code == 429:
            return "rate_limit", f"Rate limited (429): {_redact(msg)}"
        if code == 402:
            return "insufficient_credits", "OpenRouter has no remaining credits for this key"
        return "api_error", f"API status {code}: {_redact(msg)}"
    return "unknown_error", f"{type(exc).__name__}: {_redact(msg)}"


def _should_retry(error_type: str) -> bool:
    return error_type in {"rate_limit", "timeout", "network_error", "api_error"}


def _usage_cost(usage: Any) -> str:
    if usage is None:
        return "UNKNOWN"
    cost = getattr(usage, "cost", None)
    if cost is None and isinstance(usage, dict):
        cost = usage.get("cost")
    try:
        if cost is None:
            return "UNKNOWN"
        return f"{float(cost):.8f}"
    except (TypeError, ValueError):
        return "UNKNOWN"


def _stream_once(
    client: OpenAI,
    model: ModelConfig,
    prompt: PromptCase,
) -> dict[str, Any]:
    """Stream one completion; return measured timings + text + usage."""
    request_start_wall = _wall_now()
    request_start = time.perf_counter()
    first_token_at: Optional[float] = None
    first_token_wall = ""
    last_token_at: Optional[float] = None
    chunks: list[str] = []
    finish_reason = None
    usage = None

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for role, content in prompt.history:
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt.text})

    stream = client.chat.completions.create(
        model=model.model_id,
        messages=messages,
        temperature=TEMPERATURE,
        max_tokens=MAX_TOKENS,
        stream=True,
        stream_options={"include_usage": True},
    )

    for event in stream:
        if getattr(event, "usage", None) is not None:
            usage = event.usage
        choices = getattr(event, "choices", None) or []
        if not choices:
            continue
        choice = choices[0]
        delta = getattr(choice, "delta", None)
        content = getattr(delta, "content", None) if delta is not None else None
        if content:
            now = time.perf_counter()
            if first_token_at is None:
                first_token_at = now
                first_token_wall = _wall_now()
            last_token_at = now
            chunks.append(content)
        fr = getattr(choice, "finish_reason", None)
        if fr:
            finish_reason = fr

    completion_at = last_token_at if last_token_at is not None else time.perf_counter()
    completion_wall = _wall_now()
    text = "".join(chunks)

    ttft_s = (first_token_at - request_start) if first_token_at is not None else None
    total_s = completion_at - request_start
    gen_s = (
        (completion_at - first_token_at)
        if first_token_at is not None
        else None
    )

    return {
        "text": text,
        "request_start_wall": request_start_wall,
        "first_token_wall": first_token_wall,
        "completion_wall": completion_wall,
        "ttft_s": ttft_s,
        "total_s": total_s,
        "gen_s": gen_s,
        "usage": usage,
        "finish_reason": finish_reason,
    }


def _failed_result(
    *,
    model: ModelConfig,
    prompt: PromptCase,
    question_number: int,
    question_total: int,
    run_number: int,
    error_type: str,
    error_message: str,
    request_start_wall: str = "",
    first_token_wall: str = "",
    completion_wall: str = "",
    ttft_s: Optional[float] = None,
    total_s: Optional[float] = None,
    gen_s: Optional[float] = None,
    usage: Any = None,
    response: str = "",
    retry_count: int = 0,
) -> RunResult:
    return RunResult(
        timestamp=_iso_now(),
        provider=model.provider,
        model_name=model.display_name,
        model_id=model.model_id,
        question_id=prompt.id,
        category=prompt.category,
        difficulty=prompt.difficulty,
        question=prompt.text,
        run_number=run_number,
        request_start_time=request_start_wall,
        first_token_time=first_token_wall,
        completion_time=completion_wall or _wall_now(),
        ttft_ms=round(ttft_s * 1000, 3) if ttft_s is not None else None,
        ttft_seconds=round(ttft_s, 6) if ttft_s is not None else None,
        total_latency_ms=round(total_s * 1000, 3) if total_s is not None else None,
        total_latency_seconds=round(total_s, 6) if total_s is not None else None,
        generation_time_ms=round(gen_s * 1000, 3) if gen_s is not None else None,
        generation_time_seconds=round(gen_s, 6) if gen_s is not None else None,
        input_tokens=_usage_int(usage, "prompt_tokens"),
        output_tokens=_usage_int(usage, "completion_tokens"),
        total_tokens=_usage_int(usage, "total_tokens"),
        tokens_per_second=None,
        complete_response=response,
        status="FAILED",
        error_type=error_type,
        error_message=_redact(error_message),
        expected_answer=prompt.expected_answer,
        accuracy_label="failed",
        accuracy_score=0.0,
        syntax_ok=None,
        logic_ok=None,
        correctness_ok=False,
        quality=0.0,
        relevance=0.0,
        instruction_following=0.0,
        retry_count=retry_count,
        accuracy_notes="Request failed",
        question_number=question_number,
        question_total=question_total,
    )


def run_streaming_request(
    client: OpenAI,
    model: ModelConfig,
    prompt: PromptCase,
    question_number: int,
    question_total: int,
    run_number: int,
) -> RunResult:
    """Stream one completion with retries. Records real timings only."""
    last_error_type = ""
    last_error_message = ""
    outer_start = time.perf_counter()
    outer_wall = _wall_now()
    retries_used = 0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            measured = _stream_once(client, model, prompt)
            text = measured["text"]
            ttft_s = measured["ttft_s"]
            total_s = measured["total_s"]
            gen_s = measured["gen_s"]
            usage = measured["usage"]
            retries_used = attempt - 1

            if not text.strip() or ttft_s is None:
                return _failed_result(
                    model=model,
                    prompt=prompt,
                    question_number=question_number,
                    question_total=question_total,
                    run_number=run_number,
                    error_type="empty_response",
                    error_message="Empty streamed response"
                    + (
                        f" (finish_reason={measured['finish_reason']})"
                        if measured["finish_reason"]
                        else ""
                    ),
                    request_start_wall=measured["request_start_wall"],
                    first_token_wall=measured["first_token_wall"],
                    completion_wall=measured["completion_wall"],
                    ttft_s=ttft_s,
                    total_s=total_s,
                    gen_s=gen_s,
                    usage=usage,
                    response=text,
                    retry_count=retries_used,
                )

            input_tokens = _usage_int(usage, "prompt_tokens")
            output_tokens = _usage_int(usage, "completion_tokens")
            total_tokens = _usage_int(usage, "total_tokens")
            if output_tokens is None:
                # Approximate only when provider omits usage — still real response
                output_tokens = max(1, len(text.split()))
            if input_tokens is None:
                input_tokens = max(
                    1, len(prompt.text.split()) + len(SYSTEM_PROMPT.split())
                )
            if total_tokens is None:
                total_tokens = (input_tokens or 0) + (output_tokens or 0)

            tokens_per_sec = None
            if gen_s is not None and gen_s > 0 and output_tokens:
                tokens_per_sec = output_tokens / gen_s

            acc = evaluate_response(prompt, text)
            cost = _usage_cost(usage)

            return RunResult(
                timestamp=_iso_now(),
                provider=model.provider,
                model_name=model.display_name,
                model_id=model.model_id,
                question_id=prompt.id,
                category=prompt.category,
                difficulty=prompt.difficulty,
                question=prompt.text,
                run_number=run_number,
                request_start_time=measured["request_start_wall"],
                first_token_time=measured["first_token_wall"],
                completion_time=measured["completion_wall"],
                ttft_ms=round(ttft_s * 1000, 3),
                ttft_seconds=round(ttft_s, 6),
                total_latency_ms=round(total_s * 1000, 3),
                total_latency_seconds=round(total_s, 6),
                generation_time_ms=round(gen_s * 1000, 3) if gen_s is not None else None,
                generation_time_seconds=round(gen_s, 6) if gen_s is not None else None,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                tokens_per_second=round(tokens_per_sec, 2)
                if tokens_per_sec is not None
                else None,
                complete_response=text,
                status="SUCCESS",
                error_type="",
                error_message="",
                expected_answer=prompt.expected_answer,
                accuracy_label=str(acc["accuracy_label"]),
                accuracy_score=acc["accuracy_score"],
                syntax_ok=acc["syntax_ok"],
                logic_ok=acc["logic_ok"],
                correctness_ok=acc["correctness_ok"],
                edge_cases_ok=acc.get("edge_cases_ok"),
                time_complexity_ok=acc.get("time_complexity_ok"),
                quality=acc.get("quality"),
                relevance=acc.get("relevance"),
                instruction_following=acc.get("instruction_following"),
                retry_count=retries_used,
                total_cost=cost,
                accuracy_notes=str(acc["accuracy_notes"]),
                question_number=question_number,
                question_total=question_total,
            )
        except Exception as exc:  # noqa: BLE001
            last_error_type, last_error_message = classify_error(exc)
            retries_used = attempt - 1
            if attempt < MAX_RETRIES and _should_retry(last_error_type):
                time.sleep(RETRY_BACKOFF_SEC * attempt)
                continue
            break

    return _failed_result(
        model=model,
        prompt=prompt,
        question_number=question_number,
        question_total=question_total,
        run_number=run_number,
        error_type=last_error_type or "unknown_error",
        error_message=last_error_message or "Unknown failure",
        request_start_wall=outer_wall,
        completion_wall=_wall_now(),
        total_s=time.perf_counter() - outer_start,
        retry_count=retries_used,
    )
