# CueAI OpenRouter Model Benchmark - free-batch-1

Generated 2026-10-25T14:55:46+00:00 - dataset `2026-10-25.1` - catalog snapshot `2026-10-25T14:46:47+00:00`

## Executive summary

- **Best measured model for live interviews: `nvidia/nemotron-3-ultra-550b-a55b:free`** (live score 65.5, quality 100.0, coding 70.0, median TTFT 7,021.4 ms, median full answer 12,228.8 ms). **Provisional** - small sample.
- Catalog: 467 models discovered, 434 eligible for text interview answers. Status counts: blocked 418, failed 2, ineligible 33, tested 2, untested 12.
- Executed 30 model requests and 1 blind judgements; reported spend $0.0. Stop reason: blocked_daily_free_quota.
- All rankings are provisional: each model answered each question once (trials=1). Latency percentiles above P50 are omitted where samples are below 10/20.

## Methodology

- Every model received the identical CueAI production system prompt (`cueai-api/app/modules/live/prompts.py`), the same synthetic candidate briefing, CueAI's question analysis and grounding notes, streamed responses, and the same generation settings.
- Settings: max_tokens as recorded per request [900] (visible answer budget 900, plus a hidden-reasoning allowance for reasoning models where recorded), temperature=0.3, reasoning effort `low` where the model supports configurable reasoning (reasoning text excluded from the answer), no tools, no web search.
- 5 answer(s) stopped at the token limit (`finish_reason=length`); for reasoning models this usually means hidden reasoning consumed the budget. Those answers are graded as delivered.
- Latency is measured from this runner (Python httpx, Windows client) and includes network and OpenRouter routing; it is not intrinsic inference time. The first request to each model is treated as warm-up and excluded from latency statistics (still graded).
- Answers pass through CueAI's production answer guard before grading, as they would in the product.
- Coding answers are executed against reference tests inside a Docker sandbox (no network, read-only root, dropped capabilities, 256 MB, 1 CPU, per-test timeout). SQL runs against a fixed SQLite fixture in the same sandbox.
- Quality uses a blind rubric judge (`nvidia/nemotron-3.5-super-vl:free`, prompt `judge-v1`): answers to one question are anonymized, shuffled with a fixed seed and scored together on 8 dimensions (0-5). Weights: technical_correctness 25%, relevance 15%, clarity 15%, interview_readiness 10%, resume_grounding 15%, completeness 10%, conciseness 5%, uncertainty 5%. The judge is an LLM and is not ground truth; deterministic checks (code tests, fabrication patterns, CueAI guard) are reported alongside it.
- Overall score = weighted mean of available components (quality 0.4, coding 0.2, latency 0.2, reliability 0.15, cost 0.05); latency score = 100 x clamp((10000 - P50 total ms) / (10000 - 800)). Live score = 0.35 quality + 0.15 coding + 0.20 TTFT score + 0.10 latency score + 0.15 reliability + 0.05 cost, and a model is only eligible for the live ranking if quality >= 60, coding >= 50 and it produced no fabricated personal claims.

## Configuration

```json
{
 "run_name": "free-batch-1",
 "max_spend_usd": 0.0,
 "max_spend_per_model_usd": 0.25,
 "max_requests_per_model": 60,
 "allow_paid": false,
 "daily_free_request_cap": 48,
 "max_concurrency": 2,
 "requests_per_minute": 18,
 "request_timeout_s": 90.0,
 "max_retries": 2,
 "trials": 1,
 "max_output_tokens": 900,
 "reasoning_token_allowance": 1600,
 "temperature": 0.3,
 "reasoning_effort": "low",
 "resume": true,
 "retry_failed": false,
 "fetch_generation_stats": true,
 "suite": "core",
 "categories": [],
 "items": [
  "A1",
  "A5",
  "B3",
  "C4",
  "D1",
  "D11",
  "D16",
  "E4"
 ],
 "models": [
  "thinkingmachines/inkling:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "cohere/north-mini-code:free"
 ],
 "select": "free",
 "order": "intelligence",
 "limit": 8,
 "allow_images": true,
 "allow_search": false,
 "provider_compare": false,
 "judge": true,
 "evaluator_model": "",
 "judge_max_tokens": 2500,
 "sandbox": "docker",
 "sandbox_image": "python:3.12-alpine",
 "min_samples_for_ranking": 5,
 "min_samples_for_p90": 10,
 "min_samples_for_p95": 20,
 "answers_per_day": [
  1000,
  5000,
  10000
 ]
}
```

## Model results

| Model | Free | OK/Req | TTFT P50 | Total P50 | Tok/s | Quality | Technical | Coding | Grounding | Multimodal | Fabricated | Live score | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | yes | 7/7 | 7,021.4 | 12,228.8 | 153.6 | 100.0 (1) | - | 70.0 (3) | 100.0 | - (0) | 0 | 65.5 | pass |
| `cohere/north-mini-code:free` | yes | 3/7 | 4,994.3 | 10,292.7 | 239.1 | - (0) | - | 100.0 (1) | 100.0 | - (0) | 0 | - | fail |
| `google/gemma-4-31b-it:free` | yes | 0/8 | - | - | - | - (0) | - | - (0) | - | - (0) | 0 | - | fail |
| `thinkingmachines/inkling:free` | yes | 0/8 | - | - | - | - (0) | - | - (0) | - | - (0) | 0 | - | fail |

Numbers in parentheses are sample counts. Latency in milliseconds.

## Rankings

### Best overall interview answer quality

