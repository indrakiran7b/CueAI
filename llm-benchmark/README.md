# CueAI OpenRouter LLM Benchmark

Real-world **speed + response** benchmark for CueAI. Every configured model receives the **exact same questions in the exact same order**, with the same system prompt, temperature, and max tokens.

This tool is **independent of the CueAI desktop app**. It only makes OpenRouter HTTP requests. It does not use the microphone, camera, screen recording, system audio, overlay, or Electron.

**Never commit `.env` or paste your API key into source, logs, CSV, Excel, or the terminal.**

## Question bank

165 shared questions across 12 categories (at least 5 each), with EASY / MEDIUM / HARD mix. Aptitude and logical items have verified expected answers. Follow-up turns use a **fixed** prior conversation so every model gets the same context.

## macOS setup

1. Open Terminal.

2. Go to the project:

```bash
cd llm-benchmark
```

3. Create a virtual environment:

```bash
python3 -m venv .venv
```

4. Activate:

```bash
source .venv/bin/activate
```

5. Install:

```bash
pip install -r requirements.txt
```

6. Configure `.env` (gitignored):

```bash
OPENROUTER_API_KEY=YOUR_KEY
```

Copy from `.env.example` if needed.

7. Quick benchmark (2 questions from each category, 1 run, all models):

```bash
python3 main.py --quick
```

8. Full benchmark:

```bash
python3 main.py --runs 5
```

9. CueAI real-time subset:

```bash
python3 main.py --category realtime --runs 5
```

10. One model:

```bash
python3 main.py --model openai/gpt-4o-mini --runs 5
```

List the bank without API calls:

```bash
python3 main.py --list
```

## Outputs

Under `results/`:

- `raw_results.csv` — one row per model/question/run
- `model_summary.csv` — per-model aggregates
- `question_summary.csv` — per-question × model aggregates
- `category_summary.csv` — per-category × model aggregates
- `LLM_Benchmark_Report.xlsx` — full report + charts

## Notes

- Models only in `config.py` (do not invent IDs)
- Accuracy is separate from latency (SUCCESS ≠ correct)
- Follow-up turns use a **fixed** prior conversation so every model gets the same context
- Streaming TTFT uses `time.perf_counter()`
- Paths use `pathlib.Path` (cross-platform)
