# CueAI repository audit

**Date:** 2026-10-10  
**Prepared from the working tree.** Secret values are not included.

This workspace is a **GitHub monorepo** at the root plus **15 nested Bitbucket repositories** under `repositories/`. Nested folders are also tracked by the GitHub monorepo. Do not push the workspace root to Bitbucket.

## Architecture summary

Desktop companion → Next.js (`repositories/cueai-web`, port 3000) `/api/live/*` → optional FastAPI (`repositories/cueai-api`, `/v1/live/*`).  
When FastAPI is down and `GROQ_API_KEY` / `GEMINI_API_KEY` exist on the web process, Next answers locally (`CUEAI_LIVE_ANSWER_LOCAL=1` or automatic fallback).  
Groq is primary. Gemini is the retryable-error fallback. Interview prompts live in `cueai-web/src/lib/live-answer.ts` and `cueai-api/app/modules/live/prompts.py`.  
Sibling `file:../cueai-*` packages supply RAG, transcription, resume, translation, screen context, and LLM helpers.

---

## 1. GitHub monorepo (workspace root)

| Item | Value |
|------|--------|
| Local path | `c:\Users\littu\OneDrive\Desktop\full one` |
| GitHub | `https://github.com/indrakiran7b/CueAI.git` (remote `origin`) |
| Bitbucket | **none** — do not invent one |
| Branch | `separation` |
| Purpose | npm workspaces `apps/*`, docs, e2e, and a mirror of `repositories/*` |
| Languages | TypeScript, Python, Electron, Next.js 16, FastAPI (mirrored) |
| Startup | `npm run dev:web` · `npm run dev:desktop` |
| Tests this release | see section 17 |
| Latest commit | `4f363751cebdcd0b75cb246d648cfe18a868b833` |

**Top-level:** `apps/`, `docs/`, `e2e/`, `repositories/`, `scripts/`, `tools/`, `android/`, `package.json`, `docker-compose.yml`, `playwright.config.ts`, `README.md`.

**Not a separate Git repo:** `apps/web`, `apps/desktop` (legacy mirrors tracked only here).

---

## 2. Nested Bitbucket repositories

All use `origin` → `https://bitbucket.org/wayfinderops/<name>.git` on `main`. **No GitHub remote is configured on these repos.**

### cueai-web

| Item | Value |
|------|--------|
| Path | `repositories/cueai-web` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-web.git` |
| GitHub | not configured |
| Branch | `main` |
| Commit | `5bd40979517bc85d1e1a11ca3a88e483116018d8` |
| Purpose | Primary Next.js 16 UI + BFF |
| Stack | Next 16.3, React 19, NextAuth v5, Stripe, Tailwind |
| Persistence | JSON workspace store (`.data/`, gitignored) |
| Auth | HMAC `cueai_admin_session`, NextAuth Google, device headers |
| Billing | Stripe checkout/webhooks |
| AI | `/api/live/answer` Groq→Gemini; `/api/live/health` |
| Env names | `AUTH_SECRET`, `AUTH_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `CUEAI_API_URL`, `CUEAI_LIVE_ANSWER_LOCAL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_*` |
| Dev | `npm run dev` (127.0.0.1:3000) |
| Test | `npx tsc --noEmit` passed; `npm run test:oauth` 10/10 |

**Files:** `src/app/` pages + `/api` routes, `src/lib/`, `src/components/`, `src/auth.ts`, `src/middleware.ts`, `scripts/`, `Dockerfile`, `.env.example`.

### cueai-api

