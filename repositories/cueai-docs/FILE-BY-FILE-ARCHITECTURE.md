# CueAI file-by-file architecture

**Generated from the working tree on 2026-10-09.** This document describes files that exist in the repository. It does **not** claim every feature is production-ready or end-to-end tested.

**Runtime source of truth for local web:** `repositories/cueai-web` via `npm run dev:web`.  
**Legacy mirrors (still present):** `apps/web`, `apps/desktop`.  
**Bitbucket boundaries:** nested `repositories/cueai-*` folders, each with its own Git remote under `bitbucket.org/wayfinderops/`.  
**GitHub monorepo:** repository root remote `origin` → `https://github.com/indrakiran7b/CueAI.git`, branch `separation`.

Status tags used below:

- **production code** — shipped application source
- **test code** — automated tests
- **configuration** — env templates, compose, builder config
- **documentation**
- **generated/local** — must not be treated as source (`.next`, `node_modules`, `.data`)

---

## 1. Repository overview

CueAI is a meeting-assistance product: web app, FastAPI backend, Windows/macOS Electron companions, Knowledge Base/RAG, live transcription and answers, Stripe billing, and HMAC session auth with optional Google OAuth via NextAuth.

| Tree | Role | Git remote (when nested `.git` exists) |
|------|------|----------------------------------------|
| Repository root | GitHub monorepo + npm workspaces `apps/*` | `https://github.com/indrakiran7b/CueAI.git` |
| `repositories/cueai-web` | Next.js 16 UI + BFF | `bitbucket.org/wayfinderops/cueai-web.git` |
| `repositories/cueai-api` | FastAPI `/v1` + Celery | `cueai-api.git` |
| `repositories/cueai-desktop` | Windows + macOS Electron | `cueai-desktop.git` |
| `repositories/cueai-infra` | Docker Compose, Keycloak realm | `cueai-infra.git` |
| `repositories/cueai-docs` | Markdown docs | `cueai-docs.git` |
| `repositories/cueai-knowledge-service` | RAG library + Next route handlers | `cueai-knowledge-service.git` |
| `repositories/cueai-ai-orchestrator` | Gemini/Groq LLM helpers | `cueai-ai-orchestrator.git` |
| `repositories/cueai-gateway` | FastAPI proxy helper | `cueai-gateway.git` |
| `repositories/cueai-shared-libraries` | Shared TS utilities | `cueai-shared-libraries.git` |
| `repositories/cueai-*-service` | Domain libraries re-exported by web | matching Bitbucket repos |
| `apps/web`, `apps/desktop` | Pre-cutover mirrors | tracked only in the GitHub monorepo |

Root `package.json` workspaces still list only `apps/*`. Active `dev:web` delegates to `repositories/cueai-web`. `cueai-web` depends on sibling packages via `file:../cueai-*`.

There is **no Bitbucket remote on the GitHub monorepo root**. Bitbucket remotes live on the nested `repositories/cueai-*` Git repositories.

---

## 2. Complete directory tree of relevant application code

Omitted: `node_modules`, `.next`, `dist`, `dist-electron`, `coverage`, `.git`, venvs, `.data`, installers.

```
full one/
├── package.json, .env.example, docker-compose.yml, playwright.config.ts, e2e/
├── docs/                          (this architecture + update report)
├── apps/
│   ├── web/                       legacy Next.js mirror
│   └── desktop/                   legacy Electron (Windows-oriented)
├── repositories/
│   ├── cueai-web/                 primary Next.js app
│   │   ├── src/app/               pages + /api route handlers
│   │   ├── src/auth.ts            NextAuth factory
│   │   ├── src/middleware.ts
│   │   ├── src/components/
│   │   ├── src/lib/               client + server libraries
│   │   ├── scripts/               billing/oauth test scripts
│   │   ├── Dockerfile, next.config.ts, .env.example
│   ├── cueai-api/                 FastAPI
│   │   ├── app/main.py
│   │   ├── app/modules/{auth,live,jobs,workspace,onboarding,entitlements,license,knowledge}
│   │   ├── app/core/, app/db/, app/tasks/, alembic/, tests/
│   ├── cueai-desktop/
│   │   ├── windows/electron/      Windows main/preload/services
│   │   ├── macos/electron/        macOS counterpart
│   │   └── shared/                licensing, speech-capture, device-auth
│   ├── cueai-infra/               docker-compose.yml, keycloak/
│   ├── cueai-docs/
│   ├── cueai-knowledge-service/src/{rag,routes}
│   ├── cueai-ai-orchestrator/src/server
│   ├── cueai-gateway/src
│   ├── cueai-shared-libraries/src
│   ├── cueai-notification-service/
│   ├── cueai-transcription-service/
│   ├── cueai-translation-service/
│   ├── cueai-resume-service/
│   ├── cueai-export-service/
│   └── cueai-screen-context-service/
```

