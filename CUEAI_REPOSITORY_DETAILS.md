# CueAI repository details

**Generated:** 2026-10-10  
**Method:** Inspected nested `.git` remotes, `git ls-files`, route handlers, `package.json` / `requirements.txt`, and `.env.example` names. Secret values are omitted.

**Workspace:** `c:\Users\littu\OneDrive\Desktop\full one`  
**Also discovered:** GitHub monorepo at the workspace root (`origin` → `https://github.com/indrakiran7b/CueAI.git`, branch `separation`). `apps/web` and `apps/desktop` are **not** separate Git repositories; they are tracked only in the monorepo.

**Runtime note:** Library repos (`cueai-*-service`, `cueai-shared-libraries`, `cueai-gateway`, `cueai-ai-orchestrator`) are **imported by Next.js** via `file:../cueai-*`. They are not standalone HTTP servers unless stated.

No Kubernetes, Terraform, or `.github/workflows` files were found in these repositories.

---

## Table 1: Repository overview

| S.No. | Repository Name | Repository URL | Purpose | Primary Technologies | Size | Last Updated | Current Status |
|------:|-----------------|----------------|---------|----------------------|------|--------------|----------------|
| 1 | cueai-docs | https://bitbucket.org/wayfinderops/cueai-docs.git | Architecture, billing, RAG, and split documentation | Markdown | 15 tracked files | 2026-10-10 `b7aecaa` | Clean `main`, synced to Bitbucket |
| 2 | cueai-ai-orchestrator | https://bitbucket.org/wayfinderops/cueai-ai-orchestrator.git | Groq/Gemini/BYOK LLM helpers + Python live-answer copy + LLM benchmark | TypeScript, Python | 44 tracked | 2026-10-10 `2a9b495` | Clean `main`, synced |
| 3 | cueai-infra | https://bitbucket.org/wayfinderops/cueai-infra.git | Docker Compose, Keycloak realm, client-handoff scripts | Docker, JSON | 9 tracked | 2026-10-10 `586069a` | Clean `main`, synced |
| 4 | cueai-web | https://bitbucket.org/wayfinderops/cueai-web.git | Primary Next.js UI + BFF (`npm run dev:web`) | Next 16.3, React 19, NextAuth, Stripe | 275 tracked | 2026-10-10 `5bd4097` | Clean `main`, synced |
| 5 | cueai-desktop | https://bitbucket.org/wayfinderops/cueai-desktop.git | Windows + macOS Electron companions | Electron, Vite, React | 131 tracked | 2026-10-10 `01c3606` | Clean `main`, synced |
| 6 | cueai-api | https://bitbucket.org/wayfinderops/cueai-api.git | FastAPI `/v1` + Celery vision | FastAPI, Redis, optional Postgres | 80 tracked | 2026-10-10 `d00e978` | `main` synced; untracked `.data/` |
| 7 | cueai-translation-service | https://bitbucket.org/wayfinderops/cueai-translation-service.git | Translation route handlers imported by web | TypeScript | 9 tracked | 2026-10-09 `350828a` | Clean `main` |
| 8 | cueai-transcription-service | https://bitbucket.org/wayfinderops/cueai-transcription-service.git | Groq Whisper transcribe handler | TypeScript | 5 tracked | 2026-10-09 `87f5f4c` | Clean `main` |
| 9 | cueai-shared-libraries | https://bitbucket.org/wayfinderops/cueai-shared-libraries.git | Document extract, roles, licensing helpers | TypeScript | 17 tracked | 2026-10-09 `7bd612a` | Clean `main` |
| 10 | cueai-resume-service | https://bitbucket.org/wayfinderops/cueai-resume-service.git | Resume extract/analyze handlers | TypeScript | 8 tracked | 2026-10-09 `58064c9` | Clean `main` |
| 11 | cueai-knowledge-service | https://bitbucket.org/wayfinderops/cueai-knowledge-service.git | RAG retrieve + admin/meeting knowledge routes | TypeScript, Python | 47 tracked | 2026-10-09 `d2c3695` | Clean `main` |
| 12 | cueai-screen-context-service | https://bitbucket.org/wayfinderops/cueai-screen-context-service.git | Screen-analysis route + Qwen-VL sidecar | TypeScript, Python | 14 tracked | 2026-10-02 `517f626` | Clean `main` |
| 13 | cueai-gateway | https://bitbucket.org/wayfinderops/cueai-gateway.git | Optional FastAPI proxy helper + middleware reference | TypeScript | 6 tracked | 2026-10-02 `ede9528` | Clean `main` |
| 14 | cueai-notification-service | https://bitbucket.org/wayfinderops/cueai-notification-service.git | In-app notification list from audit log | TypeScript | 5 tracked | 2026-09-29 `70ee178` | Clean `main` |
| 15 | cueai-export-service | https://bitbucket.org/wayfinderops/cueai-export-service.git | Browser DOCX builder | TypeScript | 3 tracked | 2026-09-29 `fa00023` | Clean `main` |
| 16 | CueAI monorepo (root) | https://github.com/indrakiran7b/CueAI.git | npm workspaces `apps/*`, docs, e2e, mirror of `repositories/*` | Mixed | 1088 tracked | 2026-10-10 `c403df5` | Clean `separation`, synced to GitHub only |

---

## Table 2: File-by-file inventory

Generated/local (not listed row-by-row): `node_modules/`, `.next/`, `dist/`, `dist-electron/`, `.venv/`, `.data/`, `.env`, `.env.local`, pytest/tsc caches, Android splash/mipmap bitmaps in the monorepo.

### cueai-docs (15)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-docs | `.gitignore` | `.gitignore` | config | Ignore rules | Standard ignores | — | implemented |
| cueai-docs | `BILLING-STRIPE.md` | `BILLING-STRIPE.md` | docs | Stripe billing notes | Documents checkout/webhooks | cueai-web billing | implemented |
| cueai-docs | `BITBUCKET-UPDATE-REPORT.md` | `BITBUCKET-UPDATE-REPORT.md` | docs | Prior push report | Historical sync notes | — | implemented |
| cueai-docs | `FILE-BY-FILE-ARCHITECTURE.md` | `FILE-BY-FILE-ARCHITECTURE.md` | docs | Architecture map | Describes trees and remotes | — | implemented |
| cueai-docs | `KEYGATE-INTEGRATION.md` | `KEYGATE-INTEGRATION.md` | docs | Keygate licensing | Desktop → CueAI → Keygate | keygate.ts | implemented |
| cueai-docs | `LICENSE-IMPLEMENTATION.md` | `LICENSE-IMPLEMENTATION.md` | docs | License flow | Offline/online license | licenses.ts | implemented |
| cueai-docs | `REPOSITORY_AUDIT.md` | `REPOSITORY_AUDIT.md` | docs | 2026-10-10 audit | Release/sync summary | — | implemented |
| cueai-docs | `RESTRUCTURE-MIGRATION.md` | `RESTRUCTURE-MIGRATION.md` | docs | Split migration | Historical plan | — | implemented |
| cueai-docs | `architecture/BACKEND-MIGRATION.md` | `BACKEND-MIGRATION.md` | docs | FastAPI migration | Env and route notes | cueai-api | implemented |
| cueai-docs | `final-repository-separation-plan.md` | `final-repository-separation-plan.md` | docs | Separation plan | Historical | — | implemented |
| cueai-docs | `knowledge/RAG.md` | `RAG.md` | docs | RAG design | Embeddings/Qdrant | knowledge-service | implemented |
| cueai-docs | `repository-separation-audit.md` | `repository-separation-audit.md` | docs | Split audit | Historical | — | implemented |
| cueai-docs | `repository-split-analysis.md` | `repository-split-analysis.md` | docs | Split analysis | Historical | — | implemented |
| cueai-docs | `repository-split-plan.md` | `repository-split-plan.md` | docs | Split plan | Historical | — | implemented |
| cueai-docs | `repository-split-validation.md` | `repository-split-validation.md` | docs | Split validation | Historical | — | implemented |

