# CueAI monorepo — repository split analysis (Phase 1)

**Repository inspected:** `https://github.com/indrakiran7b/CueAI.git` (local workspace: `cueai-android`)  
**Date:** 2026-03-29  
**Scope:** Analysis only — no behavioral changes implied by this document.

---

## 1. Top-level directories (existing)

| Path | Role |
|------|------|
| `apps/web/` | Next.js 16 — user/admin UI + **primary HTTP API** (`src/app/api/*`) + server logic (`src/lib/server/*`) |
| `apps/api/` | FastAPI — **partial** backend migration (auth, workspace, live, knowledge pipeline, jobs, Celery) |
| `apps/desktop/windows/` | Electron + Vite — Windows desktop & companion overlay |
| `apps/desktop/macos/` | Electron + Vite — macOS desktop & companion overlay |
| `apps/desktop/shared/` | Desktop licensing client, device ID, poll-job, workspace-env |
| `apps/desktop/build-resources/` | Packaged web standalone artifacts for desktop builds |
| `apps/journiq/` | Separate Vite/React demo app (**not** CueAI product) |
| `docs/` | Architecture, billing, license, RAG, migration notes |
| `scripts/` | Dev orchestration (Windows/Mac desktop), deploy bundles, license CLI, RAG E2E probes |
| `tests/` | Playwright E2E, RAG (Node + Python), billing, licenses, BYOK |
| `tools/qwen-vl/` | Local Python HTTP sidecar (Qwen-VL vision) |
| `keycloak/` | Keycloak realm import JSON |
| `llm-benchmark/` | Offline LLM benchmark tooling |
| `test_knowledge/` | PDF/CSV fixtures for RAG manual testing |
| `node_modules/` | npm install root (workspaces) |
| `.github/` | (if present) CI — not fully enumerated in this pass |

**Not present as top-level:** `packages/`, `deploy/`, `android/`, Terraform/OpenTofu, Kubernetes manifests, Helm charts.

---

## 2. Important root files

| File | Role |
|------|------|
| `package.json` | npm workspaces: `@cueai/web`, `@cueai/desktop`, `@cueai/desktop-mac`; root scripts |
| `docker-compose.yml` | Postgres, Redis, Celery worker, Qdrant, Keycloak |
| `.env.example` | Root env template |
| `playwright.config.ts` | E2E against web |
| `.gitignore` | Ignore rules |

---

## 3. Target repository responsibility mapping

| Target repo | Current primary location | Maturity |
|-------------|-------------------------|----------|
| **cueai-docs** | `docs/`, parts of `apps/*/README.md`, migration docs | Ready to extract |
| **cueai-infra** | `docker-compose.yml`, `keycloak/`, deploy scripts in `scripts/prepare-*` | Partial (no Terraform/K8s in tree) |
| **cueai-shared-libraries** | `apps/desktop/shared/`, shared TS types/utilities used by web+desktop | Partial |
| **cueai-notification-service** | `apps/web/src/lib/server/email.ts`, `apps/web/src/app/api/notifications/` | Logic in monolith |
| **cueai-translation-service** | `apps/web/src/app/api/translate/`, `admin/translate/`, `lib/server/translate*.ts`, FastAPI `live/access.py` (policies) | Logic in monolith |
| **cueai-export-service** | `apps/web/src/lib/exportDocument.ts`, document export in resume/knowledge UI flows | Thin / coupled to web |
| **cueai-resume-service** | `apps/web/src/app/api/resume/*`, `lib/applyResumeRewrites.ts`, resume-tailor UI routes | Logic in monolith |
| **cueai-knowledge-service** | `apps/web/src/app/api/admin/knowledge/*`, `meetings/knowledge`, `lib/server/rag/*`, `apps/api/app/modules/knowledge/*`, `tests/rag/` | Split across web + API |
| **cueai-screen-context-service** | `apps/web/src/app/api/live/screen`, `lib/server/screen-context.ts`, `lib/server/qwen-vl.ts`, `apps/api` live screen + `tasks/vision.py`, `tools/qwen-vl/` | Split across web + API + tools |
| **cueai-transcription-service** | `apps/web/src/app/api/transcribe/`, Groq paths in `lib/server/groq.ts` | Logic in monolith |
| **cueai-ai-orchestrator** | `lib/server/{gemini,groq,llm-generate,ai-config,credential-resolver}.ts`, `apps/api/app/modules/live/{answer_service,providers,gemini,prompts}.py`, `llm-benchmark/` | Split across web + API |
| **cueai-gateway** | **No dedicated gateway service today** — routing is Next.js middleware + `lib/server/fastapi-proxy.ts` | **Not implemented** |
| **cueai-api** | FastAPI core + JSON persistence; Next.js routes for auth, meetings, billing, license, devices, admin | Dual runtime |
| **cueai-desktop** | `apps/desktop/*`, root `scripts/dev-*.cjs`, `prepare-desktop-web.cjs`, electron-builder configs | Ready to extract |
| **cueai-web** | `apps/web` UI + most `app/api` BFF routes | Primary app surface |

