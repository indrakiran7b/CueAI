# CueAI OpenRouter LLM Benchmark

Real-world **speed + response** benchmark for CueAI. Every configured model receives the **exact same questions in the exact same order**.

**Never commit `.env` or paste your API key into source, logs, CSV, or Excel.**

## Question bank

75 questions across 12 categories (at least 5 each):

1. TECHNICAL
2. APTITUDE (verified expected answers)
3. LOGICAL_REASONING
4. CODING
5. DEBUGGING
6. SQL_DATABASE
7. COMPUTER_SCIENCE
8. SCENARIO
9. REALTIME_INTERVIEW (CueAI short / live)
10. BEHAVIORAL_HR
11. SHORT_ANSWER
12. FOLLOW_UP

## Prerequisites

- Windows 10/11
- Python 3.10+
- OpenRouter API key in `.env` (gitignored)

## Setup (Windows)

```powershell
cd llm-benchmark
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Commands

```powershell
python main.py --quick
python main.py --runs 1
python main.py --runs 5
python main.py --cueai --runs 5
python main.py --model openai/gpt-4o-mini --runs 5
```

## Outputs

Under `results/`:

- `raw_results.csv` — one row per model/question/run
- `model_summary.csv` — per-model aggregates
- `question_summary.csv` — per-question × model aggregates
- `LLM_Benchmark_Report.xlsx` — full report + charts

## Notes

- Models only in `config.py` (do not invent IDs)
- Accuracy is separate from latency (SUCCESS ≠ correct)
- Streaming TTFT uses `time.perf_counter()`