### cueai-ai-orchestrator (source; benchmark result charts grouped)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-ai-orchestrator | `.env.example` | `.env.example` | config | Env names | `GROQ_API_KEY`, `GROQ_MODEL` | — | implemented |
| cueai-ai-orchestrator | `package.json` | `package.json` | manifest | Package `@cueai/ai-orchestrator` | Exports server helpers | imported by web | implemented |
| cueai-ai-orchestrator | `tsconfig.json` | `tsconfig.json` | config | TS compile | — | — | implemented |
| cueai-ai-orchestrator | `src/server/groq.ts` | `groq.ts` | source | Groq chat/stream | Primary live model, 12s timeout | Groq HTTP API | implemented |
| cueai-ai-orchestrator | `src/server/gemini.ts` | `gemini.ts` | source | Gemini generate | Fallback / vision JSON | Gemini API | implemented |
| cueai-ai-orchestrator | `src/server/llm-generate.ts` | `llm-generate.ts` | source | BYOK generate | Provider dispatch | groq/gemini/openai | implemented |
| cueai-ai-orchestrator | `src/server/credential-resolver.ts` | `credential-resolver.ts` | source | Resolve user/env keys | Never returns keys to client | db store | implemented |
| cueai-ai-orchestrator | `src/server/ai-config.ts` | `ai-config.ts` | source | Admin AI catalog | Provider catalog | — | implemented |
| cueai-ai-orchestrator | `python/app/modules/live/answer_service.py` | `answer_service.py` | source | Python live answers | Groq primary, Gemini fallback | httpx | implemented |
| cueai-ai-orchestrator | `python/app/modules/live/gemini.py` | `gemini.py` | source | Gemini JSON helper | generateContent | httpx | implemented |
| cueai-ai-orchestrator | `python/app/modules/live/prompts.py` | `prompts.py` | source | Interview system prompt | `INTERVIEW_SYSTEM_PROMPT` | — | implemented |
| cueai-ai-orchestrator | `python/app/modules/live/context.py` | `context.py` | source | RAG keyword retrieve | Meeting/workspace docs | JSON store | implemented |
| cueai-ai-orchestrator | `python/app/modules/live/providers.py` | `providers.py` | source | Provider list comment | groq/gemini/qwen-vl | — | implemented |
| cueai-ai-orchestrator | `llm-benchmark/*` | (22 files) | tool + results | Offline LLM benchmark | Accuracy/latency reports | OpenRouter | implemented (dev tool) |

### cueai-infra (9)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-infra | `docker-compose.yml` | `docker-compose.yml` | deploy | Compose stack | web, api, redis, qdrant, celery, keycloak | Docker | implemented |
| cueai-infra | `.env.example` | `.env.example` | config | Compose env names | Ports, keys, RAG flags | — | implemented |
| cueai-infra | `RUNTIME.md` | `RUNTIME.md` | docs | How compose runs | Dev port 8001 vs prod | — | implemented |
| cueai-infra | `README.md` | `README.md` | docs | Infra readme | Startup | — | implemented |
| cueai-infra | `keycloak/cueai-realm.json` | `cueai-realm.json` | config | Keycloak realm | Optional IdP | Keycloak | implemented (optional) |
| cueai-infra | `scripts/client-env.example` | `client-env.example` | config | Client handoff template | Names only | — | implemented |
| cueai-infra | `scripts/prepare-client-handoff.cjs` | `prepare-client-handoff.cjs` | script | Build client env | Copies examples | — | implemented |
| cueai-infra | `.gitignore` | `.gitignore` | config | Ignores `.env` | — | — | implemented |

### cueai-web — pages

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-web | `src/app/page.tsx` | `page.tsx` | page | Marketing landing | Public home | mock-data FAQs | implemented |
| cueai-web | `src/app/login/page.tsx` | `page.tsx` | page | Login | Email + Google | NextAuth, auth API | implemented |
| cueai-web | `src/app/signup/page.tsx` | `page.tsx` | page | Signup | Email signup | `/api/auth/signup` | implemented |
| cueai-web | `src/app/forgot-password/page.tsx` | `page.tsx` | page | Forgot password | UI exists | email if configured | partial (needs email) |
| cueai-web | `src/app/onboarding/page.tsx` | `page.tsx` | page | Onboarding | Stores answers | `/api/onboarding` | implemented |
| cueai-web | `src/app/auth/complete/page.tsx` | `page.tsx` | page | OAuth complete | oauth-sync then dashboard | NextAuth | implemented |
| cueai-web | `src/app/auth/desktop/google/page.tsx` | `page.tsx` | page | Desktop Google start | Browser handoff | desktop-google-handoff | implemented |
| cueai-web | `src/app/auth/desktop/complete/page.tsx` | `page.tsx` | page | Desktop Google finish | Returns `cueai://` | handoff ticket | implemented |
| cueai-web | `src/app/invite/[token]/page.tsx` | `page.tsx` | page | Accept invite | Token accept | `/api/invites/accept` | implemented |
| cueai-web | `src/app/license/page.tsx` | `page.tsx` | page | License UI | Activate/status | `/api/license/*` | implemented |
| cueai-web | `src/app/(app)/dashboard/page.tsx` | `page.tsx` | page | Dashboard | Real meetings/usage from store | meetings API | implemented |
| cueai-web | `src/app/(app)/meetings/page.tsx` | `page.tsx` | page | Meeting list | Empty if none | `/api/meetings` | implemented |
| cueai-web | `src/app/(app)/meetings/live/page.tsx` | `page.tsx` | page | Live session web UI | Companion / transcript | live APIs | implemented |
| cueai-web | `src/app/(app)/meetings/[id]/feed/page.tsx` | `page.tsx` | page | Meeting Q&A feed | Stored exchanges | meetings store | implemented |
| cueai-web | `src/app/(app)/meetings/[id]/summary/page.tsx` | `page.tsx` | page | Meeting summary | Stored summary | meetings store | implemented |
| cueai-web | `src/app/(app)/meetings/summary/page.tsx` | `page.tsx` | page | Summary alias | Same store | — | implemented |
| cueai-web | `src/app/(app)/knowledge/page.tsx` | `page.tsx` | page | Knowledge base UI | Upload/list docs | admin knowledge API | implemented |
| cueai-web | `src/app/(app)/knowledge/documents/[id]/page.tsx` | `page.tsx` | page | Document detail | Content/status | knowledge API | implemented |
| cueai-web | `src/app/(app)/settings/page.tsx` | `page.tsx` | page | Settings | BYOK keys, billing, profile | settings APIs | implemented |
| cueai-web | `src/app/(app)/billing/page.tsx` | `page.tsx` | page | Billing | Stripe status | `/api/billing/*` | implemented |
| cueai-web | `src/app/(app)/billing/success/page.tsx` | `page.tsx` | page | Checkout success | Return URL | Stripe | implemented |
| cueai-web | `src/app/(app)/billing/cancelled/page.tsx` | `page.tsx` | page | Checkout cancel | Return URL | Stripe | implemented |
| cueai-web | `src/app/(app)/pricing/page.tsx` | `page.tsx` | page | In-app pricing | Plan catalog | billing-plans | implemented |
| cueai-web | `src/app/(app)/admin/page.tsx` | `page.tsx` | page | Admin console | Users, licenses, usage | admin APIs + Admin role | implemented |
| cueai-web | `src/app/(app)/companion/page.tsx` | `page.tsx` | page | Web companion | Overlay fallback | desktop.ts | implemented |
| cueai-web | `src/app/(app)/resume/page.tsx` | `page.tsx` | page | Resume (app shell) | Resume tailor | resume APIs | implemented |
| cueai-web | `src/app/(app)/screen-context/page.tsx` | `page.tsx` | page | Screen context UI | Screenshot analyze | `/api/live/screen` | implemented |
| cueai-web | `src/app/(app)/translation/page.tsx` | `page.tsx` | page | Translation UI | Translate text | `/api/translate` | implemented |
| cueai-web | `src/app/resume-tailor/**` | pages | page | Resume Tailor product | Separate product mode | require-resume-access | implemented |