---

## 4. Directory-by-directory proposed destination

| Source path | Target repository | Notes |
|-------------|-------------------|--------|
| `docs/**` | **cueai-docs** | Include `docs/architecture/BACKEND-MIGRATION.md`, `docs/knowledge/RAG.md`, etc. |
| `docker-compose.yml` | **cueai-infra** | Update COPY paths to `../cueai-api` after split |
| `keycloak/**` | **cueai-infra** | IdP config |
| `scripts/prepare-cloud-deploy.cjs`, `prepare-client-handoff.cjs`, `client-env.example` | **cueai-infra** | Deployment packaging |
| `scripts/dev-windows.cjs`, `dev-mac.cjs`, `prepare-desktop-web.cjs`, `assert-macos-packaging.cjs`, `generate-mac-icon.mjs`, `e2e-desktop-bridge.mjs` | **cueai-desktop** | Desktop dev/dist |
| `scripts/generate-license*.mjs`, `start-remote-licensing.cjs` | **cueai-api** or **cueai-infra** | License ops — **ambiguous** (see §11) |
| `scripts/run-celery-worker.cjs`, `verify-celery-task.cjs`, `test-api.cjs` | **cueai-api** | API/worker ops |
| `scripts/*rag*`, `probe_*`, `e2e_*knowledge*` | **cueai-knowledge-service** | RAG verification |
| `apps/desktop/**` | **cueai-desktop** | Windows + macOS + shared + build-resources |
| `apps/web/**` | **cueai-web** (UI + BFF) | Service logic files **also** owned by service repos (relocated under `repositories/`) |
| `apps/api/**` | Split per module (see plan) | Monolithic FastAPI today |
| `tools/qwen-vl/**` | **cueai-screen-context-service** (sidecar) + orchestrator deps | Sidecar process |
| `llm-benchmark/**` | **cueai-ai-orchestrator** | Benchmark only |
| `tests/web/e2e/**` | **cueai-web** | UI E2E |
| `tests/rag/**`, `tests/rag/*.py` | **cueai-knowledge-service** | RAG tests |
| `tests/licenses/**`, `tests/billing/**`, `tests/byok/**` | **cueai-api** / **cueai-web** | Cross-cutting — split by subject |
| `test_knowledge/**` | **cueai-knowledge-service** | Fixtures |
| `apps/journiq/**` | **Q — REVIEW** | Unrelated product demo |
| `playwright.config.ts` | **cueai-web** | E2E entry |
| Root `package.json` | **Q — REVIEW** | Becomes meta-orchestrator or deprecated after Bitbucket split |

---

## 5. Dependency relationships (after split)

```
cueai-web ──────────────┬──► cueai-api (HTTP /v1/* via fastapi-proxy)
                        ├──► cueai-shared-libraries (npm package)
                        └──► (future) cueai-*-service HTTP endpoints

cueai-desktop ──────────┬──► cueai-web (embedded or remote URL)
                        └──► cueai-shared-libraries (licensing client)

cueai-api ──────────────┬──► Redis, Postgres (infra)
                        ├──► Celery worker (same repo or worker image)
                        └──► (internal imports today) knowledge/live modules

cueai-gateway ──────────► **future** — front door; today Next.js middleware + proxy

Service repos (resume, knowledge, …) ──► cueai-shared-libraries, cueai-ai-orchestrator (providers)
```