1. `nvidia/nemotron-3-ultra-550b-a55b:free` - 100.0 (n=1, provisional)

### Best technical correctness

_No model has valid results for this ranking._

### Best Python coding accuracy

1. `cohere/north-mini-code:free` - 100.0 (n=1, provisional)
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - 70.0 (n=3, provisional)

### Best resume-grounded responses

1. `cohere/north-mini-code:free` - 100.0 (n=1, provisional)
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - 100.0 (n=2, provisional)

### Fastest median first-token latency

1. `cohere/north-mini-code:free` - 4,994.3 (n=3, provisional)
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - 7,021.4 (n=6)

### Fastest median full-response latency

1. `cohere/north-mini-code:free` - 10,292.7 (n=3, provisional)
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - 12,228.8 (n=6)

### Highest output throughput (tokens/s)

1. `cohere/north-mini-code:free` - 239.1 (n=3, provisional)
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - 153.6 (n=6)

### Best cost-adjusted quality

1. `nvidia/nemotron-3-ultra-550b-a55b:free` - 74.0 (n=1, provisional)

### Best eligible multimodal model

_No model has valid results for this ranking._

### Best model for CueAI live interviews (quality-gated)

1. `nvidia/nemotron-3-ultra-550b-a55b:free` - 65.5 (n=1, provisional)

## Per-creator and serving-provider comparison

| Creator | Models tested | Best quality | Best TTFT P50 | Serving providers observed |
|---|---|---|---|---|
| cohere | 1 | - | 4,994.3 | Cohere |
| google | 1 | - | - | - |
| nvidia | 1 | 100.0 | 7,021.4 | Nvidia |
| thinkingmachines | 1 | - | - | - |

## Coding accuracy

| Model | Coding score | Functional pass rate | Answers |
|---|---|---|---|
| `cohere/north-mini-code:free` | 100.0 | 100.0% | 1 |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 70.0 | 66.7% | 3 |
| `google/gemma-4-31b-it:free` | - | - | 0 |
| `thinkingmachines/inkling:free` | - | - | 0 |

## Multimodal (separate from text ranking)

_No multimodal results._


## Search and current-facts tests

Not executed: web search was not authorized in this run (`allow_search=false`), and search-enabled routes are paid. These items are recorded as `blocked_search_not_authorized`.

## Cost analysis

| Model | Spend this run | Cost/answer | Cost per 1k answers | Monthly @ 1,000/day / 5,000/day / 10,000/day | Cost source |
|---|---|---|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | $0.0 | 0.0 | 0.0 | $0.00 / $0.00 / $0.00 | usage_reported |
| `cohere/north-mini-code:free` | $0.0 | 0.0 | 0.0 | $0.00 / $0.00 / $0.00 | usage_reported |
| `google/gemma-4-31b-it:free` | $0.0 | - | - | unknown | free_model |
| `thinkingmachines/inkling:free` | $0.0 | - | - | unknown | free_model |

Projections are estimates (cost per successful answer x answers/day x 30). Free-tier models cost $0 but are rate-limited (about 20 requests/minute and a small daily cap without purchased credits), so they cannot carry production traffic as-is.

## Reliability and failures

- `cohere/north-mini-code:free`: empty_response x4
- `google/gemma-4-31b-it:free`: rate_limited x8
- `thinkingmachines/inkling:free`: forbidden x8
- Skipped/blocked requests: skipped_no_image_input x2

## Recommendations

- **Live interviews:** insufficient data for a recommendation (fewer than 5 graded samples). Leading so far: `nvidia/nemotron-3-ultra-550b-a55b:free` (n=1).
- **Coding questions:** insufficient data for a recommendation (fewer than 5 graded samples). Leading so far: `cohere/north-mini-code:free` (n=1).
- **Not suitable for live answers on current evidence:** `cohere/north-mini-code:free` (unreliable, 3/7 succeeded), `google/gemma-4-31b-it:free` (no successful answers: rate_limited), `thinkingmachines/inkling:free` (no successful answers: forbidden)

## Category reference

- A_resume: Self-introduction and resume grounding
- B_core: Core technical
- C_advanced: Advanced backend
- D_coding: Python coding and SQL
- E_multimodal: Screenshot and multimodal
- F_search: Search and current facts

## Judge audit sample

Rationales below are printed for manual review of evaluator behaviour (not ground truth).

- `nvidia/nemotron-3-ultra-550b-a55b:free` / A1-intro: judge 100.0 - "Uses only profile facts in natural first-person spoken language. Covers education, internship, projects, and role fit with no invented metrics, employers, or leadership. Length fits a 45–75 second spoken intro." | keywords 3/3, fabricated=False

## Limitations

- Single trial per question; differences of a few points are within noise. Re-run with `--trials 3` for decision-grade numbers.
- Paid spend was not available for this run (OpenRouter account without purchased credits): paid models (OpenAI, Anthropic, xAI, Google Gemini, DeepSeek paid, Perplexity and others) are marked `blocked` in the inventory, so the winner is the best *free* model measured, not the best model overall.
- Free routes are shared and rate-limited; latency on free endpoints is typically worse and more variable than paid routes of the same model.
- The evaluator is itself a free model drawn from the same pool; where it also appears as a contestant its own scores may be biased.
- Search, provider-route comparison and repeated-trial percentiles were not executed in this batch.
- Dimensions scored by the judge: technical_correctness, relevance, clarity, interview_readiness, resume_grounding, completeness, conciseness, uncertainty.
