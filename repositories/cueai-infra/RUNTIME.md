# CueAI runtime map (actual architecture)

This describes how the product starts today. It is **not** 15 HTTP microservices.

Libraries (`cueai-gateway`, `cueai-ai-orchestrator`, `cueai-*-service`, `cueai-shared-libraries`) have **no listen port**. They are `file:` packages inside `cueai-web`.

Desktop is Electron on the host; it is not a compose service.

## Real dependency flow

```
Browser / Electron
        |
        v
   cueai-web  :3000   Next.js UI + BFF
        |  npm file: imports (in-process)
        |    cueai-gateway (optional FastAPI proxy helper)
        |    cueai-ai-orchestrator
        |    cueai-knowledge-service
        |    cueai-transcription-service
        |    cueai-translation-service
        |    cueai-resume-service
        |    cueai-export-service
        |    cueai-screen-context-service
        |    cueai-notification-service
        |    cueai-shared-libraries
        |
        |  HTTP (default live/jobs)
        v
   cueai-api  :8000   FastAPI  app.main:app
        |
        +--> Redis          required (broker + jobs)
        +--> PostgreSQL     optional (DATABASE_URL unset = skip)
        +--> Celery worker  same Redis; queues in app.core.celery
        +--> Groq / Gemini   when those env vars are set (live answer)
        +--> Celery worker   GEMINI_API_KEY for /v1/live/screen

   Qdrant :6333       optional for semantic RAG (cueai-web upload/index)
   Keycloak :8080     optional; used by FULL ONE root src/ Capacitor OIDC, not by cueai-web/api
```

## Startup commands (host)

| Process | Command | Port |
|---------|---------|------|
| API | `cd repositories/cueai-api && uvicorn app.main:app --host 127.0.0.1 --port 8000` | 8000 |
| Celery | `cd repositories/cueai-api && celery -A app.core.celery:celery_app worker --loglevel=info -Q ai.chat,ai.vision,ai.resume,speech,translate,email,maintenance,licensing,celery` | n/a |
| Web | See root workspace note below | 3000 |
| Desktop Windows | `cd repositories/cueai-desktop/windows && npm run dev` | companion overlay |
| Desktop macOS | `cd repositories/cueai-desktop/macos && npm run dev` | companion overlay |
| Compose (development) | `COMPOSE_PROFILES=dev` then `docker compose up --build` | web host port from `WEB_PORT`; FastAPI debug on `127.0.0.1:${API_PORT}` |
| Compose (production-style) | omit `COMPOSE_PROFILES` / `docker compose up --build` | FastAPI has **no** host port; `http://api:8000` only |

## Root npm workspace (do not delete root scripts)

OLD (FULL ONE root, still `workspaces: ["apps/*"]`):

```
npm run dev:web
```

That starts **legacy** `apps/web`, not Bitbucket `cueai-web`.

NEW (separated repositories):

```
npm run dev --prefix repositories/cueai-web
```

Mac desktop companion web:

```
npm run dev:web:mac
```

from the FULL ONE root (already prefixed to `repositories/cueai-web`).

## Compose: development vs production-style

Internal service URLs never use host ports:

| Path | URL |
|------|-----|
| Web → FastAPI | `http://api:8000` (`CUEAI_API_URL`) |
| API / Celery → Redis | `redis://redis:6379/0` |
| Web → Qdrant | `http://qdrant:6333` |
| Celery → Gemini | process env `GEMINI_API_KEY` / `GEMINI_MODEL` (no host publish) |

**Development** (`COMPOSE_PROFILES=dev` or `docker compose --profile dev up`): FastAPI is also bound to `127.0.0.1:${API_PORT:-8001}` for host debugging. Redis/Qdrant host ports stay available for local tools.

**Production-style** (no `dev` profile): FastAPI has **no** public host port. `http://127.0.0.1:8001` is not available. Docker services still reach `http://api:8000`.

## Authentication (development vs production)

CueAI uses a signed `cueai_admin_session` cookie. `CUEAI_ENV` is the product environment (`development` for this compose stack). `NODE_ENV=production` inside the web image does **not** by itself mean a production deployment. Session `Secure` cookies follow `CUEAI_ENV`, not `NODE_ENV`.

| Setting | Local compose / development | Production |
|---|---|---|
| `CUEAI_ENV` | `development` | **Required:** `production` (or `prod`) |
| `AUTH_SECRET` | Empty or placeholder uses an explicit development fallback | **Required** unique secret; missing or placeholder **fails startup** |
| Session cookie `Secure` | Off so local HTTP works | On |
| `CUEAI_BOOTSTRAP_ADMIN_ENABLED` | `true` in this compose file | Must be `false` / unset, unless `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` are set to a **non-default** pair |
| First admin | When the flag is on and bootstrap env vars are empty, the documented local pair is created | Default `admin@cueai.local` / `admin123` is refused |
| `NEXT_PUBLIC_SKIP_AUTH` / `NEXT_PUBLIC_AUTH_BYPASS` | Allowed only in non-production | **Fails startup** if enabled |
| FastAPI host port | Optional `127.0.0.1:8001` via the development overlay | **None** |