| Item | Value |
|------|--------|
| Path | `repositories/cueai-api` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-api.git` |
| GitHub | not configured |
| Branch | `main` |
| Commit | `d00e978bc7508d803c8a8443ec8d4758bd8b08b8` |
| Purpose | FastAPI `/v1` + Celery vision |
| Stack | FastAPI, uvicorn, Redis, optional Postgres/Alembic, Celery |
| Routes | `/v1/health`, `/v1/live/answer`, `/v1/live/screen`, auth/workspace/jobs/knowledge |
| AI | Groq primary, Gemini fallback, Qwen-VL optional |
| Env names | `GROQ_API_KEY`, `GEMINI_API_KEY`, `GROQ_MODEL`, `GEMINI_MODEL`, `AUTH_SECRET`, `REDIS_URL`, `DATABASE_URL` |
| Dev | `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` |
| Test | `pytest tests/test_live_answer.py tests/test_health.py tests/test_live_auth.py` — **29 passed** |

**Files:** `app/main.py`, `app/modules/{auth,live,jobs,workspace,onboarding,entitlements,license,knowledge}`, `app/core/`, `app/db/`, `app/tasks/`, `alembic/`, `tests/`, `Dockerfile`, `Dockerfile.worker`.

### cueai-desktop

| Item | Value |
|------|--------|
| Path | `repositories/cueai-desktop` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-desktop.git` |
| GitHub | not configured |
| Branch | `main` |
| Commit | `01c360656f9771632cfd739396c45b05e0999c44` |
| Purpose | Windows + macOS Electron companions |
| Stack | Electron, Vite, React |
| Talks to | Next `/api/live/answer`, `/api/live/health`, `/api/transcribe` |
| Keys | none in renderer; device credential in OS safeStorage |
| Dev | `npm run dev:desktop` (workspace `@cueai/desktop`) / `npm run dev:desktop:mac` |

**Files:** `windows/`, `macos/`, `shared/` (speech-capture, device-auth, licensing).

### cueai-ai-orchestrator

| Item | Value |
|------|--------|
| Path | `repositories/cueai-ai-orchestrator` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-ai-orchestrator.git` |
| Commit | `2a9b49526a7e099c235237ec0ca25748db9db29d` |
| Purpose | Groq/Gemini/LLM helpers used by web |
| Files | `src/server/groq.ts`, `src/server/gemini.ts`, `python/app/modules/live/` |

### cueai-infra

| Item | Value |
|------|--------|
| Path | `repositories/cueai-infra` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-infra.git` |
| Commit | `586069add4f4ba13ce597383c648d43c72d5b804` |
| Purpose | Docker Compose, Keycloak realm |
| Files | `docker-compose.yml`, `RUNTIME.md`, `keycloak/`, `.env.example` |

### cueai-docs

| Item | Value |
|------|--------|
| Path | `repositories/cueai-docs` |
| Bitbucket | `https://bitbucket.org/wayfinderops/cueai-docs.git` |
| Commit | `8dc9bad5076bfd4fb89e1c9f966abc2cb20b65c0` |
| Purpose | Architecture and billing docs |

### Unchanged this release (Bitbucket `main`, no GitHub remote)

| Repo | Commit | Purpose | Top-level files |
|------|--------|---------|-----------------|
| cueai-knowledge-service | `d2c3695` | RAG retrieve + Next route handlers | `src/`, `python/`, `fixtures/`, `tests/` |
| cueai-gateway | `ede9528` | FastAPI proxy helper + middleware reference | `src/`, `README.md` |
| cueai-shared-libraries | `7bd612a` | Shared TS utilities | `src/` |
| cueai-transcription-service | `87f5f4c` | Groq Whisper HTTP | `src/` |
| cueai-resume-service | `58064c9` | Resume extract/analyze | `src/` |
| cueai-translation-service | `350828a` | Live translation | `src/` |
| cueai-screen-context-service | `517f626` | Screen/vision routes | `src/`, `python/`, `tools/` |
| cueai-export-service | `fa00023` | Export helpers | `src/` |
| cueai-notification-service | `70ee178` | Notification helpers | `src/` |

---

## 3. Dummy-data audit

