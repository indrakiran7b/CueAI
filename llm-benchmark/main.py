"""
CueAI OpenRouter LLM speed + response benchmark.

Usage:
  python main.py --quick
  python main.py --runs 5
  python main.py --runs 10
  python main.py --cueai --runs 5
  python main.py --model openai/gpt-4o-mini --runs 5
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Sequence

import pandas as pd

from client import get_client, load_api_key
from config import (
    OPENROUTER_BASE_URL,
    RUNS_PER_PROMPT,
    enabled_models,
    find_model,
)
from metrics import summarize_categories, summarize_models, summarize_questions
from prompts import category_counts, select_prompts, validate_question_bank
from reporting import (
    generate_charts,
    print_final_comparison,
    save_category_summary_csv,
    save_excel_report,
    save_model_summary_csv,
    save_question_summary_csv,
    save_raw_csv,
)
from runner import run_streaming_request


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="CueAI OpenRouter LLM speed and response benchmark"
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=None,
        help=f"Runs per question per model (default: {RUNS_PER_PROMPT})",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Single OpenRouter model ID (or display name) to test",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick smoke test: 1 question x 1 run per model",
    )
    parser.add_argument(
        "--cueai",
        action="store_true",
        help="Run only CueAI real-time short questions",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print the shared question bank and exit (no API calls)",
    )
    return parser.parse_args(argv)


def verify_api_key(api_key: str) -> tuple[bool, str]:
    """Lightweight auth check. Never logs the key."""
    req = urllib.request.Request(
        f"{OPENROUTER_BASE_URL}/auth/key",
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "CueAI-LLM-Benchmark",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        data = payload.get("data") if isinstance(payload, dict) else None
        if data is None:
            return False, "OpenRouter /auth/key returned unexpected payload"
        return True, "ok"
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return False, "OpenRouter rejected OPENROUTER_API_KEY (401/403)"
        return False, f"OpenRouter auth check failed (HTTP {exc.code})"
    except urllib.error.URLError as exc:
        return False, f"Network error during auth check: {exc.reason}"
    except Exception as exc:  # noqa: BLE001
        return False, f"Auth check failed: {type(exc).__name__}"


def _safe_print(text: str) -> None:
    """Print without crashing on Windows charmap consoles."""
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"), flush=True)


def print_live(result, *, runs: int) -> None:
    q_short = result.question.replace("\n", " ")
    if len(q_short) > 90:
        q_short = q_short[:87] + "..."
    status = result.status
    if status != "SUCCESS" and result.error_type:
        status = f"FAILED ({result.error_type})"

    ttft = f"{result.ttft_ms:.0f} ms" if result.ttft_ms is not None else "-"
    total = (
        f"{result.total_latency_ms:.0f} ms"
        if result.total_latency_ms is not None
        else "-"
    )
    tps = (
        f"{result.tokens_per_second:.1f} tokens/sec"
        if result.tokens_per_second is not None
        else "-"
    )
    out_tok = (
        str(result.output_tokens) if result.output_tokens is not None else "-"
    )

    _safe_print(
        "\n"
        + "=" * 40
        + "\n"
        "CueAI LLM BENCHMARK\n"
        + "=" * 40
        + "\n\n"
        f"Model:\n{result.provider} / {result.model_name}\n\n"
        f"Question:\n{result.question_id} / {result.question_total}\n\n"
        f"Run:\n{result.run_number} / {runs}\n\n"
        f"Question:\n\"{q_short}\"\n\n"
        f"Request started:\n{result.request_start_time or '-'}\n\n"
        f"First token:\n{result.first_token_time or '-'}\n\n"
        f"TTFT:\n{ttft}\n\n"
        f"Completed:\n{result.completion_time or '-'}\n\n"
        f"Total latency:\n{total}\n\n"
        f"Output tokens:\n{out_tok}\n\n"
        f"Generation speed:\n{tps}\n\n"
        f"Accuracy:\n{result.accuracy_label or '-'}\n\n"
        f"Status:\n{status}\n\n"
        + "=" * 40
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        api_key = load_api_key()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    ok, auth_msg = verify_api_key(api_key)
    if not ok:
        print(
            f"ERROR: {auth_msg}. "
            "Update llm-benchmark/.env with a valid key from https://openrouter.ai/keys "
            "then re-run. The key is never logged.",
            file=sys.stderr,
        )
        return 2

    models = enabled_models()
    if args.model:
        match = find_model(args.model)
        if match is None:
            print(
                f"ERROR: Unknown model '{args.model}'. "
                "Use an ID from config.py (e.g. openai/gpt-4o-mini).",
                file=sys.stderr,
            )
            return 2
        models = [match]

    if not models:
        print("ERROR: No models enabled in config.py", file=sys.stderr)
        return 2

    try:
        validate_question_bank()
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.list:
        counts = category_counts()
        print(f"Shared question bank: {sum(counts.values())} questions")
        for cat, n in counts.items():
            print(f"  {cat}: {n}")
        prompts = select_prompts(cueai_only=args.cueai, quick=False)
        for p in prompts:
            print(f"{p.id}\t{p.category}\t{p.eval_type}")
        return 0

    prompts = select_prompts(cueai_only=args.cueai, quick=args.quick)
    runs = RUNS_PER_PROMPT if args.runs is None else max(1, args.runs)
    if args.quick:
        runs = 1

    total_req = len(models) * len(prompts) * runs
    mode = "CueAI realtime" if args.cueai else ("quick" if args.quick else "full")
    print(
        f"CueAI LLM Benchmark [{mode}] - {len(models)} model(s), "
        f"{len(prompts)} question(s), {runs} run(s) each "
        f"({total_req} total requests)",
        flush=True,
    )

    client = get_client()
    results = []
    auth_failed = False

    for model in models:
        try:
            stop_model = False
            for q_idx, prompt in enumerate(prompts, start=1):
                if stop_model:
                    break
                for run_number in range(1, runs + 1):
                    result = run_streaming_request(
                        client=client,
                        model=model,
                        prompt=prompt,
                        question_number=q_idx,
                        question_total=len(prompts),
                        run_number=run_number,
                    )
                    # Patch run denominator into live print via question_total already set
                    results.append(result.to_row())
                    try:
                        print_live(result, runs=runs)
                    except Exception as print_exc:  # noqa: BLE001
                        print(
                            f"(progress print failed: {type(print_exc).__name__}) "
                            f"{result.question_id} run {run_number} status={result.status}",
                            flush=True,
                        )

                    if result.error_type == "invalid_api_key":
                        auth_failed = True
                        stop_model = True
                        print(
                            "Stopping remaining models: API key rejected by OpenRouter.",
                            flush=True,
                        )
                        break
                    if result.error_type == "model_unavailable":
                        print(
                            "Model unavailable - skipping remaining runs for this model.",
                            flush=True,
                        )
                        stop_model = True
                        break
            if auth_failed:
                break
        except Exception as exc:  # noqa: BLE001
            print(
                f"\nModel aborted unexpectedly ({type(exc).__name__}): "
                f"{str(exc)[:200]}. Continuing with remaining models.",
                flush=True,
            )
            continue

    if not results:
        print("ERROR: No results collected.", file=sys.stderr)
        return 1

    raw_df = pd.DataFrame(results)
    model_summary = summarize_models(raw_df)
    question_summary = summarize_questions(raw_df)

    raw_path = save_raw_csv(raw_df)
    model_path = save_model_summary_csv(model_summary)
    question_path = save_question_summary_csv(question_summary)
    charts = generate_charts(model_summary, raw_df)
    excel_path = save_excel_report(
        raw=raw_df,
        model_summary=model_summary,
        question_summary=question_summary,
        chart_paths=charts,
    )

    print_final_comparison(model_summary)
    print(f"\nresults/raw_results.csv\n  -> {raw_path}")
    print(f"results/model_summary.csv\n  -> {model_path}")
    print(f"results/question_summary.csv\n  -> {question_path}")
    print(f"results/LLM_Benchmark_Report.xlsx\n  -> {excel_path}")
    return 2 if auth_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