Do not put real passwords in tracked files. Production first-admin, if needed, comes from gitignored `BOOTSTRAP_ADMIN_*` only.

FastAPI store path: `CUEAI_DATA_DIR` (compose: `/app/.data`). It no longer walks a fixed number of parent directories.

## Health

| Endpoint | Meaning |
|----------|---------|
| `GET /health` (API) | Process up. Does not check Redis. |
| `GET /v1/health` (API) | Redis required; Postgres only if `DATABASE_URL` is set. |
| `GET /api/health` (web) | Next process up. |

## Redis

- URL: `REDIS_URL` (example `redis://localhost:6379/0`, compose `redis://redis:6379/0`).
- Used as Celery **broker and result backend**.
- Job state for screen analysis (`app.core.jobs`).

## Live answer implementation authority

**Docker production path (do not change):**

```
Desktop / browser
  → cueai-web POST /api/live/answer   (auth: session or device headers)
  → cueai-api POST /v1/live/answer    (signed cueai_admin_session)
  → cueai-api/app/modules/live/*      (Python: Groq primary, Gemini fallback)
```

Do **not** start `cueai-ai-orchestrator` as a container. It is a `file:` library inside the web image.

**Optional local / BYOK path only:** set `CUEAI_LIVE_ANSWER_LOCAL=1`. Next then uses `cueai-ai-orchestrator` (Groq/Gemini/BYOK) in-process and does **not** proxy live answers to FastAPI. This is for local development, not Docker production.

**Docker production screen path:**

```
/api/live/screen → /v1/live/screen → Celery ai.vision → analyze_screen_with_gemini
```

`celery-worker` must receive `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) from compose. Keys stay server-side: api + worker, never `NEXT_PUBLIC_*` or desktop renderer.

## Qdrant

- Used only when `QDRANT_URL` is set (cueai-knowledge-service via Next).
- Collection default: `cueai_knowledge` (`QDRANT_COLLECTION`). Do not create a second collection.
- Optional `QDRANT_API_KEY`.
- Embeddings: `RAG_EMBEDDING_PROVIDER` (`openai` default, or `gemini` / `local` / `none`).
- Dimensions (do not change provider/model without recreating + reindexing):
  - OpenAI `text-embedding-3-small` = **1536** (current compose default)
  - Gemini `text-embedding-004` = **768**
  - Local MiniLM = **384**
- Docker live answer today does **not** query Qdrant. FastAPI `retrieve_knowledge` reads the **api JSON store** (keyword). Web upload/index writes the **web store + Qdrant**. Those stores are not shared. Bridge is deferred (see below); do not silently switch dimensions.

### Docker live RAG (current vs desired)

| Step | Web upload / local live | Docker live (default) |
|------|-------------------------|------------------------|
| Upload | Next knowledge-service | n/a |
| Vectors | Qdrant `cueai_knowledge` | unused |
| Retrieve | `retrieveKnowledgeForMeeting` (session workspaceId) | FastAPI keyword on api store |
| LLM | Next orchestrator if `CUEAI_LIVE_ANSWER_LOCAL=1` | Python `generate_live_answer` |

Recommended future bridge (not implemented in this pass): **Option B** — Next retrieves with the authenticated `workspaceId` and sends `knowledgeContext` in the body. FastAPI already prefers `body.knowledgeContext` over its local keyword fallback. That avoids a second embedding stack and a second Qdrant collection.

## Keycloak

- **Not required** for cueai-web (next-auth) or cueai-api.
- Realm JSON is imported by the existing compose `keycloak` service.
- **Used by** FULL ONE `src/auth/keycloak.ts` (Capacitor / Vite mobile UI), not by the Bitbucket web/API trees.

## Database

- FastAPI: omit `DATABASE_URL` to run without Postgres.
- Compose still starts a Postgres image for optional experiments / future cutover.

## Android and root `src/` (do not delete)

| Tree | Status | Production for Bitbucket desktop/web/API? | Unique? |
|------|--------|-------------------------------------------|---------|
| `android/` | Capacitor Gradle project (`com.cueai.android`), overlay service | No | Yes — native overlay, not in the 15 repos |
| root `src/` | Vite + React Capacitor UI + Keycloak OIDC | No | Yes — mobile screens, mock RAG, overlay plugin |
| root `capacitor.config.ts` | Capacitor root is the monorepo | No | Ties android + src together |

Treat as **legacy / separate mobile track**. Freeze/remove only after an explicit product decision.

## `apps/` mirrors (do not delete)

| Path | Role |
|------|------|
| `apps/web` | Legacy Next tree. Root `package.json` workspaces still list `apps/*`. Overlaps cueai-web; cueai-web is the fuller Bitbucket tree. |
| `apps/desktop` | Legacy Electron (Windows-oriented). cueai-desktop is the fuller Bitbucket tree. |
| `apps/api` | Absent — FastAPI lives in `cueai-api` only. |

Safe to **freeze later** (not now): `apps/web` and `apps/desktop` once root workspaces and scripts point at `repositories/cueai-*`. Do not freeze until that cutover.

## What was not containerized

No images for gateway, orchestrator, knowledge, transcription, translation, resume, export, screen-context, notification, or shared-libraries. They are not HTTP servers.