---

## 3. Frontend architecture

**Kind:** production code (Next.js App Router, React 19).

Entry: `repositories/cueai-web`. `next.config.ts` transpiles `@cueai/*` packages and sets `allowedDevOrigins` for `localhost`, `127.0.0.1`, and ngrok hosts.

### Pages (`src/app/**/page.tsx`)

| Path | Purpose |
|------|---------|
| `src/app/page.tsx` | Marketing / landing |
| `src/app/login/page.tsx` | Email/password + Google/Apple buttons; OAuth error copy |
| `src/app/signup/page.tsx` | Registration; OAuth callback URL uses `/auth/complete` |
| `src/app/auth/complete/page.tsx` | Post-Google bridge: NextAuth session → HMAC cookie → dashboard |
| `src/app/onboarding/page.tsx` | Post-signup questionnaire |
| `src/app/forgot-password/page.tsx` | Password reset UI (needs investigation of live email delivery) |
| `src/app/invite/[token]/page.tsx` | Invite accept |
| `src/app/license/page.tsx` | License activation UI |
| `src/app/(app)/dashboard/page.tsx` | Main dashboard |
| `src/app/(app)/meetings/page.tsx` | Meeting list |
| `src/app/(app)/meetings/live/page.tsx` | Live Session |
| `src/app/(app)/meetings/[id]/feed/page.tsx` | Meeting feed |
| `src/app/(app)/meetings/[id]/summary/page.tsx` | Meeting summary (entitlement-gated Q&A) |
| `src/app/(app)/meetings/summary/page.tsx` | Summary index |
| `src/app/(app)/knowledge/page.tsx` | Knowledge Base UI |
| `src/app/(app)/knowledge/documents/[id]/page.tsx` | Document detail |
| `src/app/(app)/settings/page.tsx` | Settings including billing panel hash |
| `src/app/(app)/pricing/page.tsx` | Plan picker |
| `src/app/(app)/billing/page.tsx` | Billing route (settings is primary) |
| `src/app/(app)/billing/success/page.tsx` | Checkout return (does **not** grant paid access) |
| `src/app/(app)/billing/cancelled/page.tsx` | Checkout cancel |
| `src/app/(app)/admin/page.tsx` | Admin portal |
| `src/app/(app)/companion/page.tsx` | Web companion overlay |
| `src/app/(app)/translation/page.tsx` | Translation UI |
| `src/app/(app)/screen-context/page.tsx` | Screen context UI |
| `src/app/(app)/resume/page.tsx` | Resume tailor (CueAI shell) |
| `src/app/resume-tailor/**` | Separate Resume Tailor product shell |

### Layout / providers

| Path | Purpose |
|------|---------|
| `src/components/providers/auth-provider.tsx` | Client CueAI session; after NextAuth, POSTs `/api/auth/oauth-sync` then `enterApp` |
| `src/components/providers/session-provider.tsx` | `next-auth/react` SessionProvider |
| `src/components/providers/theme-provider.tsx` | Theme |
| `src/components/layout/product-shell.tsx` | App chrome |
| `src/components/layout/sidebar.tsx` | Navigation |
| `src/components/layout/topbar.tsx` | Top bar |
| `src/components/layout/upgrade-button.tsx` | Upgrade / manage plan → settings billing |

### Auth UI

| Path | Purpose |
|------|---------|
| `src/components/auth/social-auth-buttons.tsx` | Google/Apple; GET `/api/auth/providers`; `signIn()` from `next-auth/react` |
| `src/components/auth/require-auth.tsx` | Gate authenticated routes |
| `src/components/auth/require-admin.tsx` | Admin gate |
| `src/components/auth/require-resume-access.tsx` | Resume Tailor access |
| `src/components/auth/cueai-route-gate.tsx` | Product route gate |
| `src/components/admin/admin-login-form.tsx` | Admin login; OAuth callback `/auth/complete` |

### Billing UI

| Path | Purpose |
|------|---------|
| `src/components/settings/billing-panel.tsx` | Primary billing UI |
| `src/components/billing/billing-panel.tsx` | Shared plan cards / checkout |

---

## 4. Backend architecture

Two backends exist.

### Next.js BFF (`repositories/cueai-web`) — default local path

JSON workspace store under `.data/` (gitignored). Route handlers in `src/app/api/**/route.ts`. Optional proxy to FastAPI when `CUEAI_USE_FASTAPI=1`.

### FastAPI (`repositories/cueai-api`)

