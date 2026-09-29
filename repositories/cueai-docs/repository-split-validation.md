# CueAI repository split — validation (Phase 4)

**Date:** 2026-03-29  
**Monorepo root:** `cueai-android`  
**Bitbucket mirrors:** `repositories/cueai-*`

---

## 1. Summary

| Phase | Status |
|-------|--------|
| Phase 1 — Analysis | **Done** — `docs/repository-split-analysis.md` |
| Phase 2 — Plan | **Done** — `docs/repository-split-plan.md` |
| Phase 4 — File organization | **Partial** — mirrors under `repositories/`; **canonical dev paths remain `apps/*`** until Bitbucket cutover |
| Path/import rewiring in `apps/*` | **Not applied** (avoids breaking local dev in one step) |
| Independent per-repo build | **Not validated** (requires npm/pip install per repo + import cutover) |

---

## 2. Files moved / copied

### Full application mirrors (robocopy)

| Source | Target | Method |
|--------|--------|--------|
| `apps/web/` | `repositories/cueai-web/` | Copy (excl. `.next`, `node_modules`, `.data*`) |
| `apps/api/` | `repositories/cueai-api/` | Copy (excl. `.venv`, `__pycache__`) |
| `apps/desktop/` | `repositories/cueai-desktop/` | Copy (excl. `node_modules`, `dist*`) |
| `docs/` | `repositories/cueai-docs/` | Copy |
| `docker-compose.yml` | `repositories/cueai-infra/docker-compose.yml` | Copy + **path update** (`context: ../cueai-api`) |
| `keycloak/` | `repositories/cueai-infra/keycloak/` | Copy |
| `tools/qwen-vl/` | `repositories/cueai-screen-context-service/tools/qwen-vl/` | Copy |
| `llm-benchmark/` | `repositories/cueai-ai-orchestrator/llm-benchmark/` | Copy |
| `test_knowledge/` | `repositories/cueai-knowledge-service/fixtures/test_knowledge/` | Copy |
| `tests/rag/` | `repositories/cueai-knowledge-service/tests/rag/` | Copy |

### Scripts

| Source | Target |
|--------|--------|
| `scripts/prepare-cloud-deploy.cjs`, `prepare-client-handoff.cjs`, `client-env.example` | `repositories/cueai-infra/scripts/` |
| `scripts/dev-windows.cjs`, `dev-mac.cjs`, `prepare-desktop-web.cjs`, `assert-macos-packaging.cjs`, `generate-mac-icon.mjs`, `e2e-desktop-bridge.mjs`, `launch-client-desktop.ps1` | `repositories/cueai-desktop/scripts/` |
| `scripts/run-celery-worker.cjs`, `verify-celery-task.cjs`, `test-api.cjs`, `generate-license-keys.mjs`, `generate-license.mjs` | `repositories/cueai-api/scripts/` |

### Service extractions (ownership copies)

| Source | Target |
|--------|--------|
| `apps/desktop/shared/licensing/*` | `repositories/cueai-shared-libraries/src/licensing/` |
| `apps/desktop/shared/poll-job.ts` | `repositories/cueai-shared-libraries/src/poll-job.ts` |
| `apps/web/src/lib/roles.ts` | `repositories/cueai-shared-libraries/src/roles.ts` |
| `apps/web/src/lib/server/rag/types.ts` | `repositories/cueai-shared-libraries/src/rag-types.ts` |
| `email.ts`, `api/notifications/route.ts` | `cueai-notification-service/src/` |
| `translate.ts`, `translate-request.ts`, translate API routes | `cueai-translation-service/src/` |
| `exportDocument.ts` | `cueai-export-service/src/` |
| `applyResumeRewrites.ts`, resume API routes | `cueai-resume-service/src/` |
| `lib/server/rag/*` | `cueai-knowledge-service/src/rag/` |
| `apps/api/.../knowledge/*` | `cueai-knowledge-service/python/app/modules/knowledge/` |
| `screen-context.ts`, `qwen-vl.ts`, `live/screen/route.ts`, screen Python + `vision.py` | `cueai-screen-context-service/` |
| `api/transcribe/route.ts` | `cueai-transcription-service/src/routes/` |
| `gemini.ts`, `groq.ts`, `llm-generate.ts`, `ai-config.ts`, `credential-resolver.ts`, live Python orchestration | `cueai-ai-orchestrator/` |
| `fastapi-proxy.ts` | `cueai-gateway/src/` (identical copy) |

