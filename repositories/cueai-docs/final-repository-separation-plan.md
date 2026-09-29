# Final CueAI repository separation plan

**Source of truth:** `apps/*` (active workspaces in root `package.json`)  
**Target layout:** `repositories/cueai-*` (15 Bitbucket repos)  
**Rule:** Move existing implementations; update paths/imports/config only.

---

## Extraction map (summary)

| SOURCE PATH | TARGET REPOSITORY | REASON | DEPENDENCIES | PATH CHANGES |
|-------------|-------------------|--------|--------------|--------------|
| `apps/web/**` (UI, BFF shell) | cueai-web | Next.js product surface | `@cueai/*` packages, shared-libraries | `@/*` stays in web; routes re-export services |
| `apps/api/**` (core modules) | cueai-api | FastAPI auth/workspace/license/jobs | Redis, Postgres, sibling Python packages | `app.modules.knowledge/live` → package imports |
| `apps/desktop/**` | cueai-desktop | Electron Windows/macOS | shared-libraries, cueai-web build | `shared/` → `@cueai/shared-libraries` |
| `docs/**`, split docs | cueai-docs | Documentation | — | Historical `apps/` refs noted in README |
| `docker-compose.yml`, `keycloak/`, deploy scripts | cueai-infra | Local/cloud deploy glue | cueai-api image | `context: ../cueai-api` |
| `apps/desktop/shared/licensing/**` | cueai-shared-libraries | Desktop + web license alignment | — | Desktop imports package |
| `apps/web/src/lib/roles.ts` | cueai-shared-libraries | Shared role helpers | — | Web/desktop import package |
| `apps/web/src/lib/server/rag/types.ts` | cueai-shared-libraries | RAG DTO types | — | RAG imports package |
| `apps/web/src/lib/server/extract-document.ts` | cueai-shared-libraries | Used by resume + knowledge | unpdf, mammoth | `@/` → package exports |
| `apps/desktop/shared/poll-job.ts` | cueai-shared-libraries | Desktop job polling | — | Desktop import |
| `apps/web/src/lib/poll-job.ts` | cueai-web | Web job polling (different signature) | — | Stays web-only |
| `apps/web/src/lib/server/email.ts`, `api/notifications/**` | cueai-notification-service | Email notifications | — | `@/` → web shim via tsconfig paths |
| `apps/web/src/lib/server/translate*.ts`, translate API routes | cueai-translation-service | Translation | orchestrator (groq/gemini) | Peer tsconfig → web + orchestrator |
| `apps/web/src/lib/exportDocument.ts` | cueai-export-service | Document export | — | Web UI imports package |
| `apps/web/src/lib/applyResumeRewrites.ts`, `api/resume/**` | cueai-resume-service | Resume tailor API | shared extract-document, groq | Route re-exports in web |
| `apps/web/src/lib/server/rag/**`, knowledge API routes, `knowledge-retrieve.ts` | cueai-knowledge-service | RAG + admin KB | shared extract-document, orchestrator embeddings | Large path update |
| `apps/web/src/lib/server/screen-context.ts`, `qwen-vl.ts`, `api/live/screen/**` | cueai-screen-context-service | Screen vision | orchestrator, jobs API | — |
| `tools/qwen-vl/**` (no `.venv`) | cueai-screen-context-service | Vision sidecar | — | — |
| `apps/api/app/modules/live/screen_*`, `tasks/vision.py` | cueai-screen-context-service | FastAPI screen + Celery | Redis, api core | Python path package |
| `apps/web/src/app/api/transcribe/**` | cueai-transcription-service | Groq Whisper HTTP | env GROQ_API_KEY | Self-contained route |
| `apps/web/src/lib/server/gemini.ts`, `groq.ts`, `llm-generate.ts`, `ai-config.ts`, `credential-resolver.ts` | cueai-ai-orchestrator | LLM providers | — | Used by translation, knowledge, live |
| `apps/api/app/modules/live/answer_*`, `providers.py`, `gemini.py`, `prompts.py`, `context.py` | cueai-ai-orchestrator | FastAPI live answer | — | api `live/router` imports |
| `llm-benchmark/**` | cueai-ai-orchestrator | Benchmark tooling | — | — |
| `apps/web/src/lib/server/fastapi-proxy.ts`, `middleware.ts` (copy) | cueai-gateway | BFF proxy + edge auth routing | cueai-api URL | Document: no standalone gateway server |
| `apps/api` minus extracted Python modules | cueai-api | Core API | — | — |
| `test_knowledge/**`, `tests/rag/**` | cueai-knowledge-service | RAG tests/fixtures | — | — |
| `apps/journiq/**` | **NONE** | Unrelated product | — | Leave untouched |

---

## Ambiguity resolutions

| File | Decision | Rationale |
|------|----------|-----------|
| `extract-document.ts` | cueai-shared-libraries | Imported by resume, knowledge admin, RAG document-processor |
| `poll-job.ts` (web) | cueai-web | Different API (`jobId` only vs `apiBase`) |
| `poll-job.ts` (desktop) | cueai-shared-libraries | Used by Windows screen-context |
| `workspace-store.json` | Runtime data, not in git | Owned by cueai-api/cueai-web runtime (`CUEAI_DATA_DIR`) |

---

## TypeScript dependency pattern

- Each `@cueai/*-service` package: `package.json`, `tsconfig.json` with `"paths": { "@/*": ["../cueai-web/src/*"] }` so moved files keep `@/lib/server/api-auth` **without rewriting logic**.
- `cueai-web` depends on all service packages via `"file:../cueai-*"`.
- API routes in web: `export { POST, ... } from "@cueai/resume-service/..."`.

---

## Python dependency pattern

- `cueai-knowledge-service/python/knowledge/` — modules from `app/modules/knowledge/`
- `cueai-screen-context-service/python/` — screen modules + `vision.py`
- `cueai-ai-orchestrator/python/live/` — answer stack
- `cueai-api` adds `PYTHONPATH` in README/Dockerfile for sibling repos (no logic change).

---

## Monorepo cutover

- Root `package.json` workspaces → `repositories/cueai-web`, `repositories/cueai-desktop/{windows,macos}`.
- Scripts updated to `repositories/cueai-*` paths.
- **`apps/*` retained, documented obsolete** — not deleted (per user confirmation rule).

---

## Phase execution

1. Refresh `repositories/cueai-{web,api,desktop}` from `apps/*`.
2. Populate shared-libraries + service packages from `apps/web` / `apps/api` / `tools`.
3. Thin web routes + remove duplicated files from `cueai-web` tree.
4. Update desktop shared imports to `@cueai/shared-libraries`.
5. `.gitignore` `.venv` under screen-context; strip copied venv if present.
6. Validate builds (best effort) → `docs/final-repository-separation-validation.md`.