| Path | Purpose | Kind |
|------|---------|------|
| `app/main.py` | FastAPI app factory; mounts `/v1/*` | production |
| `app/core/config.py` | Settings from env | production |
| `app/core/security.py` | Password hashing / JWT-like session helpers | production |
| `app/core/session.py` | Session cookie helpers | production |
| `app/core/celery.py` | Celery app | production |
| `app/core/redis.py` | Redis client | production |
| `app/core/jobs.py` | Job records | production |
| `app/core/roles.py` | Roles | production |
| `app/core/auth_mode.py` | Auth bypass flags | production |
| `app/db/base.py`, `app/db/session.py` | SQLAlchemy | production |
| `app/persistence/store.py` | File/JSON store fallback | production |
| `app/api/deps.py` | Request dependencies | production |
| `app/modules/auth/router.py` | `/v1/auth/*` | production |
| `app/modules/auth/service.py` | Login/signup | production |
| `app/modules/live/router.py` | `/v1/live/answer`, `/v1/live/screen` | production |
| `app/modules/live/answer_service.py` | Live answer generation | production |
| `app/modules/live/gemini.py`, `providers.py`, `prompts.py`, `context.py` | LLM + RAG context | production |
| `app/modules/live/screen_*.py` | Screen analysis | production |
| `app/modules/jobs/router.py` | Job polling | production |
| `app/modules/workspace/router.py` | Workspaces | production |
| `app/modules/onboarding/router.py` | Onboarding | production |
| `app/modules/entitlements/router.py` | `/v1/entitlements/me` | production |
| `app/modules/license/router.py` | License activate/verify | production |
| `app/modules/knowledge/*.py` | RAG helpers; **not mounted as its own router in `main.py`** | production |
| `app/tasks/vision.py`, `health.py` | Celery tasks | production |
| `app/services/keygate_service.py` | Keygate server calls | production |

Local `npm run dev:web` does **not** set `CUEAI_USE_FASTAPI=1` by default. Email/password and meetings then run in the Next.js process.

---

## 5. Authentication and Google OAuth

**Implemented:** NextAuth v5 Google provider + CueAI HMAC cookie `cueai_admin_session`.  
**Not used for this app:** Appwrite OAuth callback URLs.  
**Email/password:** remains on `POST /api/auth/login` and `POST /api/auth/signup`.  
**Complete Google browser login:** configured and 302 to Google verified; **account-picker completion was not verified in this documentation pass.**

### Important files

| Path | What it does | Callers / deps | Env |
|------|----------------|----------------|-----|
| `repositories/cueai-web/src/auth.ts` | Lazy NextAuth config; Google if `AUTH_GOOGLE_ID`+`AUTH_GOOGLE_SECRET` pass `isRealSecret`; `trustHost`; `basePath: /api/auth`; verified-email gate | `[...nextauth]`, `oauth-sync`, `getOAuthProviders` | `AUTH_GOOGLE_*`, `AUTH_GITHUB_*`, `AUTH_APPLE_*`, `AUTH_SECRET` |
| `repositories/cueai-web/src/app/api/auth/[...nextauth]/route.ts` | GET/POST NextAuth; wraps Host so localhost vs `127.0.0.1` drive `redirect_uri` | Browser `signIn('google')` | `AUTH_URL` overridden per request |
| `repositories/cueai-web/src/lib/server/oauth-request-origin.ts` | Builds origin from Host / `x-forwarded-host`, preserves port 3000 | nextauth route | none |
| `repositories/cueai-web/src/app/api/auth/providers/route.ts` | `{ google, github, apple }` booleans (not Auth.js objects) | `social-auth-buttons.tsx` | `AUTH_GOOGLE_*` |
| `repositories/cueai-web/src/app/api/auth/oauth-sync/route.ts` | Maps verified NextAuth email onto workspace user; signs HMAC cookie; new Google users get role `User` | `auth-provider.tsx`, `/auth/complete` | `AUTH_SECRET` |
| `repositories/cueai-web/src/lib/server/oauth-link.ts` | Link policy: no auto-link of password accounts | oauth-sync | none |
| `repositories/cueai-web/src/lib/oauth-complete.ts` | Safe `/auth/complete?next=` helper | login/signup/admin | none |
| `repositories/cueai-web/src/lib/server/session.ts` | HMAC sign/verify `cueai_admin_session` | login, oauth-sync, middleware | `AUTH_SECRET` |
| `repositories/cueai-web/src/lib/runtime-env.ts` | Resolves `AUTH_SECRET`; production guards | session, auth | `AUTH_SECRET`, `CUEAI_ENV` |
| `repositories/cueai-web/src/middleware.ts` | Public routes include `/auth/complete` | Next edge | session cookie |
| `repositories/cueai-web/src/app/api/auth/login/route.ts` | Email/password login | login page | `AUTH_SECRET` |
| `repositories/cueai-web/src/app/api/auth/signup/route.ts` | Signup | signup page | `AUTH_SECRET` |
| `repositories/cueai-web/src/app/api/auth/logout/route.ts` | Clears session | UI | — |
| `repositories/cueai-web/src/app/api/auth/me/route.ts` | Current user | auth-provider | cookie |
| `apps/web/src/auth.ts` | Legacy NextAuth mirror; **not** the running `dev:web` process | unused for local web | same names if that tree is started |