---

## 3. Files unchanged (canonical monorepo)

- `apps/web/**`, `apps/api/**`, `apps/desktop/**` — **still the active workspace targets** in root `package.json`
- Root `docker-compose.yml` — still references `./apps/api`
- Root `scripts/**` — unchanged
- `apps/journiq/**` — not moved (manual review)

---

## 4. Path references updated

| File | Change |
|------|--------|
| `repositories/cueai-infra/docker-compose.yml` | `build.context: ../cueai-api` (was `./apps/api`) |

**Not updated (cutover pending):**

- Root `package.json` workspaces
- `scripts/prepare-desktop-web.cjs` paths
- `repositories/cueai-desktop/scripts/*` internal paths still assume monorepo root layout
- Cross-imports between `repositories/cueai-web` and service repos

---

## 5. Imports updated

**None** in `apps/*`. Service repos contain **copies**; monolith imports unchanged.

---

## 6. Configuration updates

| Repo | Added |
|------|--------|
| `cueai-shared-libraries` | Minimal `package.json` |
| `cueai-infra` | Updated `docker-compose.yml` for sibling `cueai-api` context |
| All `cueai-*` | `README.md` stubs where applicable |

---

## 7. Build validation

| Command | Repo | Result |
|---------|------|--------|
| `npm run build -w @cueai/web` | monorepo `apps/web` | **Not re-run this session** — expect pass if unchanged |
| `npm run build` | `repositories/cueai-web` | **Skipped** — no workspace link; needs `npm install` in mirror |
| `pytest` | `repositories/cueai-api` | **Skipped** — venv not copied |
| `docker compose build` | `repositories/cueai-infra` | **Skipped** — requires sibling layout |

---

## 8. Test validation

| Suite | Location | Notes |
|-------|----------|--------|
| Playwright | `tests/web/e2e` | Stays at monorepo root; targets `apps/web` |
| RAG | `tests/rag` | Copied to `cueai-knowledge-service/tests/rag` |
| API pytest | `apps/api/tests` | Copied inside `repositories/cueai-api/tests` |

---

## 9. Unresolved issues

1. **Dual copies** — `apps/*` and `repositories/cueai-*` can drift until cutover uses `git mv` and deletes monolith paths.
2. **Microservices not HTTP-isolated** — extracted TS/Python still depends on `@/lib/server/*` and `app.modules.*` paths in the monolith.
3. **cueai-gateway** — no runnable gateway; only `fastapi-proxy.ts` reference copy.
4. **cueai-export-service** — single module; export UX still in web components.
5. **Celery worker** — `Dockerfile.worker` remains in `cueai-api`; vision task ownership shared with screen-context.
6. **FastAPI live router** — still imports screen + answer modules in one router file in `cueai-api` mirror.

---

## 10. Ambiguous / manual review

| Item | Action |
|------|--------|
| `apps/journiq/**` | Exclude from CueAI Bitbucket set or separate product repo |
| `apps/web/src/lib/server/db.ts` | Core store — stays with **cueai-api** on cutover |
| `extract-document.ts` | Shared by resume + knowledge — **shared-libraries** or duplicate import |
| `poll-job.ts` (web vs desktop) | Consolidate in **cueai-shared-libraries** |
| Root `package.json` | Meta-repo vs retire after Bitbucket migration |
| Android | Not present in tree |

---

## 11. Potential circular dependencies (after full cutover)

- **cueai-web** must not import service repos that import **cueai-web** server code.
- **cueai-api** `live/router.py` must depend on orchestrator + screen packages via one-way imports or HTTP.

---

## 12. Final mapping table

