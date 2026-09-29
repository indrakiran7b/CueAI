"""Aggregate model and question summaries from real run results."""

from __future__ import annotations

from typing import Any, Optional, Sequence

import pandas as pd

from accuracy import accuracy_numeric


def _percentile(sorted_vals: Sequence[float], p: float) -> Optional[float]:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    rank = (len(sorted_vals) - 1) * (p / 100.0)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = rank - lo
    return float(sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac)


def _mean(vals: Sequence[float]) -> Optional[float]:
    return float(sum(vals) / len(vals)) if vals else None


def _round(v: Optional[float], nd: int = 3) -> Optional[float]:
    return round(v, nd) if v is not None else None


def _cost_sum(ok: pd.DataFrame) -> str:
    if "total_cost" not in ok.columns:
        return "UNKNOWN"
    vals: list[float] = []
    for v in ok["total_cost"].tolist():
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        text = str(v).strip()
        if not text or text.upper() == "UNKNOWN":
            continue
        try:
            vals.append(float(text))
        except ValueError:
            continue
    if not vals:
        return "UNKNOWN"
    return f"{sum(vals):.8f}"


def summarize_models(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    for keys, group in df.groupby(["provider", "model_name", "model_id"], sort=False):
        provider, model_name, model_id = keys
        ok = group[group["status"] == "SUCCESS"]
        failed = group[group["status"] != "SUCCESS"]
        timeouts = group[group["error_type"] == "timeout"]

        ttfts = sorted(float(x) for x in ok["ttft_ms"].dropna().tolist())
        totals = sorted(float(x) for x in ok["total_latency_ms"].dropna().tolist())
        tps = sorted(float(x) for x in ok["tokens_per_second"].dropna().tolist())

        acc_scores: list[float] = []
        for _, r in ok.iterrows():
            v = accuracy_numeric(
                str(r.get("accuracy_label") or ""),
                r.get("accuracy_score") if pd.notna(r.get("accuracy_score")) else None,
            )
            if v is not None:
                acc_scores.append(v)

        n_total = int(len(group))
        n_ok = int(len(ok))
        n_fail = int(len(failed))
        n_timeout = int(len(timeouts))

        rows.append(
            {
                "Provider": provider,
                "Model": model_name,
                "model_id": model_id,
                "Requests": n_total,
                "Successful": n_ok,
                "Failed": n_fail,
                "Success Rate": _round((n_ok / n_total) if n_total else 0.0, 4),
                "Avg TTFT (ms)": _round(_mean(ttfts)),
                "Median TTFT (ms)": _round(_percentile(ttfts, 50)),
                "P90 TTFT (ms)": _round(_percentile(ttfts, 90)),
                "P95 TTFT (ms)": _round(_percentile(ttfts, 95)),
                "Min TTFT (ms)": _round(min(ttfts) if ttfts else None),
                "Max TTFT (ms)": _round(max(ttfts) if ttfts else None),
                "Avg Total Time (ms)": _round(_mean(totals)),
                "Median Total Time (ms)": _round(_percentile(totals, 50)),
                "P90 Total Time (ms)": _round(_percentile(totals, 90)),
                "P95 Total Time (ms)": _round(_percentile(totals, 95)),
                "Min Total Time (ms)": _round(min(totals) if totals else None),
                "Max Total Time (ms)": _round(max(totals) if totals else None),
                "Avg Tokens/sec": _round(_mean(tps), 2),
                "Median Tokens/sec": _round(_percentile(tps, 50), 2),
                "Total Input Tokens": int(ok["input_tokens"].fillna(0).sum())
                if "input_tokens" in ok
                else 0,
                "Total Output Tokens": int(ok["output_tokens"].fillna(0).sum())
                if "output_tokens" in ok
                else 0,
                "Avg Output Tokens": _round(
                    _mean(
                        [float(x) for x in ok["output_tokens"].dropna().tolist()]
                    ),
                    1,
                ),
                "Accuracy": _round(_mean(acc_scores), 4),
                "Avg Quality": _round(
                    _mean(
                        [float(x) for x in ok["quality"].dropna().tolist()]
                        if "quality" in ok
                        else []
                    ),
                    4,
                ),
                "Avg Relevance": _round(
                    _mean(
                        [float(x) for x in ok["relevance"].dropna().tolist()]
                        if "relevance" in ok
                        else []
                    ),
                    4,
                ),
                "Avg Instruction Following": _round(
                    _mean(
                        [
                            float(x)
                            for x in ok["instruction_following"].dropna().tolist()
                        ]
                        if "instruction_following" in ok
                        else []
                    ),
                    4,
                ),
                "Error Rate": _round((n_fail / n_total) if n_total else 0.0, 4),
                "Timeout Rate": _round((n_timeout / n_total) if n_total else 0.0, 4),
                "Errors": n_fail,
                "Timeouts": n_timeout,
                "Total Cost": _cost_sum(ok) if "total_cost" in group.columns else "UNKNOWN",
            }
        )
    return pd.DataFrame(rows)


def summarize_questions(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    group_cols = ["question_id", "category", "question", "provider", "model_name", "model_id"]
    for keys, group in df.groupby(group_cols, sort=False):
        qid, category, question, provider, model_name, model_id = keys
        ok = group[group["status"] == "SUCCESS"]
        ttfts = [float(x) for x in ok["ttft_ms"].dropna().tolist()]
        totals = [float(x) for x in ok["total_latency_ms"].dropna().tolist()]
        tps = [float(x) for x in ok["tokens_per_second"].dropna().tolist()]
        acc_scores: list[float] = []
        for _, r in ok.iterrows():
            v = accuracy_numeric(
                str(r.get("accuracy_label") or ""),
                r.get("accuracy_score") if pd.notna(r.get("accuracy_score")) else None,
            )
            if v is not None:
                acc_scores.append(v)
        n_total = int(len(group))
        n_ok = int(len(ok))
        rows.append(
            {
                "question_id": qid,
                "category": category,
                "difficulty": (
                    str(group["difficulty"].iloc[0]) if "difficulty" in group else ""
                ),
                "question": question,
                "provider": provider,
                "model": model_name,
                "model_name": model_name,
                "model_id": model_id,
                "runs": n_total,
                "success_rate": _round((n_ok / n_total) if n_total else 0.0, 4),
                "avg_ttft_ms": _round(_mean(ttfts)),
                "avg_total_latency_ms": _round(_mean(totals)),
                "avg_tokens_per_sec": _round(_mean(tps), 2),
                "accuracy": _round(_mean(acc_scores), 4),
                "status": "SUCCESS" if n_ok == n_total else ("MIXED" if n_ok else "FAILED"),
            }
        )
    return pd.DataFrame(rows)


def summarize_categories(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    for keys, group in df.groupby(["category", "provider", "model_name", "model_id"], sort=False):
        category, provider, model_name, model_id = keys
        ok = group[group["status"] == "SUCCESS"]
        ttfts = sorted(float(x) for x in ok["ttft_ms"].dropna().tolist())
        totals = sorted(float(x) for x in ok["total_latency_ms"].dropna().tolist())
        tps = [float(x) for x in ok["tokens_per_second"].dropna().tolist()]
        acc_scores: list[float] = []
        for _, r in ok.iterrows():
            v = accuracy_numeric(
                str(r.get("accuracy_label") or ""),
                r.get("accuracy_score") if pd.notna(r.get("accuracy_score")) else None,
            )
            if v is not None:
                acc_scores.append(v)
        n_total = int(len(group))
        n_ok = int(len(ok))
        rows.append(
            {
                "category": category,
                "provider": provider,
                "model": model_name,
                "model_id": model_id,
                "questions": int(group["question_id"].nunique()) if "question_id" in group else n_total,
                "requests": n_total,
                "success_rate": _round((n_ok / n_total) if n_total else 0.0, 4),
                "average_ttft_ms": _round(_mean(ttfts)),
                "median_ttft_ms": _round(_percentile(ttfts, 50)),
                "p90_ttft_ms": _round(_percentile(ttfts, 90)),
                "average_total_latency_ms": _round(_mean(totals)),
                "p90_total_latency_ms": _round(_percentile(totals, 90)),
                "average_tokens_per_sec": _round(_mean(tps), 2),
                "accuracy": _round(_mean(acc_scores), 4),
                "quality": _round(
                    _mean(
                        [float(x) for x in ok["quality"].dropna().tolist()]
                        if "quality" in ok
                        else []
                    ),
                    4,
                ),
            }
        )
    return pd.DataFrame(rows)


# Back-compat name used by older main
def summarize_results(df: pd.DataFrame) -> pd.DataFrame:
    return summarize_models(df)