| Finding | Verdict |
|---------|---------|
| `src/lib/mock-data.ts` | Marketing pricing/FAQ only. No fake meetings or users. **Kept.** |
| Meetings store initializes `meetings: []` | Honest empty state. **Kept.** |
| `AUTH_BYPASS` / `tester@cueai.local` | Dev-only; refused when `CUEAI_ENV=production`. **Kept.** |
| Bootstrap admin | Env-gated, not a silent fake login. **Kept.** |
| Live-answer tests / FakeClient | Unit fixtures. **Kept.** |
| `scripts/.last-meeting-api-test.json` | Local probe leftover. **Not committed**; added to `.gitignore`. |
| API keys in `.env` / `.env.local` | Gitignored. **Not committed.** |
| Production live-answer path | No hardcoded answers. **Verified.** |

No production dummy dashboards, fake transcripts, or silent mock-success replacements were removed because those production paths already use the workspace store or real providers.

---

## 4. Validated AI / companion behavior

- Groq primary, Gemini fallback on retryable errors only (429/5xx/timeout/network; one auth fallback, no Groq retry loop).
- Keys from `GROQ_API_KEY` / `GEMINI_API_KEY` on the server only.
- Interview system prompt in `INTERVIEW_SYSTEM_PROMPT` (TS + Python).
- Live “What is Python?”: Groq, 1721ms, first word `Python`, no preamble.
- Health: `GET /api/live/health` → 200 `ready` / `local` while FastAPI `:8001` is down.
- Unauthenticated `POST /api/live/answer` → 401 (no longer 503 “API is not running”).
- Desktop probes `/api/live/health` and clears the error when ready.

---

## 5. Tests run

| Command | Result |
|---------|--------|
| `pytest tests/test_live_answer.py tests/test_health.py tests/test_live_auth.py` (cueai-api) | **29 passed** |
| `npx tsc --noEmit` (cueai-web) | **passed** |
| `npm run test:oauth` (cueai-web) | **10 passed** |
| `next build` | **not run** |
| Docker compose build | **not run** |
| Electron packaged build | **not run** |
| macOS on-device Google OAuth | **not run** (Windows host) |
| Full celery/postgres suite | **not run** (celery missing in system Python) |

---

## 6. Sync status

Pushes are recorded after they are verified. Nested Bitbucket repos have **no GitHub remote**. The GitHub monorepo has **no Bitbucket remote**.

| Repo | Provider | Branch | Verified remote commit |
|------|----------|--------|------------------------|
| workspace root | GitHub `origin` | `separation` | `4f363751cebdcd0b75cb246d648cfe18a868b833` |
| cueai-web | Bitbucket | `main` | `5bd40979517bc85d1e1a11ca3a88e483116018d8` |
| cueai-api | Bitbucket | `main` | `d00e978bc7508d803c8a8443ec8d4758bd8b08b8` |
| cueai-desktop | Bitbucket | `main` | `01c360656f9771632cfd739396c45b05e0999c44` |
| cueai-ai-orchestrator | Bitbucket | `main` | `2a9b49526a7e099c235237ec0ca25748db9db29d` |
| cueai-infra | Bitbucket | `main` | `586069add4f4ba13ce597383c648d43c72d5b804` |
| cueai-docs | Bitbucket | `main` | `8dc9bad5076bfd4fb89e1c9f966abc2cb20b65c0` |
| other cueai-* | Bitbucket | `main` | unchanged; no push required |

---

## 7. Security notes

- User-pasted Groq/Gemini keys exist only in gitignored env files. **Rotate them** — they appeared in chat.
- No `gsk_`, Gemini, or `AUTH_SECRET` values in committed source.
- Removing a secret from the latest file does not erase Git history.

## 8. Remaining incomplete items

- FastAPI is optional for local desktop; Docker production still expects `api` healthy.
- Nested Bitbucket repos are not mirrored to GitHub (no remotes).
- Celery/Redis integration tests need a fuller Python env.
- macOS desktop Google Allow→dashboard was not executed on this Windows machine.