**Today:** Most “service” boundaries are **in-process** TypeScript/Python imports inside `apps/web` and `apps/api`, not separate deployables.

---

## 6. Cross-repository imports requiring path updates

| From | To | Example |
|------|-----|---------|
| `apps/web` API routes | `lib/server/*` | `@/lib/server/rag/*` → package or relative into `cueai-knowledge-service` |
| `apps/web` | `apps/desktop/shared` | Desktop licensing types — **cueai-shared-libraries** |
| `apps/api/app/main.py` | `app.modules.*` | Python package layout per repo (`pip install -e`) |
| Root `package.json` workspaces | `apps/web` | → `repositories/cueai-web` |
| `docker-compose.yml` | `context: ./apps/api` | → `./repositories/cueai-api` |
| `scripts/prepare-desktop-web.cjs` | `apps/web` paths | → `repositories/cueai-web` |
| Playwright | web base URL | unchanged behavior |
| Desktop `getWebOrigin()` | Next dev ports | unchanged |

---

## 7. Configuration files that must move

| File | Destination |
|------|-------------|
| `apps/web/package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` | **cueai-web** |
| `apps/web/.env.example` (if any) | **cueai-web** |
| `apps/api/requirements.txt`, `pytest.ini`, `.env.example`, `Dockerfile.worker` | **cueai-api** (+ worker references **screen-context** / Celery) |
| `apps/desktop/*/package.json`, `vite.config.ts`, `electron-builder*.yml` | **cueai-desktop** |
| `docker-compose.yml` | **cueai-infra** |
| `playwright.config.ts` | **cueai-web** |

---

## 8. Build / deployment artifacts

| Artifact | Owner |
|----------|--------|
| Next.js standalone / `prepare-desktop-web.cjs` output | **cueai-desktop** (consumes **cueai-web** build) |
| Electron `dist/` | **cueai-desktop** |
| FastAPI uvicorn / Celery worker image | **cueai-api** + **cueai-infra** compose |
| Qwen-VL sidecar | **cueai-screen-context-service** |

---

## 9. Scripts by repository

| Script | Repository |
|--------|------------|
| `dev-windows.cjs`, `dev-mac.cjs` | cueai-desktop |
| `prepare-desktop-web.cjs` | cueai-desktop |
| `prepare-cloud-deploy.cjs`, `prepare-client-handoff.cjs` | cueai-infra |
| `run-celery-worker.cjs`, `test-api.cjs` | cueai-api |
| `generate-license-keys.mjs`, `generate-license.mjs` | cueai-api (license module) |
| RAG / knowledge probe scripts | cueai-knowledge-service |
| `llm-benchmark/*` | cueai-ai-orchestrator |

---

## 10. Code that should live in cueai-shared-libraries

| Path | Consumers |
|------|-----------|
| `apps/desktop/shared/licensing/*` | desktop, web (license API types alignment) |
| `apps/desktop/shared/poll-job.ts` | desktop, web (`lib/poll-job.ts` duplicate today — **ambiguous merge**) |
| `apps/web/src/lib/roles.ts` | web, api auth roles mirror |
| `apps/web/src/lib/server/rag/types.ts` | web RAG, knowledge service |
| Session/auth **types** (not implementations) | web, api — **partial** |

Implementations of auth/session stay in **cueai-api** / **cueai-web** until gateway extraction.

---

## 11. Ambiguous files — manual review (do not auto-move)