### cueai-web — API routes (each `route.ts` is a real App Router handler)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-web | `src/app/api/health/route.ts` | `route.ts` | API | Process liveness | `{status:ok}` | none | implemented |
| cueai-web | `src/app/api/live/health/route.ts` | `route.ts` | API | Live-answer readiness | FastAPI probe + local keys (booleans) | live-answer-backend | implemented |
| cueai-web | `src/app/api/live/answer/route.ts` | `route.ts` | API | Interview answers | Proxy FastAPI or local Groq→Gemini stream | groq, gemini, auth | implemented |
| cueai-web | `src/app/api/live/briefing/route.ts` | `route.ts` | API | Session briefing | GET/PUT resume/job context | meetings store | implemented |
| cueai-web | `src/app/api/live/meeting-event/route.ts` | `route.ts` | API | Persist Q/A line | Desktop overlay events | meetings | implemented |
| cueai-web | `src/app/api/live/screen/route.ts` | `route.ts` | API | Screen analysis | Re-export screen-context-service | FastAPI or Gemini | implemented |
| cueai-web | `src/app/api/transcribe/route.ts` | `route.ts` | API | STT | Re-export transcription-service | Groq Whisper | implemented |
| cueai-web | `src/app/api/translate/route.ts` | `route.ts` | API | Translate | Re-export translation-service | Groq | implemented |
| cueai-web | `src/app/api/resume/extract/route.ts` | `route.ts` | API | Resume extract | Re-export resume-service | mammoth/unpdf | implemented |
| cueai-web | `src/app/api/resume/analyze/route.ts` | `route.ts` | API | Resume analyze | Re-export resume-service | Groq | implemented |
| cueai-web | `src/app/api/notifications/route.ts` | `route.ts` | API | Notifications | Re-export notification-service | audit log | implemented |
| cueai-web | `src/app/api/meetings/route.ts` | `route.ts` | API | List/create meetings | JSON store | session | implemented |
| cueai-web | `src/app/api/meetings/[id]/route.ts` | `route.ts` | API | Get/patch/delete meeting | Workspace-scoped | session | implemented |
| cueai-web | `src/app/api/meetings/knowledge/route.ts` | `route.ts` | API | Meeting KB attach | Re-export knowledge-service | session | implemented |
| cueai-web | `src/app/api/auth/login/route.ts` | `route.ts` | API | Email login | HMAC session cookie | AUTH_SECRET | implemented |
| cueai-web | `src/app/api/auth/signup/route.ts` | `route.ts` | API | Email signup | Hashed password | store | implemented |
| cueai-web | `src/app/api/auth/logout/route.ts` | `route.ts` | API | Logout | Clears cookie | — | implemented |
| cueai-web | `src/app/api/auth/me/route.ts` | `route.ts` | API | Current user | Session payload | cookie | implemented |
| cueai-web | `src/app/api/auth/providers/route.ts` | `route.ts` | API | OAuth provider flags | google configured? | env | implemented |
| cueai-web | `src/app/api/auth/oauth-sync/route.ts` | `route.ts` | API | Link Google user | After NextAuth | NextAuth + store | implemented |
| cueai-web | `src/app/api/auth/[...nextauth]/route.ts` | `route.ts` | API | NextAuth | Google callback | AUTH_GOOGLE_* | implemented |
| cueai-web | `src/app/api/auth/desktop/google/begin/route.ts` | `route.ts` | API | Desktop OAuth begin | State + verifier | handoff store | implemented |
| cueai-web | `src/app/api/auth/desktop/google/status/route.ts` | `route.ts` | API | Handoff status | Poll ready | ticket | implemented |
| cueai-web | `src/app/api/auth/desktop/google/finish/route.ts` | `route.ts` | API | Claim ticket | After web login | ticket | implemented |
| cueai-web | `src/app/api/auth/desktop/google/exchange/route.ts` | `route.ts` | API | One-time code exchange | Device-bound | HMAC session | implemented |
| cueai-web | `src/app/api/billing/catalog/route.ts` | `route.ts` | API | Price catalog | From env price IDs | Stripe env | implemented |
| cueai-web | `src/app/api/billing/status/route.ts` | `route.ts` | API | Subscription status | Stripe + store | session | implemented |
| cueai-web | `src/app/api/billing/subscription/route.ts` | `route.ts` | API | Subscription detail | Stripe | session | implemented |
| cueai-web | `src/app/api/billing/checkout/route.ts` | `route.ts` | API | Checkout session | Stripe Checkout | STRIPE_SECRET_KEY | implemented |
| cueai-web | `src/app/api/billing/portal/route.ts` | `route.ts` | API | Customer portal | Stripe | session | implemented |
| cueai-web | `src/app/api/billing/webhook/route.ts` | `route.ts` | API | Stripe webhook | Signature verify | STRIPE_WEBHOOK_SECRET | implemented |
| cueai-web | `src/app/api/stripe/webhook/route.ts` | `route.ts` | API | Webhook alias | Same handler | Stripe | implemented |
| cueai-web | `src/app/api/onboarding/route.ts` | `route.ts` | API | Onboarding GET/PUT | Store answers | session | implemented |
| cueai-web | `src/app/api/workspaces/route.ts` | `route.ts` | API | Workspace list/select | Store | session | implemented |
| cueai-web | `src/app/api/invites/accept/route.ts` | `route.ts` | API | Accept invite | Token | store | implemented |
| cueai-web | `src/app/api/devices/register/route.ts` | `route.ts` | API | Register desktop device | Device credential | session/device | implemented |
| cueai-web | `src/app/api/devices/status/route.ts` | `route.ts` | API | Device verify | 401 if invalid | device headers | implemented |
| cueai-web | `src/app/api/license/activate/route.ts` | `route.ts` | API | Activate license | Keygate or local | server keys | implemented |
| cueai-web | `src/app/api/license/deactivate/route.ts` | `route.ts` | API | Deactivate | Keygate | — | implemented |
| cueai-web | `src/app/api/license/validate/route.ts` | `route.ts` | API | Validate | Keygate | — | implemented |
| cueai-web | `src/app/api/license/verify/route.ts` | `route.ts` | API | Verify token | Keygate | — | implemented |
| cueai-web | `src/app/api/license/status/route.ts` | `route.ts` | API | License status | Store/Keygate | session | implemented |
| cueai-web | `src/app/api/license/entitlements/route.ts` | `route.ts` | API | Entitlements | Plan + license | session | implemented |
| cueai-web | `src/app/api/license/device/register/route.ts` | `route.ts` | API | License device bind | Keygate | — | implemented |
| cueai-web | `src/app/api/settings/api-keys/route.ts` | `route.ts` | API | BYOK list/create | Encrypted store | CUEAI_SECRET_ENCRYPTION_KEY | implemented |
| cueai-web | `src/app/api/settings/api-keys/[id]/route.ts` | `route.ts` | API | Patch/delete key | Encrypted | — | implemented |
| cueai-web | `src/app/api/settings/api-keys/[id]/test/route.ts` | `route.ts` | API | Test BYOK | Provider ping | — | implemented |
| cueai-web | `src/app/api/settings/api-keys/[id]/default/route.ts` | `route.ts` | API | Set default key | Store | — | implemented |
| cueai-web | `src/app/api/jobs/[jobId]/route.ts` | `route.ts` | API | Poll job | Proxies FastAPI jobs | CUEAI_API_URL | implemented |
| cueai-web | `src/app/api/admin/*` | multiple `route.ts` | API | Admin users, AI, audit, billing, devices, invites, knowledge, licenses, overview, purge, retention, settings, translate, usage, workspace | Role-gated | require Admin | implemented |

