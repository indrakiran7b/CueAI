# CueAI API (FastAPI)

FastAPI service for the incremental backend migration. It runs **alongside** the existing Next.js application; production traffic still uses Next.js API routes until modules are migrated.

## Requirements

- Python **3.11+** (3.12 recommended)
- **Redis 7+** (local via Docker Compose or your own instance)
- **PostgreSQL 16+** (optional for now — schema migration and JSON cutover are deferred)

## Setup

From the repository root:

```bash
cd apps/api
python -m venv .venv
```

Activate the virtual environment:

- **Windows (PowerShell):** `.venv\Scripts\Activate.ps1`
- **macOS / Linux:** `source .venv/bin/activate`

## Install

```bash
pip install -r requirements.txt
```

## Environment

Copy the example file and adjust if needed:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `CUEAI_ENV` | `development` or `production` (disables `/docs` in production) |
| `API_HOST` | Bind address for uvicorn |
| `API_PORT` | Listen port (default `8000`) |
| `CORS_ORIGINS` | Comma-separated allowed origins (no `*`) |
| `REDIS_URL` | **Required.** e.g. `redis://localhost:6379/0` |
| `DATABASE_URL` | **Optional.** Async SQLAlchemy URL; omit to skip PostgreSQL startup and health checks |

Variables are read from the process environment. A local `apps/api/.env` file is loaded when present (keys already set in the environment are not overridden).

Optional test overrides:

| Variable | Description |
|----------|-------------|
| `CUEAI_TEST_REDIS_URL` | Redis URL for `@pytest.mark.redis` integration tests |
| `CUEAI_TEST_DATABASE_URL` | PostgreSQL URL for `@pytest.mark.postgres` integration tests |

## Local Redis (Docker)

From the **repository root**:

```bash
docker compose up redis -d
# or
npm run db:redis
```

Optional compose variable: `REDIS_PORT` (default host port `6379`).

Verify connectivity:

```bash
redis-cli -p 6379 ping
```

## Local PostgreSQL (optional, deferred)

PostgreSQL infrastructure exists under `app/db/` and Alembic, but **business migration is intentionally deferred**. To experiment locally:

```bash
docker compose up postgres -d
```

Set `DATABASE_URL` in `apps/api/.env` (see commented example in `.env.example`), then:

```bash
alembic upgrade head
```

## Run

From `apps/api` with the virtual environment active:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Default URL: `http://127.0.0.1:8000`

## Health check

```http
GET /v1/health
```

When Redis is reachable (and optional PostgreSQL, if configured):

```json
{"status": "ok", "redis": "ok"}
```

With `DATABASE_URL` set and PostgreSQL up:

```json
{"status": "ok", "redis": "ok", "database": "ok"}
```

HTTP **200** when all configured dependencies are healthy.

When Redis is down:

```json
{"status": "degraded", "redis": "unavailable"}
```

HTTP **503**.

Redis uses `PING`. PostgreSQL (when configured) uses `SELECT 1`. Responses never include URLs, credentials, or stack traces.

## Tests

Unit tests (mocked Redis / no infrastructure):

```bash
python -m pytest -m "not redis and not postgres"
```

Redis integration tests:

```bash
python -m pytest -m redis
```

PostgreSQL integration tests (optional):

```bash
python -m pytest -m postgres
```

From the repository root:

```bash
npm run test:api
```

Celery integration tests (Redis required; starts a short-lived in-process worker):

```bash
python -m pytest -m celery
```

Integration tests **skip with an explicit message** if Redis or PostgreSQL is not running.

## Celery worker

Celery uses the same **`REDIS_URL`** as broker and result backend (separate connections from the FastAPI Redis client — expected).

### Local worker (separate process from FastAPI)

1. Start Redis: `npm run db:redis` (from repo root)
2. Start worker:

```bash
npm run worker:celery
```

Or from `apps/api`:

```bash
celery -A app.core.celery:celery_app worker --loglevel=info -Q ai.chat,ai.vision,ai.resume,speech,translate,email,maintenance,licensing,celery
```

### Docker Compose

```bash
docker compose up redis celery-worker -d
```

The worker waits for Redis health before starting.

### Test task

Task name: `cueai.health_check` (queue: `maintenance`). Returns `{"status": "ok"}`.

Verify enqueue + result (requires a running worker):

```bash
npm run celery:verify
```

Or:

```bash
cd apps/api
python scripts/verify_celery_task.py
```

Future queues are declared in `app/core/celery.py`; only the health task exists today.

## Auth, workspace, entitlements (migrated)

FastAPI serves (same JSON store file as Next.js — `CUEAI_DATA_DIR` or default `apps/web/.data/workspace-store.json`):

| Path | Notes |
|------|--------|
| `POST /v1/auth/login` | HMAC session cookie `cueai_admin_session` (compatible with Next.js) |
| `POST /v1/auth/signup` | |
| `GET /v1/auth/me` | Refreshes session cookie from store |
| `POST /v1/auth/logout` | |
| `GET /v1/auth/providers` | OAuth flags (NextAuth callbacks remain on Next) |
| `GET/POST /v1/workspaces` | |
| `GET/PUT /v1/onboarding` | |
| `GET /v1/entitlements/me` | Plan + meeting Q&A rules |

Enable Next.js proxy: set `CUEAI_USE_FASTAPI=1` and `CUEAI_API_URL=http://127.0.0.1:8000` in `apps/web/.env.local`.  
`POST /api/auth/oauth-sync` and `[...nextauth]` stay on Next.js.

Shared secrets: `AUTH_SECRET` (or `NEXTAUTH_SECRET`) must match between Next and FastAPI.

## Architecture

```
FastAPI → Redis (health / future cache)
FastAPI → enqueue → Redis (broker) → Celery worker → result backend (Redis)
FastAPI → SQLAlchemy (async) → PostgreSQL (optional until migration phase)
```

- `app/core/redis.py` — FastAPI async Redis client, `PING` health check, `aclose()` on shutdown
- `app/core/celery.py` — Celery app configuration (broker + result backend)
- `app/tasks/health.py` — `cueai.health_check` test task
- `app/db/session.py` — async engine and sessions (only when `DATABASE_URL` is set)