**Expected Google redirect URI (browser via localhost):**  
`http://localhost:3000/api/auth/callback/google`

Also register `http://127.0.0.1:3000/api/auth/callback/google` (desktop/dev hostname bind).

**Required env (never commit values):** `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`.

**Docker:** `repositories/cueai-infra/docker-compose.yml` forwards `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` into `api` and `web`. Local `npm run dev:web` reads `repositories/cueai-web/.env.local` (gitignored).

**Appwrite vs NextAuth:** no Appwrite package in this tree. Registering an Appwrite callback in Google Cloud is incorrect for CueAI.

---

## 6. Stripe billing and subscription lifecycle

**Implemented in Next.js** (`cueai-web`), not FastAPI.  
**Plans in code:** Free $0; Pro monthly default display $5 (`500` cents); Team monthly default display $10 (`1000` cents). Amounts can be overridden by Stripe Price `unit_amount` or `STRIPE_DISPLAY_*_CENTS`.  
**Paid access:** granted only after a **verified Stripe webhook**, not after `/billing/success`.

| Path | Purpose | Env |
|------|---------|-----|
| `src/lib/server/stripe.ts` | Stripe SDK singleton; webhook secret | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `src/lib/server/billing-plans.ts` | Plan catalog; Price IDs from env only | `STRIPE_PRICE_*`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID` |
| `src/lib/server/billing.ts` | Checkout, portal, webhook apply, entitlements, Keygate mint skip if unconfigured | `APP_BASE_URL` / `AUTH_URL`, Stripe keys, Keygate optional |
| `src/lib/server/billing-db.ts` | JSON billing store (subscriptions, customers, processed event ids) | `CUEAI_DATA_DIR` |
| `src/lib/entitlements.ts` | Free: 5 Q&A; premium: unlimited | none |
| `src/app/api/billing/checkout/route.ts` | POST Checkout; ignores client Price IDs and redirect URLs | Stripe + session |
| `src/app/api/billing/webhook/route.ts` | POST Stripe signature verification | `STRIPE_WEBHOOK_SECRET` |
| `src/app/api/stripe/webhook/route.ts` | Alias of billing webhook | same |
| `src/app/api/billing/portal/route.ts` | Stripe Customer Portal | Stripe |
| `src/app/api/billing/catalog/route.ts` | Public plan list | Stripe optional |
| `src/app/api/billing/subscription/route.ts` | Current subscription | session |
| `src/app/api/billing/status/route.ts` | Status GET/POST | session |
| `src/app/api/admin/billing/route.ts` | Admin usage/billing read | admin session |

Lifecycle: `POST /api/billing/checkout` → Stripe Checkout → `checkout.session.completed` (paid) webhook → `billing-db` + user `plan` / entitlements. Unpaid completed sessions do not grant premium (covered by unit tests).

`APP_BASE_URL` (fallback `AUTH_URL`) is the trusted origin for success/cancel URLs.

---

## 7. Knowledge Base and RAG

Canonical library: `repositories/cueai-knowledge-service`. CueAI-web also has `src/lib/server/rag/*` (re-export / local path). Admin and meeting knowledge HTTP routes in web **re-export** knowledge-service handlers.

| Path | Purpose |
|------|---------|
| `cueai-knowledge-service/src/rag/rag-service.ts` | Index + query orchestration |
| `src/rag/embeddings.ts` | OpenAI / Gemini / local MiniLM |
| `src/rag/chunker.ts` | Chunking |
| `src/rag/vector-store.ts` | Qdrant |
| `src/rag/document-processor.ts` | Extract + chunk + embed |
| `src/rag/config.ts` | `RAG_*`, `QDRANT_*`, embedding keys |
| `src/knowledge-retrieve.ts` | Retrieval for live answers |
| `src/routes/admin/**` | Knowledge CRUD / reindex / query |
| `src/routes/meetings/knowledge.ts` | Per-meeting knowledge |
| `cueai-api/app/modules/knowledge/*` | Python RAG helpers for live answers |
| `cueai-docs/knowledge/RAG.md` | Documentation |

Env: `RAG_ENABLED`, `RAG_EMBEDDING_PROVIDER`, `QDRANT_URL`, `OPENAI_API_KEY` / `GEMINI_API_KEY` depending on provider.

**Status:** implementation exists with pytest coverage in api/knowledge-service. This documentation pass did not re-run the full RAG suite against a live Qdrant.

---

## 8. Live Session, audio capture, transcription, and AI answers

| Path | Purpose |
|------|---------|
| `cueai-web/src/app/(app)/meetings/live/page.tsx` | Live Session UI |
| `cueai-web/src/app/api/live/answer/route.ts` | POST live answer (local LLM or FastAPI proxy) |
| `cueai-web/src/app/api/live/briefing/route.ts` | Meeting briefing GET/PUT |
| `cueai-web/src/app/api/live/meeting-event/route.ts` | Meeting events |
| `cueai-web/src/app/api/live/screen/route.ts` | Screen context (re-export) |
| `cueai-web/src/lib/live-answer.ts` | Client live-answer helper |
| `cueai-web/src/app/api/transcribe/route.ts` | Transcription (re-export transcription-service) |
| `cueai-api/app/modules/live/*` | FastAPI live answer + screen |
| `cueai-desktop/shared/speech-capture.ts` | Desktop spoken-question capture |
| `cueai-desktop/windows/electron/services/audio-listen.ts` | Windows audio listen |
| `cueai-transcription-service/src/transcribe.ts` | Groq Whisper (typical) |
| `cueai-ai-orchestrator/src/server/gemini.ts` | Gemini generation |
| `cueai-ai-orchestrator/src/server/groq.ts` | Groq fallback |

Env: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CUEAI_LIVE_ANSWER_LOCAL`, `CUEAI_API_URL`.

---

## 9. Windows desktop application

Canonical: `repositories/cueai-desktop/windows`. Legacy: `apps/desktop`.

| Path | Purpose |
|------|---------|
| `windows/electron/main/index.ts` | Electron main |
| `windows/electron/preload/index.ts`, `main-preload.ts` | Preload bridges |
| `windows/electron/ipc/handlers.ts`, `channels.ts` | IPC |
| `windows/electron/services/web-server.ts` | Embedded Next or proxy; sets `AUTH_URL` to `http://127.0.0.1:${port}` |
| `windows/electron/services/audio-listen.ts` | Mic / loopback listen |
| `windows/electron/services/license-service.ts` | License IPC |
| `windows/electron/windows/main-window.ts`, `companion-window.ts` | Windows |
| `shared/licensing/*` | Verify, device id, secure store |
| `shared/device-auth-headers.ts` | Device credential headers |
| `shared/speech-capture.ts` | Question capture |

This update **did not modify** desktop code. Google OAuth from Electron uses `127.0.0.1` and a different cookie host than `localhost`.

---

## 10. macOS desktop application

Canonical: `repositories/cueai-desktop/macos` (parallel Electron tree). Dev web port **3002** (`npm run dev:web:mac`). Google callback for mac dev: `http://127.0.0.1:3002/api/auth/callback/google`.

Shared licensing and speech-capture live in `cueai-desktop/shared`. UI chrome includes `cueai-web/src/components/desktop/mac-workspace.tsx` and `macos-permissions.tsx`.

---

## 11. Shared libraries and services

| Package | Path | Role |
|---------|------|------|
| `@cueai/gateway` | `cueai-gateway/src/fastapi-proxy.ts` | Proxy Next `/api/*` to FastAPI when enabled |
| `@cueai/shared-libraries` | licensing helpers, `extract-document.ts`, `poll-job` | Shared TS |
| `@cueai/notification-service` | `src/routes/route.ts` | Notifications GET |
| `@cueai/transcription-service` | transcribe POST | STT |
| `@cueai/translation-service` | translate POST | Translation |
| `@cueai/resume-service` | extract/analyze | Resume |
| `@cueai/export-service` | `exportDocument.ts` | Export |
| `@cueai/screen-context-service` | screen POST → FastAPI `/v1/live/screen` | Screen |
| `@cueai/ai-orchestrator` | `src/server/*` | LLM |

---

## 12. Database models and migrations

**Default local web:** JSON files in gitignored `.data/` (`workspace-store.json`, billing store, licenses). Not SQL.

**FastAPI / Docker:** SQLAlchemy + Alembic.

| Path | Purpose |
|------|---------|
| `cueai-api/alembic/env.py` | Alembic env |
| `cueai-api/alembic/versions/20260325_0001_initial.py` | Initial migration |
| `cueai-api/app/db/base.py` | Declarative base |
| `cueai-web/src/lib/server/db.ts` | JSON workspace users/meetings |
| `cueai-web/src/lib/server/billing-db.ts` | JSON subscriptions / Stripe customers / webhook idempotency |
| `cueai-web/src/lib/server/license-db.ts` | JSON licenses |

Compose can start Postgres via profile; default local web does not require it.

---

## 13. API routes and endpoint purposes

### Next.js (`repositories/cueai-web/src/app/api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET, POST | `/api/auth/[...nextauth]` | NextAuth (Google callback `/api/auth/callback/google`) |
| GET | `/api/auth/providers` | OAuth configured flags |
| POST | `/api/auth/login` | Email/password |
| POST | `/api/auth/signup` | Signup |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | HMAC session user |
| POST | `/api/auth/oauth-sync` | NextAuth → HMAC session |
| GET | `/api/billing/catalog` | Public plans |
| POST | `/api/billing/checkout` | Stripe Checkout |
| POST | `/api/billing/portal` | Customer portal |
| POST | `/api/billing/webhook` | Stripe webhooks |
| POST | `/api/stripe/webhook` | Webhook alias |
| GET | `/api/billing/subscription` | Current sub |
| GET, POST | `/api/billing/status` | Billing status |
| GET, POST | `/api/workspaces` | Workspaces |
| GET, PUT | `/api/onboarding` | Onboarding |
| GET, POST | `/api/meetings` | Meetings |
| GET, PATCH, DELETE | `/api/meetings/[id]` | Meeting CRUD |
| GET, POST, DELETE | `/api/meetings/knowledge` | Meeting knowledge |
| POST | `/api/live/answer` | Live AI answer |
| GET, PUT | `/api/live/briefing` | Briefing |
| POST | `/api/live/meeting-event` | Events |
| POST | `/api/live/screen` | Screen |
| GET | `/api/jobs/[jobId]` | Async job |
| POST | `/api/transcribe` | STT |
| POST | `/api/translate` | Translation |
| POST | `/api/resume/extract`, `/analyze` | Resume |
| GET | `/api/notifications` | Notifications |
| * | `/api/license/*`, `/api/devices/*` | License + device |
| * | `/api/admin/*` | Admin (users, invites, knowledge, AI, licenses, devices, billing, audit, retention) |
| * | `/api/settings/api-keys*` | BYOK keys |

### FastAPI (`cueai-api`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health`, `/v1/health` | Health |
| POST | `/v1/auth/login`, `/signup`, `/logout` | Auth |
| GET | `/v1/auth/me`, `/providers` | Session / providers |
| POST | `/v1/live/answer`, `/v1/live/screen` | Live |
| GET | `/v1/jobs/{job_id}` | Jobs |
| GET, POST | `/v1/workspaces` | Workspaces |
| GET, PUT | `/v1/onboarding` | Onboarding |
| GET | `/v1/entitlements/me` | Entitlements |
| POST/GET | `/v1/license/*` | License |

---

## 14. Docker, Redis, Celery, and deployment

| Path | Purpose | Kind |
|------|---------|------|
| `repositories/cueai-infra/docker-compose.yml` | redis, qdrant, api, web, celery-worker; profiles `postgres`, `keycloak`, `dev` | configuration |
| `repositories/cueai-infra/.env.example` | Compose env template | configuration |
| `repositories/cueai-infra/keycloak/cueai-realm.json` | Optional Keycloak realm | configuration |
| `repositories/cueai-web/Dockerfile` | Web image | configuration |
| `repositories/cueai-api/Dockerfile`, `Dockerfile.worker` | API / Celery images | configuration |
| `cueai-api/app/core/celery.py` | Celery | production |
| Root `docker-compose.yml` | Keycloak-oriented compose (legacy/dev) | configuration |

`docker compose -f repositories/cueai-infra/docker-compose.yml config` validated successfully in this pass. Full stack bring-up was not run.

---

## 15. Environment variables and which service reads them

Never commit filled `.env` / `.env.local`. Templates: `.env.example`, `repositories/cueai-web/.env.example`, `repositories/cueai-infra/.env.example`, `repositories/cueai-api/.env.example`.

| Variable | Read by | Purpose |
|----------|---------|---------|
| `AUTH_SECRET` | web, api | HMAC session + NextAuth secret |
| `AUTH_URL` | web billing links; Auth.js unless Host wrapper overrides | Canonical origin |
| `APP_BASE_URL` | web billing | Checkout return origin |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | web NextAuth (api compose too) | Google OAuth |
| `AUTH_GITHUB_*`, `AUTH_APPLE_*` | web NextAuth if set | Optional social |
| `CUEAI_ENV` | web runtime-env | production guards |
| `CUEAI_USE_FASTAPI`, `CUEAI_API_URL` | web gateway | Proxy to FastAPI |
| `CUEAI_DATA_DIR` | web/api stores | Data directory |
| `CUEAI_BOOTSTRAP_ADMIN_*` | web/api | Local bootstrap admin |
| `STRIPE_SECRET_KEY` | web billing | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | web webhook | Signature |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRO_PRICE_ID` | web plans | Pro $5 Price |
| `STRIPE_PRICE_TEAM_MONTHLY` / `STRIPE_TEAM_PRICE_ID` | web plans | Team $10 Price |
| `STRIPE_PRICE_*_YEARLY` | web plans | Optional yearly |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | browser | Publishable key |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | web, api, orchestrator | LLM |
| `RAG_*`, `QDRANT_*` | knowledge-service / web rag | RAG |
| `KEYGATE_*` | web keygate.ts, api keygate_service | Licenses |
| `LICENSE_SIGNING_PRIVATE_KEY` | web license-crypto | Desktop licenses |
| `DATABASE_URL`, `REDIS_URL` | api / celery | Docker/prod |
| `CORS_ORIGINS` | api | CORS |

---

## 16. Tests and test instructions

| Command | Location | What it covers | Run in this pass |
|---------|----------|----------------|------------------|
| `npm run test:billing` | cueai-web | 15 billing unit tests (Free, $5/$10 prices, webhook grant, unpaid, portal) | **pass 15/15** |
| `npm run test:oauth` | cueai-web | OAuth complete URLs stay on NextAuth | **pass 1/1** |
| `node scripts/test-oauth-link.mjs` | repo root | OAuth link policy | **pass** |
| `npx tsc --noEmit` | cueai-web | Typecheck | **pass** |
| `python -m pytest tests/test_health.py tests/test_auth_workspace.py tests/test_live_answer.py` | cueai-api | 33 tests | **pass 33** |
| `docker compose … config` | cueai-infra | Compose file | **OK** |
| `npm run test:e2e` | root Playwright | Browser e2e | **not run** |
| `npm run build` | legacy `apps/web` | Production build | **not run** |
| `scripts/test-live-checkout.mts` | live HTTP against port 3000 | Needs running server + Stripe | **not run here** |
| Knowledge `tests/rag/*.py` | knowledge-service | RAG | **not run here** |

`repositories/cueai-docs/BILLING-STRIPE.md` mentions `npm run test:licenses`; that script is **not** in `cueai-web/package.json`.

---

## 17. Build and development commands

| Command | Effect |
|---------|--------|
| `npm run dev:web` | Next on `127.0.0.1:3000` (`repositories/cueai-web`) |
| `npm run dev:web:mac` | Next on `127.0.0.1:3002` |
| `npm run dev:desktop` | Legacy `apps/desktop` Electron |
| `npm run dev:mac` / `dev:desktop:mac` | macOS desktop scripts |
| `cd repositories/cueai-web && npm run build` | Next production build |
| `cd repositories/cueai-api && uvicorn` / Docker | FastAPI |
| Compose | `docker compose -f repositories/cueai-infra/docker-compose.yml up` |

---

## 18. External integrations and dependencies

| Integration | Status in code |
|-------------|----------------|
| NextAuth Google | Implemented; Console redirect URI must match |
| Stripe Checkout + webhooks + portal | Implemented; keys/prices in env |
| Keygate | Optional; tests skip when unconfigured |
| Gemini / Groq | Live answers |
| Qdrant | RAG vectors |
| Redis / Celery | Jobs, Docker |
| Keycloak | Optional compose profile; not the default local Google path |
| Appwrite | **Not** an auth integration in this codebase |
| Electron auto-update | `windows/electron/updater/updater.ts` |

npm: `next@16.3.0`, `next-auth@5.0.0-beta.32`, `stripe`, `react@19`. Python: FastAPI, Celery, SQLAlchemy (see `cueai-api/requirements.txt`).

---

## 19. Security-sensitive files and configuration

**Do not commit:** `.env`, `.env.local`, `AUTH_GOOGLE_SECRET`, Stripe `sk_` / `whsec_`, `AUTH_SECRET`, license private keys, Keygate admin keys.

Gitignore already has `.env*` with `!.env.example`.

**This pass:** staged diffs of `.env.example` files contain **empty placeholders only**. Real Google/Stripe values live in gitignored `repositories/cueai-web/.env.local`. Dummy values in `scripts/test-billing.mts` (`sk_test_cueai_billing_dummy`) are not live credentials.

If a secret was ever committed in Git history, deleting it from the latest tree is **not** sufficient; rotate the secret and purge history. This pass did not find live secrets in the **uncommitted** diff.

HMAC cookie name: `cueai_admin_session`. Production refuses placeholder `AUTH_SECRET` via `runtime-env.ts`.

---

## 20. Known limitations and unfinished work

1. **Google sign-in:** provider and redirect URI generation verified; **full Google consent → CueAI dashboard was not completed in a browser for this documentation/push pass.** Google Cloud must list `http://localhost:3000/api/auth/callback/google`.
2. **`apps/web`** is a stale mirror; its `.env.local` `AUTH_GOOGLE_*` may be empty. Running that tree is not the supported local path.
3. **AUTH_URL** remains `http://127.0.0.1:3000` while browsers often use `localhost` (different cookie host).
4. **FastAPI proxy** off by default locally; two auth implementations can diverge if both are used without care.
5. **Keygate license mint after Stripe** skipped when Keygate env is unset.
6. **Yearly Stripe prices** have no invented display default; checkout disabled until Price IDs exist.
7. Nested Bitbucket repos and the GitHub monorepo both track overlapping `repositories/cueai-*` files.
8. `SEPARATION_CUTOVER_STATUS.md` is outdated (it says nested Git repos were not initialized; they now exist).
9. Playwright e2e, full `next build`, and live Stripe CLI webhook forwarding were not run in this pass.
10. Forgot-password email delivery needs investigation if SMTP/Resend is unset.

---

## File inventory (first-party source)

### `repositories/cueai-web/src` — auth, billing, API, pages (production unless noted)

See sections 3, 5, 6, 13 for every `route.ts` and page. Additional libraries:

`src/lib/auth.ts` (client session helpers), `auth-mode.ts`, `admin-auth.ts`, `app-access.ts`, `desktop*.ts`, `meetings-*.ts`, `roles.ts`, `utils.ts`, `mock-data.ts` (fixtures; treat as non-production data), `product-mode.ts`, `onboarding.ts`, `poll-job.ts`, `billing-plans.ts` (client re-export), `knowledge-store.ts`, `resume-store.ts`, `shortcuts.ts`, `translate-client.ts`, `exportDocument.ts`, `applyResumeRewrites.ts`, `live-session-config.ts`, `knowledge-categories.ts`.

`src/lib/server/`: `api-auth.ts`, `ai-config.ts`, `bootstrap-admin.ts`, `bypass-auth.ts`, `credential-resolver.ts`, `db.ts`, `devices.ts`, `email.ts`, `extract-document.ts`, `fastapi-proxy.ts`, `gemini.ts`, `groq.ts`, `keygate.ts`, `knowledge-retrieve.ts`, `license-crypto.ts`, `license-db.ts`, `licenses.ts`, `llm-generate.ts`, `live-cors.ts`, `meetings.ts`, `qwen-vl.ts`, `retention-cleanup.ts`, `screen-context.ts`, `session-edge.ts`, `synthetic.ts`, `translate.ts`, `translate-request.ts`, `usage.ts`, `user-profile.ts`, `workspace-scope.ts`, plus `rag/*` listed in §7.

`src/lib/stubs/xenova-transformers.ts` — webpack stub for `@xenova/transformers`.

Scripts (test code): `scripts/test-billing.mts`, `scripts/test-oauth-complete.mts`, `scripts/test-live-checkout.mts` (live HTTP; not a unit test), `scripts/test-device-auth.mts` if present.

Config: `package.json`, `tsconfig.json`, `next.config.ts`, `Dockerfile`, `.env.example`.

### `repositories/cueai-api` — see §4 and tests under `tests/`

Tests: `test_health.py`, `test_auth_workspace.py`, `test_live_answer.py`, `test_live_auth.py`, `test_live_translate_access.py`, `test_knowledge_pipeline.py`, `test_celery.py`, `test_celery_integration.py`, `test_database.py`, `test_redis.py`, `test_screen_analysis.py`, `conftest.py`.

### `repositories/cueai-desktop` — see §9–10 and `shared/` inventory in those sections.

### `repositories/cueai-infra` — `docker-compose.yml`, `.env.example`, `keycloak/cueai-realm.json`, `scripts/prepare-cloud-deploy.cjs`, `RUNTIME.md`, `README.md`.

### `repositories/cueai-docs` — markdown listed in glob (BILLING-STRIPE, RAG, KEYGATE, LICENSE, split plans, BACKEND-MIGRATION).

### `apps/web` and `apps/desktop` — legacy mirrors; not the `dev:web` runtime. `apps/web/src/auth.ts` and `apps/web/src/app/api/auth/oauth-sync/route.ts` were updated in this working tree to stay loosely aligned.

### Root

`package.json`, `.env.example`, `.gitignore`, `playwright.config.ts`, `e2e/*.spec.ts`, `scripts/test-oauth-link.mjs` (test). Do not treat `scripts/.last-meeting-api-test.json` as source.

---

*End of architecture document. If a listed path is missing after a later refactor, trust the repository over this snapshot.*