### cueai-web — libraries, config, tests

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-web | `src/lib/live-answer.ts` | `live-answer.ts` | source | Interview prompt | `INTERVIEW_SYSTEM_PROMPT`, user prompt | used by API | implemented |
| cueai-web | `src/lib/server/live-answer-backend.ts` | `live-answer-backend.ts` | source | FastAPI probe/proxy | Local fallback when API down | CUEAI_API_URL | implemented |
| cueai-web | `src/lib/server/groq.ts` | `groq.ts` | source | Re-export | `@cueai/ai-orchestrator/server/groq` | orchestrator | implemented |
| cueai-web | `src/lib/server/gemini.ts` | `gemini.ts` | source | Re-export | orchestrator gemini | orchestrator | implemented |
| cueai-web | `src/lib/server/db.ts` | `db.ts` | source | JSON workspace store | Users, meetings, knowledge | CUEAI_DATA_DIR | implemented |
| cueai-web | `src/lib/server/session.ts` | `session.ts` | source | HMAC session | `cueai_admin_session` | AUTH_SECRET | implemented |
| cueai-web | `src/lib/server/api-auth.ts` | `api-auth.ts` | source | Session or device | requireAuthOrDevice | devices | implemented |
| cueai-web | `src/lib/server/billing.ts` | `billing.ts` | source | Stripe billing | Checkout, webhook, portal | stripe | implemented |
| cueai-web | `src/lib/server/keygate.ts` | `keygate.ts` | source | License intermediary | Desktop never sees Keygate keys | KEYGATE_* | implemented |
| cueai-web | `src/lib/server/desktop-google-handoff.ts` | `desktop-google-handoff.ts` | source | Desktop OAuth tickets | Single-use verifier | AUTH_SECRET | implemented |
| cueai-web | `src/lib/server/rag/*` | multiple | source | RAG pipeline re-exports | Mirrors knowledge-service | Qdrant/embeddings | implemented |
| cueai-web | `src/auth.ts` | `auth.ts` | source | NextAuth factory | Google provider | AUTH_GOOGLE_* | implemented |
| cueai-web | `src/middleware.ts` | `middleware.ts` | source | Edge auth | Public prefixes; live APIs bypass cookie | session-edge | implemented |
| cueai-web | `src/lib/mock-data.ts` | `mock-data.ts` | source | Landing pricing/FAQ | Marketing only, no fake meetings | landing | implemented |
| cueai-web | `package.json` | `package.json` | manifest | Scripts/deps | Next 16.3, React 19.2.8 | file: siblings | implemented |
| cueai-web | `next.config.ts` | `next.config.ts` | config | Webpack/Xenova/transpilePackages | optimizePackageImports lucide | — | implemented |
| cueai-web | `Dockerfile` | `Dockerfile` | deploy | Production web image | standalone | compose | implemented |
| cueai-web | `.env.example` | `.env.example` | config | Env names | See Table 8 | — | implemented |
| cueai-web | `scripts/test-oauth-*.mts` | tests | test | OAuth/handoff unit tests | 10 passed 2026-10-10 | tsx | implemented |
| cueai-web | `scripts/test-billing.mts` | `test-billing.mts` | test | Billing unit tests | available | tsx | implemented |
| cueai-web | `src/components/**` | many | UI | Auth gates, admin, billing, companion, mac glass, meetings, resume, settings | Presentational + hooks | pages | implemented |
| cueai-web | `public/*` | assets | static | Logo/SVGs | — | — | implemented |

### cueai-desktop (131 tracked — grouped by module)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-desktop | `windows/electron/main/index.ts` | `index.ts` | source | Windows main process | Window, IPC, protocol | Electron | implemented |
| cueai-desktop | `windows/electron/services/google-oauth.ts` | `google-oauth.ts` | source | System-browser Google | cueai:// callback | web handoff APIs | implemented |
| cueai-desktop | `windows/electron/services/protocol.ts` | `protocol.ts` | source | cueai:// handler | auth/callback | google-oauth | implemented |
| cueai-desktop | `windows/src/services/live-answer.ts` | `live-answer.ts` | source | Overlay answers | POST `/api/live/answer` + health | Next | implemented |
| cueai-desktop | `windows/src/App.tsx` | `App.tsx` | UI | Companion overlay | Auto-answer, stream, health poll | live-answer | implemented |
| cueai-desktop | `macos/electron/**` | many | source | macOS main (Keychain, TCC) | Parallel to Windows | Electron | implemented |
| cueai-desktop | `macos/src/**` | many | UI | macOS overlay | Same contract, port 3002 | Next mac | implemented |
| cueai-desktop | `shared/speech-capture.ts` | `speech-capture.ts` | source | VAD / end-of-utterance | Shared Win/Mac | audio-listen | implemented |
| cueai-desktop | `shared/device-auth-headers.ts` | `device-auth-headers.ts` | source | Device headers | X-CueAI-Device-* | safeStorage | implemented |
| cueai-desktop | `shared/licensing/*` | several | source | License client | Calls Next `/api/license` | not Keygate directly | implemented |
| cueai-desktop | `windows/electron-builder*.yml` | yml | config | Windows packaging | setup/portable | electron-builder | implemented |
| cueai-desktop | `macos/build/entitlements*.plist` | plist | config | macOS entitlements | Hardened runtime | notarize | implemented |
| cueai-desktop | `scripts/dev-mac.cjs` | `dev-mac.cjs` | script | macOS dev launcher | — | — | implemented |

### cueai-api (80 tracked)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-api | `app/main.py` | `main.py` | source | FastAPI app | Mounts `/v1` routers, `/health` | FastAPI | implemented |
| cueai-api | `app/core/config.py` | `config.py` | source | Settings | Host, Redis, secrets | env | implemented |
| cueai-api | `app/core/session.py` | `session.py` | source | HMAC session | Same cookie as Next | AUTH_SECRET | implemented |
| cueai-api | `app/modules/live/answer_service.py` | `answer_service.py` | source | Live answers | Groq first, Gemini fallback | GROQ_API_KEY | implemented |
| cueai-api | `app/modules/live/router.py` | `router.py` | source | `/v1/live/answer|screen` | Stream + JSON | session cookie | implemented |
| cueai-api | `app/modules/live/prompts.py` | `prompts.py` | source | Interview prompt | Shared with web | — | implemented |
| cueai-api | `app/modules/auth/router.py` | `router.py` | source | `/v1/auth/*` | login/signup/me/logout | store | implemented |
| cueai-api | `app/modules/workspace/router.py` | `router.py` | source | `/v1/workspaces` | list/select | session | implemented |
| cueai-api | `app/modules/onboarding/router.py` | `router.py` | source | `/v1/onboarding` | GET/PUT | session | implemented |
| cueai-api | `app/modules/license/router.py` | `router.py` | source | `/v1/license/*` | Keygate mirror | keygate_service | implemented |
| cueai-api | `app/modules/entitlements/router.py` | `router.py` | source | `/v1/entitlements/me` | Plan flags | store | implemented |
| cueai-api | `app/modules/jobs/router.py` | `router.py` | source | `/v1/jobs/{id}` | Job poll | redis/memory | implemented |
| cueai-api | `app/modules/knowledge/rag.py` | `rag.py` | source | Python RAG | Qdrant helpers | **not mounted as HTTP** | implemented library |
| cueai-api | `app/persistence/store.py` | `store.py` | source | JSON store | Shared workspace file | CUEAI_DATA_DIR | implemented |
| cueai-api | `app/db/session.py` | `session.py` | source | Optional Postgres | Health only unless DATABASE_URL | asyncpg | partial (deferred business migrate) |
| cueai-api | `alembic/versions/20260325_0001_initial.py` | migration | db | Initial Alembic | Schema exists | Postgres optional | implemented unused in default |
| cueai-api | `app/tasks/vision.py` | `vision.py` | source | Celery screen job | Gemini vision | Redis | implemented |
| cueai-api | `tests/test_live_answer.py` | `test_live_answer.py` | test | Provider/fallback | 20+ cases | pytest | implemented |
| cueai-api | `Dockerfile` / `Dockerfile.worker` | Docker | deploy | API + Celery images | compose | implemented |
| cueai-api | `requirements.txt` | `requirements.txt` | manifest | fastapi, uvicorn, redis, celery, httpx | — | implemented |