| Path | Issue |
|------|--------|
| `apps/journiq/**` | Separate product; not in target 15-repo list |
| `apps/web/src/lib/server/db.ts`, `workspace-store.json` | Core API persistence — **cueai-api** vs **cueai-web** |
| `apps/web/src/lib/server/fastapi-proxy.ts` | Gateway concern vs web BFF |
| `apps/web/src/lib/server/extract-document.ts` | Resume + knowledge + meetings |
| `apps/web/src/lib/poll-job.ts` vs `apps/desktop/shared/poll-job.ts` | Duplicate implementations |
| `apps/web/src/lib/resume-store.ts` | UI state + API — resume vs web |
| `apps/api/app/modules/live/access.py` | Translation policy shared with translation-service + live |
| `apps/api/app/core/session.py` | Shared auth between api modules |
| Root `package.json` + unified npm workspaces | Meta-repo vs delete after Bitbucket push |
| `apps/(resume-tailor)` duplicate route groups | Product routing — web only |
| Android / mobile | **Not found** in tree — N/A |
| `client-handoff/` | Empty or generated — verify before move |

---

## 12. Potential circular dependencies after split

| Cycle | Risk | Mitigation |
|-------|------|------------|
| web ↔ shared-libraries ↔ desktop | Medium | shared-libraries must not import web |
| api ↔ knowledge-service | High if both import each other | knowledge-service exposes HTTP; api calls via client — **not present today** |
| ai-orchestrator ↔ screen-context | Medium | Sidecar HTTP already decouples qwen-vl |
| web BFF ↔ all services | High | BFF proxies must not re-import service internals circularly |

**Current monolith avoids cycles by shared `lib/server`**. Physical split requires **one-directional** dependencies: web → services → shared-libraries → orchestrator.

---

## 13. FastAPI module ownership (file-level)

| Module under `apps/api/app/` | Target repository |
|------------------------------|-------------------|
| `modules/auth/` | cueai-api |
| `modules/workspace/` | cueai-api |
| `modules/onboarding/` | cueai-api |
| `modules/entitlements/` | cueai-api |
| `modules/license/` | cueai-api |
| `modules/jobs/` | cueai-api (generic job status) + used by screen-context |
| `modules/knowledge/` | cueai-knowledge-service |
| `modules/live/answer_*`, `providers`, `gemini`, `prompts`, `context` | cueai-ai-orchestrator (+ live API surface in api) |
| `modules/live/screen_*`, `tasks/vision.py` | cueai-screen-context-service |
| `core/*`, `db/*`, `persistence/*`, `api/deps.py`, `main.py` | cueai-api |
| `services/keygate_service.py` | cueai-api |

---

## 14. Next.js API route ownership (summary)

| Route prefix | Target repository (implementation) | BFF stub may remain in cueai-web |
|--------------|-----------------------------------|----------------------------------|
| `/api/auth/*`, `/api/workspaces`, `/api/onboarding` | cueai-api (+ web until proxy complete) | yes |
| `/api/meetings/*` | cueai-api | yes |
| `/api/billing/*`, `/api/admin/billing` | cueai-api | yes |
| `/api/license/*` | cueai-api | yes |
| `/api/devices/*` | cueai-api | yes |
| `/api/admin/*` (except knowledge, translate) | cueai-api | yes |
| `/api/admin/knowledge/*`, `/api/meetings/knowledge` | cueai-knowledge-service | yes |
| `/api/resume/*` | cueai-resume-service | yes |
| `/api/transcribe` | cueai-transcription-service | yes |
| `/api/translate`, `/api/admin/translate` | cueai-transcription-service / translation-service | yes |
| `/api/live/answer`, `/api/jobs/*` | cueai-ai-orchestrator + cueai-api | yes |
| `/api/live/screen` | cueai-screen-context-service | yes |
| `/api/notifications` | cueai-notification-service | yes |
| `/api/settings/api-keys/*` | cueai-api (+ orchestrator for test) | yes |

---

## 15. Executive summary

The codebase is a **dual-runtime monolith**: Next.js owns most business logic; FastAPI owns an growing **strangler** subset. Fifteen Bitbucket repositories are **organizational targets**; many microservices do not yet exist as independent runtimes. Splitting is primarily **moving trees** into `repositories/*`, extracting `lib/server` and `app/modules` slices into installable packages, and updating **paths only**. A dedicated **cueai-gateway** and **cueai-export-service** are largely **documentation placeholders** until explicit HTTP services are introduced.

**Recommended order:** docs → infra → shared-libraries → desktop + web shells → api → extract knowledge/screen/resume/translation/transcription/notification → orchestrator tools → validation.
