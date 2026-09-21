"""
Benchmark configuration — edit model IDs here before running.

Do not put API keys in this file. Use .env → OPENROUTER_API_KEY.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
RESULTS_DIR = ROOT / "results"
RAW_CSV = RESULTS_DIR / "raw_results.csv"
MODEL_SUMMARY_CSV = RESULTS_DIR / "model_summary.csv"
QUESTION_SUMMARY_CSV = RESULTS_DIR / "question_summary.csv"
CATEGORY_SUMMARY_CSV = RESULTS_DIR / "category_summary.csv"
EXCEL_PATH = RESULTS_DIR / "LLM_Benchmark_Report.xlsx"

# Charts
CHART_AVG_TTFT = RESULTS_DIR / "chart_avg_ttft.png"
CHART_P90_TTFT = RESULTS_DIR / "chart_p90_ttft.png"
CHART_AVG_LATENCY = RESULTS_DIR / "chart_avg_latency.png"
CHART_TPS = RESULTS_DIR / "chart_tokens_per_sec.png"
CHART_SUCCESS = RESULTS_DIR / "chart_success_rate.png"
CHART_ACCURACY = RESULTS_DIR / "chart_accuracy.png"
CHART_CUEAI_TTFT = RESULTS_DIR / "chart_cueai_ttft.png"
CHART_CUEAI_LATENCY = RESULTS_DIR / "chart_cueai_latency.png"
CHART_CATEGORY_LATENCY = RESULTS_DIR / "chart_category_latency.png"
CHART_CATEGORY_ACCURACY = RESULTS_DIR / "chart_category_accuracy.png"
CHART_QUESTION_LATENCY = RESULTS_DIR / "chart_question_latency.png"

# Back-compat aliases used by older helpers
SUMMARY_CSV = MODEL_SUMMARY_CSV
CHART_TTFT = CHART_AVG_TTFT
CHART_LATENCY = CHART_AVG_LATENCY

# ---------------------------------------------------------------------------
# OpenRouter / OpenAI SDK
# ---------------------------------------------------------------------------

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_HTTP_REFERER = "https://github.com/indrakiran7b/CueAI"
OPENROUTER_APP_TITLE = "CueAI LLM Benchmark"

# ---------------------------------------------------------------------------
# Run settings (override via CLI: --runs / --quick / --cueai)
# ---------------------------------------------------------------------------

# Same settings for every model and every question.
RUNS_PER_PROMPT = 5
MAX_TOKENS = 512
TEMPERATURE = 0.2
REQUEST_TIMEOUT_SEC = 90.0
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 1.5

SYSTEM_PROMPT = (
    "You are CueAI, an AI interview and meeting copilot. "
    "Reply briefly and clearly. Prefer short bullets when listing items. "
    "Do not invent credentials or secrets."
)


@dataclass(frozen=True)
class ModelConfig:
    provider: str
    display_name: str
    model_id: str
    enabled: bool = True


# Keep current configured models (do not invent IDs).
MODELS: list[ModelConfig] = [
    ModelConfig(
        provider="OpenAI",
        display_name="GPT-4o mini",
        model_id="openai/gpt-4o-mini",
    ),
    ModelConfig(
        provider="Google Gemini",
        display_name="Gemini 2.5 Flash Lite",
        model_id="google/gemini-2.5-flash-lite",
    ),
    ModelConfig(
        provider="xAI Grok",
        display_name="Grok 4.20",
        model_id="x-ai/grok-4.20",
    ),
    ModelConfig(
        provider="DeepSeek",
        display_name="DeepSeek Chat",
        model_id="deepseek/deepseek-chat",
    ),
    ModelConfig(
        provider="Anthropic Claude",
        display_name="Claude Haiku 4.5",
        model_id="anthropic/claude-haiku-4.5",
    ),
    ModelConfig(
        provider="Perplexity",
        display_name="Sonar",
        model_id="perplexity/sonar",
    ),
]


def enabled_models() -> list[ModelConfig]:
    return [m for m in MODELS if m.enabled]


def find_model(model_id: str) -> ModelConfig | None:
    needle = model_id.strip().lower()
    for m in MODELS:
        if m.model_id.lower() == needle or m.display_name.lower() == needle:
            return m
    return None


CATEGORY_ALIASES = {
    "technical": "TECHNICAL",
    "aptitude": "APTITUDE",
    "logical": "LOGICAL_REASONING",
    "logical_reasoning": "LOGICAL_REASONING",
    "reasoning": "LOGICAL_REASONING",
    "coding": "CODING",
    "debugging": "DEBUGGING",
    "sql": "SQL_DATABASE",
    "database": "SQL_DATABASE",
    "sql_database": "SQL_DATABASE",
    "computer_science": "COMPUTER_SCIENCE",
    "cs": "COMPUTER_SCIENCE",
    "scenario": "SCENARIO",
    "scenario-based": "SCENARIO",
    "realtime": "REALTIME_INTERVIEW",
    "real-time": "REALTIME_INTERVIEW",
    "realtime_interview": "REALTIME_INTERVIEW",
    "hr": "BEHAVIORAL_HR",
    "behavioral": "BEHAVIORAL_HR",
    "behavioral_hr": "BEHAVIORAL_HR",
    "short": "SHORT_ANSWER",
    "short_answer": "SHORT_ANSWER",
    "followup": "FOLLOW_UP",
    "follow-up": "FOLLOW_UP",
    "follow_up": "FOLLOW_UP",
}


def resolve_category(name: str) -> str | None:
    raw = name.strip().upper().replace(" ", "_").replace("-", "_")
    known = {
        "TECHNICAL",
        "APTITUDE",
        "LOGICAL_REASONING",
        "CODING",
        "DEBUGGING",
        "SQL_DATABASE",
        "COMPUTER_SCIENCE",
        "SCENARIO",
        "REALTIME_INTERVIEW",
        "BEHAVIORAL_HR",
        "SHORT_ANSWER",
        "FOLLOW_UP",
    }
    alias = CATEGORY_ALIASES.get(name.strip().lower())
    if alias:
        return alias
    if raw in known:
        return raw
    return None