### Library services (complete tracked lists)

| Repository | File Path | File Name | File Type | Purpose | Main Functionality | Dependencies | Status |
|---|---|---|---|---|---|---|---|
| cueai-translation-service | `src/translate.ts` | `translate.ts` | source | Translate impl | Groq chat | GROQ_API_KEY | implemented |
| cueai-translation-service | `src/translate-request.ts` | `translate-request.ts` | source | Parse request | — | — | implemented |
| cueai-translation-service | `src/routes/translate.ts` | `translate.ts` | source | POST handler | Auth required | mounted at `/api/translate` | implemented |
| cueai-translation-service | `src/routes/admin-translate.ts` | `admin-translate.ts` | source | Admin translate | Admin role | `/api/admin/translate` | implemented |
| cueai-transcription-service | `src/routes/transcribe.ts` | `transcribe.ts` | source | Whisper STT | Groq audio | `/api/transcribe` | implemented |
| cueai-shared-libraries | `src/extract-document.ts` | `extract-document.ts` | source | PDF/DOCX text | mammoth/unpdf | resume/KB | implemented |
| cueai-shared-libraries | `src/roles.ts` | `roles.ts` | source | Role helpers | Admin/member | web | implemented |
| cueai-shared-libraries | `src/licensing/*` | several | source | License types/verify | Shared with desktop | — | implemented |
| cueai-resume-service | `src/routes/extract.ts` | `extract.ts` | source | Extract resume text | Auth | `/api/resume/extract` | implemented |
| cueai-resume-service | `src/routes/analyze.ts` | `analyze.ts` | source | Tailor resume | Groq | `/api/resume/analyze` | implemented |
| cueai-knowledge-service | `src/knowledge-retrieve.ts` | `knowledge-retrieve.ts` | source | Live RAG gate | `needsLiveKnowledge` | live answer | implemented |
| cueai-knowledge-service | `src/rag/*.ts` | several | source | Chunk/embed/Qdrant | Semantic RAG | QDRANT_URL | implemented |
| cueai-knowledge-service | `src/routes/admin/**` | several | source | Admin KB CRUD | Auth + workspace | `/api/admin/knowledge` | implemented |
| cueai-knowledge-service | `src/routes/meetings/knowledge.ts` | `knowledge.ts` | source | Meeting docs | Attach IDs | `/api/meetings/knowledge` | implemented |
| cueai-knowledge-service | `fixtures/test_knowledge/**` | PDFs/CSV | fixture | RAG test corpus | Not production seed | tests | test fixture |
| cueai-screen-context-service | `src/routes/screen.ts` | `screen.ts` | source | Screen POST | Proxies FastAPI `/v1/live/screen` | CUEAI_API_URL | implemented |
| cueai-screen-context-service | `tools/qwen-vl/server.py` | `server.py` | source | Local VL sidecar | Optional | CUEAI_QWEN_VL_URL | optional |
| cueai-gateway | `src/fastapi-proxy.ts` | `fastapi-proxy.ts` | source | Optional proxy | Only if `CUEAI_USE_FASTAPI=1` | CUEAI_API_URL | implemented |
| cueai-gateway | `src/middleware-reference.ts` | `middleware-reference.ts` | source | Public-path list | Reference copy | web middleware | implemented |
| cueai-notification-service | `src/routes/notifications.ts` | `notifications.ts` | source | GET feed | Scoped audit events | `/api/notifications` | implemented |
| cueai-notification-service | `src/email.ts` | `email.ts` | source | Email helper | Resend/SMTP | RESEND/SMTP | implemented if env set |
| cueai-export-service | `src/exportDocument.ts` | `exportDocument.ts` | source | Build .docx | Client-side zip | web re-export | implemented |

---

## Table 3: Directory and module details

| Repository | Directory/Module | Responsibility | Important Files | Related Services | Implementation Status |
|---|---|---|---|---|---|
| cueai-web | `src/app/(app)` | Authenticated product pages | dashboard, meetings, knowledge, settings | store APIs | implemented |
| cueai-web | `src/app/api` | BFF HTTP API | live, auth, billing, license | FastAPI optional, Stripe, Groq | implemented |
| cueai-web | `src/lib/server` | Persistence, auth, billing, RAG | db.ts, billing.ts, session.ts | Redis not required for JSON store | implemented |
| cueai-web | `src/auth.ts` + middleware | NextAuth + cookie gate | auth.ts, middleware.ts | Google | implemented |
| cueai-api | `app/modules/live` | Live answers + screen enqueue | answer_service.py, router.py | Groq, Gemini, Celery | implemented |
| cueai-api | `app/modules/auth` | Email auth on FastAPI | router.py, service.py | same HMAC cookie | implemented |
| cueai-api | `app/modules/knowledge` | Python RAG library | rag.py | **no router in main.py** | library only |
| cueai-api | `app/db` + `alembic` | Optional Postgres | session.py | DATABASE_URL unset by default | partial |
| cueai-desktop | `windows/` vs `macos/` | Platform-isolated Electron | google-oauth.ts, live-answer.ts | cueai-web | implemented |
| cueai-desktop | `shared/` | Speech + device auth + licensing | speech-capture.ts | both platforms | implemented |
| cueai-knowledge-service | `src/rag` | Semantic retrieval | rag-service.ts, vector-store.ts | Qdrant, embeddings | implemented when env set |
| cueai-infra | compose | Runtime topology | docker-compose.yml | web, api, redis, qdrant | implemented |
| cueai-ai-orchestrator | `src/server` | Shared LLM clients | groq.ts, gemini.ts | web + local live path | implemented |
| CueAI monorepo | `apps/desktop` | Windows companion actually launched by `npm run dev:desktop` | App.tsx | cueai-web :3000 | implemented (mirror) |
| CueAI monorepo | `android/` | Capacitor overlay experiment | OverlayService.java | unverified on-device | partial / unverified |

---

## Table 4: API endpoint inventory

Auth: **session** = HMAC cookie `cueai_admin_session`. **device** = `X-CueAI-Device-Id` + credential. **admin** = session + Admin role. **stripe** = webhook signature. **none** = public.

### cueai-web (mounted on Next)