| SOURCE PATH | TARGET REPOSITORY | REASON | PATH CHANGES REQUIRED |
|-------------|-------------------|--------|------------------------|
| `docs/**` | cueai-docs | Documentation | None in docs |
| `docker-compose.yml` | cueai-infra | Local infra stack | Celery build context → `../cueai-api` |
| `keycloak/**` | cueai-infra | IdP config | Volume mount relative paths |
| `apps/web/**` | cueai-web | Web UI + BFF | Workspace root; service imports on cutover |
| `apps/desktop/**` | cueai-desktop | Electron clients | Script paths to cueai-web build |
| `apps/api/**` | cueai-api | FastAPI core | Python package layout when modules extracted |
| `apps/desktop/shared/**` | cueai-shared-libraries | Cross-client licensing/utilities | Desktop/tsconfig paths → npm package |
| `apps/web/src/lib/server/email.ts` | cueai-notification-service | Email notifications | Web route re-export or HTTP |
| `apps/web/src/app/api/notifications/**` | cueai-notification-service | Notifications API | Thin BFF in web |
| `apps/web/src/lib/server/translate*.ts` | cueai-translation-service | Translation | Same |
| `apps/web/src/app/api/translate/**` | cueai-translation-service | User translation API | Same |
| `apps/web/src/app/api/admin/translate/**` | cueai-translation-service | Admin translation API | Same |
| `apps/web/src/lib/exportDocument.ts` | cueai-export-service | Document export | UI stays in web |
| `apps/web/src/app/api/resume/**` | cueai-resume-service | Resume analyze/extract | Resume UI in web |
| `apps/web/src/lib/applyResumeRewrites.ts` | cueai-resume-service | Resume rewrite logic | Import path |
| `apps/web/src/lib/server/rag/**` | cueai-knowledge-service | RAG pipeline (TS) | Admin/knowledge routes |
| `apps/api/app/modules/knowledge/**` | cueai-knowledge-service | RAG pipeline (Py) | FastAPI imports |
| `test_knowledge/**`, `tests/rag/**` | cueai-knowledge-service | Fixtures/tests | CI paths |
| `apps/web/src/lib/server/screen-context.ts` | cueai-screen-context-service | Screen analysis (TS) | Live screen route |
| `apps/web/src/app/api/live/screen/**` | cueai-screen-context-service | Screen API | Proxy to FastAPI/Celery |
| `apps/api/app/modules/live/screen_*.py` | cueai-screen-context-service | Screen analysis (Py) | Router imports |
| `apps/api/app/tasks/vision.py` | cueai-screen-context-service | Celery vision task | Worker image |
| `tools/qwen-vl/**` | cueai-screen-context-service | Vision sidecar | npm `dev:vision` script ownership |
| `apps/web/src/app/api/transcribe/**` | cueai-transcription-service | Whisper transcription | groq.ts split TBD |
| `apps/web/src/lib/server/gemini.ts` etc. | cueai-ai-orchestrator | LLM providers | Many web routes |
| `apps/api/app/modules/live/answer_*.py` etc. | cueai-ai-orchestrator | Live answer orchestration | live/router.py |
| `llm-benchmark/**` | cueai-ai-orchestrator | Provider benchmarking | None |
| `apps/web/src/lib/server/fastapi-proxy.ts` | cueai-gateway (future) | BFF → API routing | Optional stay in web |
| `scripts/prepare-cloud-deploy.cjs` | cueai-infra | Deploy bundle | Path to web/desktop artifacts |
| `scripts/dev-*.cjs` | cueai-desktop | Desktop dev | Paths to cueai-web |
| `scripts/run-celery-worker.cjs` | cueai-api | Worker ops | API root path |
| `playwright.config.ts`, `tests/web/e2e/**` | cueai-web | UI E2E | Base URL config |
| `apps/journiq/**` | **REVIEW** | Non-CueAI demo | N/A |

---

## 13. Recommended next steps (no logic changes)

1. Push each `repositories/cueai-*` folder to its Bitbucket remote (subtree split or fresh repo init).
2. Replace monorepo `apps/*` with submodule pointers **or** single cutover `git mv` + update root `package.json` workspaces to `repositories/cueai-web`, etc.
3. Introduce `@cueai/shared-libraries` as `file:` dependency; change desktop/web imports only.
4. Add thin `route.ts` re-exports in web for extracted services.
5. Split FastAPI `live/router.py` by mounting sub-routers from installed packages (path-only).
6. Run full validation matrix: `npm run build`, `pytest`, `docker compose build`, Playwright.

---

## 14. Copy in cueai-docs

This file is also referenced from `repositories/cueai-docs/` after sync. Canonical path: **`docs/repository-split-validation.md`**.