| Repository | HTTP Method | Endpoint | Purpose | Authentication Required | Request/Response Summary | Implementation Status |
|---|---|---|---|---|---|---|
| cueai-web | GET | `/api/health` | Liveness | none | `{status:"ok"}` | implemented |
| cueai-web | GET | `/api/live/health` | Live provider readiness | none (CORS for overlay) | mode, fastapi, groqConfigured, geminiConfigured | implemented |
| cueai-web | POST | `/api/live/answer` | Interview answer (SSE or JSON) | session or device | `{prompt, transcript?, stream?}` → tokens/done | implemented |
| cueai-web | OPTIONS | `/api/live/answer` | CORS | none | 204 | implemented |
| cueai-web | GET/PUT | `/api/live/briefing` | Session resume/job briefing | session or device | briefing object | implemented |
| cueai-web | POST | `/api/live/meeting-event` | Persist exchange | session or device | prompt/answer | implemented |
| cueai-web | POST | `/api/live/screen` | Screen analysis | session or device | image + prompt | implemented |
| cueai-web | POST | `/api/transcribe` | Speech-to-text | session or device | audio → text | implemented |
| cueai-web | POST | `/api/translate` | Translate | session | text + langs | implemented |
| cueai-web | POST | `/api/resume/extract` | Extract resume | session | file → text | implemented |
| cueai-web | POST | `/api/resume/analyze` | Analyze/tailor | session | resume + JD | implemented |
| cueai-web | GET | `/api/notifications` | Notification list | session | audit-derived items | implemented |
| cueai-web | GET/POST | `/api/meetings` | List/create | session | meeting records | implemented |
| cueai-web | GET/PATCH/DELETE | `/api/meetings/[id]` | Meeting CRUD | session + workspace | meeting | implemented |
| cueai-web | GET/POST/DELETE | `/api/meetings/knowledge` | Attach KB docs | session | document ids | implemented |
| cueai-web | POST | `/api/auth/login` | Email login | none | email/password → cookie | implemented |
| cueai-web | POST | `/api/auth/signup` | Signup | none | user + cookie | implemented |
| cueai-web | POST | `/api/auth/logout` | Logout | session | clears cookie | implemented |
| cueai-web | GET | `/api/auth/me` | Current user | session | user/role | implemented |
| cueai-web | GET | `/api/auth/providers` | OAuth flags | none | `{google:boolean}` | implemented |
| cueai-web | POST | `/api/auth/oauth-sync` | Link Google account | NextAuth session | user + HMAC cookie | implemented |
| cueai-web | GET/POST | `/api/auth/*` (NextAuth) | Google OAuth | none → Google | callback | implemented |
| cueai-web | POST | `/api/auth/desktop/google/begin` | Start desktop handoff | none (device later) | state | implemented |
| cueai-web | GET | `/api/auth/desktop/google/status` | Poll handoff | ticket | ready flag | implemented |
| cueai-web | POST | `/api/auth/desktop/google/finish` | Claim ticket | after web login | code | implemented |
| cueai-web | POST | `/api/auth/desktop/google/exchange` | One-time session | verifier + device | HMAC cookie | implemented |
| cueai-web | GET | `/api/billing/catalog` | Prices | none | plan list | implemented |
| cueai-web | GET/POST | `/api/billing/status` | Sub status | session | Stripe/store | implemented |
| cueai-web | GET | `/api/billing/subscription` | Sub detail | session | Stripe | implemented |
| cueai-web | POST | `/api/billing/checkout` | Checkout | session | Stripe session | implemented (needs price IDs) |
| cueai-web | POST | `/api/billing/portal` | Portal | session | Stripe URL | implemented |
| cueai-web | POST | `/api/billing/webhook` | Stripe events | stripe signature | subscription sync | implemented |
| cueai-web | POST | `/api/stripe/webhook` | Alias | stripe signature | same | implemented |
| cueai-web | GET/PUT | `/api/onboarding` | Onboarding | session | answers | implemented |
| cueai-web | GET/POST | `/api/workspaces` | Workspaces | session | list/select | implemented |
| cueai-web | GET/POST | `/api/invites/accept` | Invite | token | membership | implemented |
| cueai-web | POST | `/api/devices/register` | Device register | session | credential | implemented |
| cueai-web | GET | `/api/devices/status` | Device verify | device | ok/401 | implemented |
| cueai-web | POST | `/api/license/activate` | Activate | varies | license | implemented |
| cueai-web | POST | `/api/license/deactivate` | Deactivate | session/device | — | implemented |
| cueai-web | POST | `/api/license/validate` | Validate | license body | — | implemented |
| cueai-web | POST | `/api/license/verify` | Verify | token | — | implemented |
| cueai-web | GET | `/api/license/status` | Status | session | — | implemented |
| cueai-web | GET/POST | `/api/license/entitlements` | Entitlements | session | plan flags | implemented |
| cueai-web | POST | `/api/license/device/register` | Bind device | license | — | implemented |
| cueai-web | GET/POST | `/api/settings/api-keys` | BYOK | session | encrypted keys | implemented |
| cueai-web | PATCH/DELETE | `/api/settings/api-keys/[id]` | BYOK item | session | — | implemented |
| cueai-web | POST | `/api/settings/api-keys/[id]/test` | Test key | session | provider ping | implemented |
| cueai-web | POST | `/api/settings/api-keys/[id]/default` | Default key | session | — | implemented |
| cueai-web | GET | `/api/jobs/[jobId]` | Job poll | session | proxies FastAPI | implemented |
| cueai-web | GET/PATCH/POST/DELETE | `/api/admin/*` | Admin operations | admin | users, KB, licenses, usage | implemented |

### cueai-api (mounted in `create_app`)

| Repository | HTTP Method | Endpoint | Purpose | Authentication Required | Request/Response Summary | Implementation Status |
|---|---|---|---|---|---|---|
| cueai-api | GET | `/health` | Process liveness | none | `{status:ok}` | implemented |
| cueai-api | GET | `/v1/health` | Redis (+ optional DB) | none | status/redis/database | implemented |
| cueai-api | POST | `/v1/live/answer` | Live answer | session cookie | prompt → answer/SSE | implemented |
| cueai-api | OPTIONS | `/v1/live/answer` | CORS | none | 204 | implemented |
| cueai-api | POST | `/v1/live/screen` | Enqueue screen job | session | job id | implemented |
| cueai-api | POST | `/v1/auth/login` | Login | none | cookie | implemented |
| cueai-api | POST | `/v1/auth/signup` | Signup | none | cookie | implemented |
| cueai-api | GET | `/v1/auth/me` | Me | session | user | implemented |
| cueai-api | POST | `/v1/auth/logout` | Logout | session | — | implemented |
| cueai-api | GET | `/v1/auth/providers` | Provider flags | none | — | implemented |
| cueai-api | GET/POST | `/v1/workspaces` | Workspaces | session | — | implemented |
| cueai-api | GET/PUT | `/v1/onboarding` | Onboarding | session | — | implemented |
| cueai-api | GET | `/v1/entitlements/me` | Entitlements | session | — | implemented |
| cueai-api | GET | `/v1/jobs/{job_id}` | Job poll | session | — | implemented |
| cueai-api | POST | `/v1/license/activate` | License | body | Keygate | implemented |
| cueai-api | POST | `/v1/license/verify` | Verify | body | — | implemented |
| cueai-api | POST | `/v1/license/deactivate` | Deactivate | body | — | implemented |
| cueai-api | GET | `/v1/license/status` | Status | session/body | — | implemented |

Library repos do **not** bind ports. Their handlers are the web endpoints above.

---

## Table 5: Technology stack

| Repository | Language | Framework | Runtime | Database | AI Provider | Major Dependencies | Build Tool |
|---|---|---|---|---|---|---|---|
| cueai-docs | Markdown | — | — | — | — | — | — |
| cueai-ai-orchestrator | TS + Python | none (library) | Node / CPython | none | Groq, Gemini | httpx (py), fetch | tsc |
| cueai-infra | YAML | Docker Compose | Docker | Redis, Qdrant (services) | keys passed to api/web | Keycloak optional | docker compose |
| cueai-web | TypeScript | Next.js 16.3, React 19.2.8 | Node | JSON store (`.data`); Stripe is source of billing | Groq primary, Gemini fallback | next-auth, stripe, lucide, recharts | `next build --webpack` |
| cueai-desktop | TypeScript | Electron + Vite + React | Electron | OS safeStorage | none in renderer | electron-builder | vite / electron-builder |
| cueai-api | Python | FastAPI, Celery | uvicorn | JSON store; Redis required for health; Postgres optional | Groq, Gemini, Qwen-VL optional | httpx, redis, celery | Docker / uvicorn |
| cueai-translation-service | TypeScript | Next route handler | Node (via web) | none | Groq | — | tsc |
| cueai-transcription-service | TypeScript | Next route handler | Node (via web) | none | Groq Whisper | — | tsc |
| cueai-shared-libraries | TypeScript | library | Node | none | — | mammoth, unpdf | tsc |
| cueai-resume-service | TypeScript | Next route handler | Node (via web) | none | Groq | shared extract | tsc |
| cueai-knowledge-service | TS + Python | Next handlers + RAG lib | Node / CPython | Qdrant optional | OpenAI/Gemini/local embeddings | Qdrant | tsc / pytest |
| cueai-screen-context-service | TS + Python | Next handler + Celery copy | Node / CPython | none | Gemini / Qwen-VL | FastAPI screen | tsc |
| cueai-gateway | TypeScript | helper | Node (via web) | none | — | fetch | tsc |
| cueai-notification-service | TypeScript | Next handler | Node (via web) | JSON store via web | — | — | tsc |
| cueai-export-service | TypeScript | library | Browser/Node | none | — | none | tsc |
| CueAI monorepo | mixed | npm workspaces | Node | — | — | playwright, electron-builder | npm |

---

## Table 6: Repository integrations and dependencies

| Source Repository | Target Repository/Service | Integration Type | Purpose | Configuration Location | Verified Status |
|---|---|---|---|---|---|
| cueai-web | cueai-ai-orchestrator | `file:` import | Groq/Gemini/BYOK | package.json | verified |
| cueai-web | cueai-knowledge-service | `file:` import + re-export routes | RAG + KB APIs | `src/app/api/admin/knowledge`, `meetings/knowledge` | verified |
| cueai-web | cueai-transcription-service | `file:` re-export | STT | `/api/transcribe` | verified |
| cueai-web | cueai-translation-service | `file:` re-export | Translate | `/api/translate` | verified |
| cueai-web | cueai-resume-service | `file:` re-export | Resume | `/api/resume/*` | verified |
| cueai-web | cueai-screen-context-service | `file:` re-export | Screen | `/api/live/screen` | verified |
| cueai-web | cueai-notification-service | `file:` re-export | Notifications | `/api/notifications` | verified |
| cueai-web | cueai-export-service | `file:` import | DOCX export | `src/lib/exportDocument.ts` | verified |
| cueai-web | cueai-shared-libraries | `file:` import | extract/roles | package.json | verified |
| cueai-web | cueai-gateway | `file:` import | Optional FastAPI proxy | `CUEAI_USE_FASTAPI` | verified (off unless env) |
| cueai-web | cueai-api | HTTP | Live answer / jobs / optional auth proxy | `CUEAI_API_URL` | verified (falls back if down) |
| cueai-web | Groq API | HTTPS | Primary LLM + STT | `GROQ_API_KEY` | verified live 2026-10-10 |
| cueai-web | Gemini API | HTTPS | Fallback LLM | `GEMINI_API_KEY` | verified live fallback |
| cueai-web | Stripe | HTTPS | Billing | `STRIPE_*` | code verified; live checkout needs price IDs |
| cueai-web | Google OAuth | HTTPS | NextAuth | `AUTH_GOOGLE_ID/SECRET` | code verified |
| cueai-web | Keygate | HTTPS | Licensing | `KEYGATE_*` | code present; needs env |
| cueai-web | Qdrant | HTTP | Vectors | `QDRANT_URL` | code present; optional |
| cueai-desktop | cueai-web | HTTP | Answers, STT, briefing, license | `127.0.0.1:3000` / `:3002` | verified |
| cueai-api | Groq / Gemini | HTTPS | Live answers | env | verified unit + live |
| cueai-api | Redis | Redis | Health + Celery | `REDIS_URL` | health tests exist |
| cueai-infra | cueai-web + cueai-api | Compose | Production topology | docker-compose.yml | config verified; image build not run |
| cueai-api knowledge module | Qdrant | library | Not HTTP-mounted | rag.py | implemented but unused as route |

---

## Table 7: Dummy data and incomplete functionality

| Repository | File Path | Finding | Category | Production Impact | Recommended Action | Verification Status |
|---|---|---|---|---|---|---|
| cueai-web | `src/lib/mock-data.ts` | Landing pricing/FAQ copy | marketing | None (not workspace data) | Keep | verified |
| cueai-web | `src/lib/server/db.ts` | `meetings: []` initial store | honest empty state | None | Keep | verified |
| cueai-web | `src/lib/auth-mode.ts` | `tester@cueai.local` bypass | dev-only; refused in production | None if `CUEAI_ENV=production` | Keep gated | verified |
| cueai-web | `src/app/api/admin/purge-synthetic/route.ts` | Admin purge of synthetic rows | cleanup tool | Destructive if used | Keep admin-only | verified |
| cueai-knowledge-service | `fixtures/test_knowledge/**` | Sample PDFs | test fixture | Not loaded as default KB | Keep in tests | verified |
| cueai-api | `tests/*` FakeClient | Mock providers | test fixture | None | Keep | verified |
| cueai-api | `app/modules/knowledge` | RAG not in `include_router` | incomplete HTTP | FastAPI does not serve KB HTTP | Use Next knowledge-service | verified |
| cueai-api | Postgres/Alembic | Business migration deferred (README) | incomplete | Default uses JSON store | Leave until cutover | verified |
| cueai-web | Forgot-password page | UI exists; delivery needs email env | incomplete without SMTP/Resend | Invite email may show `emailDelivery.ok=false` | Configure RESEND/SMTP | verified from .env.example comments |
| cueai-infra | Keycloak realm | Optional; product auth is HMAC/NextAuth | optional | Not required for current login | Do not treat as primary IdP | verified |
| CueAI monorepo | `android/` | Capacitor overlay | unverified on-device | Not the Windows companion path | Separate track | unverified |
| All repos | `.env` / `.env.local` | Real keys locally | gitignored | Fine if not committed | Rotate chat-pasted keys | verified not in git |

---

## Table 8: Security and configuration

| Repository | Configuration/File | Environment Variable Names | Security Considerations | Missing Configuration | Recommended Action |
|---|---|---|---|---|---|
| cueai-web | `.env.example` | `AUTH_SECRET`, `CUEAI_ENV`, `BOOTSTRAP_ADMIN_*`, `CUEAI_SECRET_ENCRYPTION_KEY`, `CUEAI_USE_FASTAPI`, `CUEAI_API_URL`, `CUEAI_LIVE_ANSWER_LOCAL`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `NGROK_AUTHTOKEN`, `NEXT_PUBLIC_SKIP_AUTH`, `NEXT_PUBLIC_AUTH_BYPASS`, `GEMINI_API_KEY`, `VERTEX_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_STT_MODEL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SMTP_*`, `LICENSE_SIGNING_*`, `KEYGATE_*`, `STRIPE_*`, `RAG_*`, `QDRANT_*`, `CUEAI_DATA_DIR` | Never `NEXT_PUBLIC_` for provider keys; Google secret server-only | Stripe price IDs / Keygate / email empty until configured | Fill gitignored `.env.local`; rotate leaked keys |
| cueai-api | `.env.example` | `CUEAI_ENV`, `API_HOST`, `API_PORT`, `AUTH_SECRET`, `CORS_ORIGINS`, `REDIS_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL`, `KEYGATE_*` | Same HMAC secret as web | Redis required for `/v1/health` ok | Start Redis for compose/health |
| cueai-infra | `.env.example` | `AUTH_SECRET`, `REDIS_URL`, `CUEAI_ENV`, `CUEAI_BOOTSTRAP_ADMIN_ENABLED`, `WEB_PORT`, `API_PORT`, `QDRANT_*`, `AUTH_GOOGLE_*`, `GEMINI_*`, `GROQ_*`, `OPENAI_API_KEY`, `RAG_*` | Compose injects keys into api/web only | Production secrets in gitignored `.env` | Do not commit `.env` |
| cueai-ai-orchestrator | `.env.example` | `GROQ_API_KEY`, `GROQ_MODEL` | Keys used when imported by web process | — | Keep server-side |
| cueai-knowledge-service | `.env.example` | `QDRANT_URL`, `QDRANT_COLLECTION`, `QDRANT_API_KEY`, `GROQ_API_KEY`, `GROQ_MODEL` | Workspace filter in retrieve | Qdrant optional | Enable for semantic RAG |
| cueai-gateway | `.env.example` | `CUEAI_API_URL` | Proxy only when `CUEAI_USE_FASTAPI=1` | — | Leave off unless migrating |
| cueai-desktop | no `.env.example` in repo | Vite `VITE_SPEECH_*` optional | Must not embed Groq/Gemini keys | — | Keep calling Next |

---

## Table 9: Testing and build status

| Repository | Test Command | Build Command | Type Check | Test Result | Build Result | Known Issues |
|---|---|---|---|---|---|---|
| cueai-web | `npm run test:oauth` | `npm run build` (`next build --webpack`) | `npx tsc --noEmit` | **10 passed** (2026-10-10) | **not run** | Full production build not executed this session |
| cueai-web | `npm run test:billing` | same | same | **not run this session** | — | available |
| cueai-api | `pytest tests/test_live_answer.py tests/test_health.py tests/test_live_auth.py` | Docker images | — | **29 passed** | **not run** | Full celery/postgres suite needs extra deps |
| cueai-desktop | none in package | electron-builder yml | none run | **not run** | **not run** | macOS packaging not run on Windows |
| cueai-ai-orchestrator | none dedicated | — | via web tsc | covered by web import | — | — |
| cueai-knowledge-service | `tests/rag/*` | — | — | **not run this session** | — | fixtures present |
| cueai-infra | compose healthchecks | `docker compose up --build` | — | **not run** | **not run** | — |
| others | none | — | — | **not run** | — | library packages |
| CueAI monorepo | `npm run test:e2e` | `npm run build:desktop` | — | **not run** | **not run** | Playwright |

---

## Table 10: Git and synchronization status

Verified 2026-10-10: `git rev-parse HEAD` equals `origin/<branch>` after fetch/push.

| Repository | Current Branch | Latest Commit | Working Tree | Bitbucket Remote | Bitbucket Push Status | GitHub Remote | GitHub Push Status |
|---|---|---|---|---|---|---|---|
| cueai-docs | main | `b7aecaada4dcd38ed545efb2b65aab5342f26014` | clean | wayfinderops/cueai-docs | **synced** | none | n/a — no remote |
| cueai-ai-orchestrator | main | `2a9b49526a7e099c235237ec0ca25748db9db29d` | clean | wayfinderops/cueai-ai-orchestrator | **synced** | none | n/a |
| cueai-infra | main | `586069add4f4ba13ce597383c648d43c72d5b804` | clean | wayfinderops/cueai-infra | **synced** | none | n/a |
| cueai-web | main | `5bd40979517bc85d1e1a11ca3a88e483116018d8` | clean | wayfinderops/cueai-web | **synced** | none | n/a |
| cueai-desktop | main | `01c360656f9771632cfd739396c45b05e0999c44` | clean | wayfinderops/cueai-desktop | **synced** | none | n/a |
| cueai-api | main | `d00e978bc7508d803c8a8443ec8d4758bd8b08b8` | untracked `.data/` only | wayfinderops/cueai-api | **synced** | none | n/a |
| cueai-translation-service | main | `350828a09d850fa80066f6c80af7c6b2cbb92f64` | clean | wayfinderops/cueai-translation-service | unchanged / already on origin | none | n/a |
| cueai-transcription-service | main | `87f5f4cbfad387498423c983ef6b73adb4a09a07` | clean | wayfinderops/cueai-transcription-service | unchanged | none | n/a |
| cueai-shared-libraries | main | `7bd612a6442aa9658fc103a135aff5fd383f2aaa` | clean | wayfinderops/cueai-shared-libraries | unchanged | none | n/a |
| cueai-resume-service | main | `58064c983a5652617de64e496f27edafba6e3da6` | clean | wayfinderops/cueai-resume-service | unchanged | none | n/a |
| cueai-knowledge-service | main | `d2c369555d5d36b8c74dafc01ecd929e4bccae4b` | clean | wayfinderops/cueai-knowledge-service | unchanged | none | n/a |
| cueai-screen-context-service | main | `517f626bf3c3da2c0961a997c88b066eb1d80da6` | clean | wayfinderops/cueai-screen-context-service | unchanged | none | n/a |
| cueai-gateway | main | `ede95283390ce811995f8bc264f4570b4bb1338c` | clean | wayfinderops/cueai-gateway | unchanged | none | n/a |
| cueai-notification-service | main | `70ee1781eabe1f90b18d3227b4f6453942a5fa52` | clean | wayfinderops/cueai-notification-service | unchanged | none | n/a |
| cueai-export-service | main | `fa0002345d638e61cd7822e8ad7063ae59fc5ed9` | clean | wayfinderops/cueai-export-service | unchanged | none | n/a |
| CueAI monorepo | separation | `c403df503c616a18ba72223d6ebb01ce8274b9b4` | clean | **none** | n/a — do not invent | github.com/indrakiran7b/CueAI.git | **synced** |

---

## Table 11: Manager summary

| Area | Current Implementation | Completed Features | Pending Features | Risks/Issues | Next Action |
|---|---|---|---|---|---|
| Web | Next 16 BFF + JSON store | Login, Google, dashboard, meetings, KB UI, settings, admin, billing routes | Production `next build` not re-run; Stripe prices may be unset | Auth bypass if someone sets flags in prod (startup refuses) | Keep `CUEAI_ENV=production` in deploy |
| Desktop | Electron Win/Mac + `apps/desktop` launcher | Overlay stream, health poll, device headers, Google handoff code | macOS Allow→dashboard not executed here | Companion needs Next running | `npm run dev:web` + `dev:desktop` |
| Backend | FastAPI `/v1` | Live answer, auth, license mirror, jobs | Knowledge HTTP not mounted; Postgres deferred | `/v1/health` degraded without Redis | Optional for local if `CUEAI_LIVE_ANSWER_LOCAL=1` |
| AI orchestration | Groq primary, Gemini fallback | Interview prompt, timeouts, stream-safe fallback | — | Keys must stay server-side | Rotate keys pasted in chat |
| Knowledge / RAG | Next + knowledge-service | Workspace isolation, `needsLiveKnowledge` | Semantic RAG needs Qdrant + embedding key | Keyword retrieve works without Qdrant | Enable Qdrant for semantic |
| Transcription | Groq Whisper via web route | Desktop audio upload | — | Needs `GROQ_API_KEY` | — |
| Translation | Groq via web route | User + admin translate | — | Same key | — |
| Resume | Extract + analyze | Session-gated | — | Groq required | — |
| Screen context | Next → FastAPI screen or Gemini | Auth required | Qwen-VL sidecar optional | FastAPI needed for Celery path | Start api or use Gemini |
| Infrastructure | Compose + Keycloak file | Healthchecks defined | Compose build not run | Keycloak is not current login | Deploy compose for prod-like |
| Security | HMAC cookie, device headers, Stripe sig, no keys in renderer | Production refuses skip-auth | Email/Keygate/Stripe optional env | Chat-exposed API keys | Rotate Groq/Gemini |
| Deployment | Dockerfiles exist; no K8s/CI workflows found | Images defined | No GitHub Actions in tree | Manual deploys | Add CI if required |

---

## Counts

| Metric | Value |
|---|---|
| Repositories inspected | **16** (15 Bitbucket + 1 GitHub monorepo) |
| Tracked files in the 15 Bitbucket repos | **668** |
| Tracked files in GitHub monorepo | **1088** (includes mirrors + android assets) |
| Relevant source/config rows inventoried above | **~220 explicit rows**; remaining public/android bitmaps grouped |
| HTTP endpoints extracted from route files | **70+** (web + api) |
| Incomplete / dummy (non-test) | FastAPI knowledge HTTP unused; Postgres deferred; email/Stripe/Keygate env-dependent; Android unverified |
| Tests run | cueai-api 29 passed; cueai-web tsc + 10 oauth passed |
| Builds not run | `next build`, Docker, Electron package |
| GitHub missing on | all 15 `cueai-*` Bitbucket repos |
| Bitbucket missing on | workspace root monorepo |
