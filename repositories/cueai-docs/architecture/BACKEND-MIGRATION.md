# CueAI backend migration plan

**Status:** Migration in progress (strangler). Next.js API remains until each slice is proven.  
**Branch inspected:** `macos-desktop` (post–role-based nav / entitlements, ~`97f2fd5`).  
**Authoring rule:** Strangler migration; Next.js API remains until each slice is proven.

### Implementation status (backend)

| Step | Scope | Status |
|------|--------|--------|
| FastAPI foundation | `apps/api`, `GET /v1/health` | **Done** |
| PostgreSQL foundation | SQLAlchemy async, Alembic, optional `DATABASE_URL`, `docker-compose` `postgres` | **Prepared** — business tables and JSON migration **intentionally deferred** |
| Redis foundation | `REDIS_URL`, async client, health `redis` field, `docker-compose` `redis` | **Done** |
| Celery foundation | Broker + result backend on Redis, `cueai.health_check`, `docker-compose` `celery-worker` | **Done** — no beat, no business tasks |
| Auth + workspace + entitlements | FastAPI `/v1/auth/*`, `/v1/workspaces`, `/v1/onboarding`, `/v1/entitlements/me`; Next proxy via `CUEAI_USE_FASTAPI` | **Done** (JSON store; OAuth sync stays on Next) |
| Other module migrations | licensing, meetings, live, admin, … | **Not started** |

### Product ownership (confirmed)

| Capability | Audience | Notes |
|------------|----------|--------|
| Meeting **summary** | All authenticated users | Existing meeting APIs |
| Meeting **full transcript** | **Premium** (admins included) | Enforced in `GET /api/meetings/:id` via `canViewFullTranscript`; free users get `transcript: []` + `transcriptLocked` |
| Resume Tailor | **Admin portal** | `/resume` + `/api/resume/analyze` require admin; extract remains for live-session briefing upload |
| Translation page | **Admin portal** | `POST /api/admin/translate` requires `admin.access` |
| Companion live translation | **Signed-in users** | `POST /api/translate` requires a session only (same `translateTexts` service) |

### Live / AI (this increment)

| Path | Runtime | Notes |
|------|---------|--------|
| `POST /api/live/answer` | Proxy to FastAPI by default (`CUEAI_LIVE_ANSWER_LOCAL=1` rolls back) | Forwards the `cueai_admin_session` cookie. FastAPI verifies it with `AUTH_SECRET` and ignores invalid cookies. Screenshots: Qwen sidecar, else Gemini `inlineData` (mime + base64). Usage rows are written only for a valid session. |
| `POST /api/live/screen` | Sync in Next.js | Groq vision, Gemini fallback. Qwen-VL stays a sidecar (`tools/qwen-vl`). |
| `POST /api/transcribe` | Sync in Next.js | Groq Whisper. Desktop CORS unchanged. |
| `POST /api/translate` | Sync in Next.js | Companion / any authenticated user |
| `POST /api/admin/translate` | Sync in Next.js | Admin transcript page |

FastAPI `app/modules/live/access.py` encodes the two translation policies. Provider calls remain in `apps/web/src/lib/server/{groq,gemini,translate,screen-context}.ts` so existing desktop clients keep `/api/*` contracts. PostgreSQL + pgvector is still deferred.
| Knowledge base | **Admin portal** | Manual upload via existing `/api/admin/knowledge`. RAG stages live in `apps/api/app/modules/knowledge/pipeline.py`. **pgvector is the final PostgreSQL phase — not implemented** |
| Live session → RAG | Future boundary | `apps/api/app/modules/knowledge/live_bridge.py` (no automatic ingestion yet) |
| Local LLM | Admin-oriented future | `tools/qwen-vl` is **inference**, not training. See `apps/api/app/modules/local_llm/README.md` |

---

## 1. Current architecture

### 1.1 Repository layout

```
cueai-android/
├── apps/
│   ├── web/                      # Next.js 16 — UI + all HTTP APIs
│   ├── desktop/windows/          # Electron + Vite companion
│   ├── desktop/macos/          # Electron + macOS-native services
│   └── desktop/shared/           # Licensing client, workspace-env, build-resources
├── tests/
│   ├── web/e2e/                  # Playwright
│   └── licenses/                 # Node license unit tests
├── tools/qwen-vl/                # Python HTTP sidecar (local vision)
├── scripts/                      # dev orchestration, deploy bundles, license CLI
├── docs/                         # LICENSE-IMPLEMENTATION, RESTRUCTURE-MIGRATION
├── keycloak/                     # Realm config (optional IdP)
└── package.json                  # workspaces: @cueai/web, @cueai/desktop, @cueai/desktop-mac
```

There is **no** standalone backend package today. All server behavior lives in `apps/web`.

### 1.2 Request flow (today)

```
Browser / Electron renderer
    → apps/web (Next.js)
        → middleware.ts (session cookie, public path exceptions)
        → app/api/*/route.ts (thin HTTP handlers)
        → lib/server/* (business logic)
        → JSON files under CUEAI_DATA_DIR (or apps/web/.data)
```

**Desktop (main process)** calls the same origin via `getWebOrigin()` / `CUEAI_WEB_URL`:

- Licensing: `POST /api/license/{activate,validate,deactivate}` (no session cookie)
- Live: `GET|PUT /api/live/briefing`, `POST /api/live/answer`, `POST /api/live/screen`, `POST /api/live/meeting-event`
- Speech: `POST /api/transcribe` (multipart, CORS `*`)
- Screen (Windows): `POST /api/live/screen` via `apps/desktop/windows/src/services/screen-context.ts`
- Mac device trust: `POST /api/devices/register`, `GET /api/devices/status` (session required)

Packaged desktop may embed Next standalone (`prepare-desktop-web.cjs`) or point at remote URL (`client-handoff`, `workspace-data/.env`).

### 1.3 Product surfaces (relevant to module boundaries)

| Surface | Routes / code | Audience |
|---------|---------------|----------|
| **CueAI app (5 modules)** | `CUEAI_USER_NAV` in `lib/app-access.ts`: dashboard, meetings, live, companion, settings | Normal `User` |
| **Admin portal** | `(app)/admin/page.tsx` + `/api/admin/*` | `Admin` / `Manager` |
| **Power-user pages** | translation, screen-context, knowledge | Admin nav only; normal users redirected by `CueAiRouteGate` |
| **Resume Tailor** | `(app)/resume`, `/api/resume/*` | Public web; blocked in macOS desktop shell |
| **Desktop licensing** | `/license`, `/api/license/*`, `desktop/shared/licensing` | Packaged clients |
| **Mac device registration** | `DbDevice` + `/api/devices/*` | macOS app (separate from license `deviceId`) |

### 1.4 Persistence (today)

| Store | File | Module | Access |
|-------|------|--------|--------|
| Workspace | `{CUEAI_DATA_DIR}/workspace-store.json` | `lib/server/db.ts` | `readStore` / `updateStore` / `appendAudit` / `appendUsage` |
| Licenses | `{CUEAI_DATA_DIR}/licenses.json` | `lib/server/license-db.ts` | `readLicenseStore` / `updateLicenseStore` |

Both use in-process memory + `writeQueue` serialisation. **Not safe for multiple Next.js instances** without external locking.

`CUEAI_DATA_DIR` is set by packaged desktop, Playwright E2E (`.data-e2e`), and cloud deploy examples.

### 1.5 Authentication & session (today)

| Mechanism | Location | Notes |
|-----------|----------|-------|
| **Primary app session** | `lib/server/session.ts` | Cookie `cueai_admin_session`, HMAC-signed payload (`userId`, `role`, `workspaceId`, `exp`) |
| **Session refresh from store** | `lib/server/api-auth.ts` | Role/name/email reloaded from `workspace-store.json`; deactivated users rejected |
| **Middleware** | `middleware.ts` | Protects pages + most APIs; **exceptions** for `/api/live/*`, `/api/transcribe`, `/api/license/*`, `/api/health` |
| **NextAuth** | `auth.ts`, `/api/auth/[...nextauth]` | Google/GitHub/Apple OAuth; `oauth-sync` bridges to custom session |
| **Credential login** | `/api/auth/login`, `signup` | scrypt password hashes in JSON store |
| **Dev bypass** | `lib/auth-mode.ts` | `NEXT_PUBLIC_SKIP_AUTH`, `NEXT_PUBLIC_AUTH_BYPASS` |
| **Edge verify** | `session-edge.ts` | Middleware-only session verify |

**Note:** `middleware.ts` exempts `/api/health`, but no `app/api/health` route exists yet (harmless; add when ops need a probe).

### 1.6 Licensing (today)

| Piece | Path |
|-------|------|
| Crypto | `license-crypto.ts` — Ed25519 sign/verify, SHA-256 key hash, `CUEAI-CLIENT-*` key format |
| Business logic | `licenses.ts` — activate, validate, deactivate, revoke, grace hours |
| Public API | `/api/license/*` — no admin cookie; JSON body `licenseKey`, `deviceId`, `platform` |
| Admin API | `/api/admin/licenses` — `licenses.read` / `licenses.write` permissions |
| Desktop | `desktop/shared/licensing/*` — 15s HTTP timeout, local secure storage of signed payload |

See `docs/LICENSE-IMPLEMENTATION.md`.

### 1.7 Entitlements (today)

| Piece | Path | Notes |
|-------|------|-------|
| Plan on user | `DbUser.plan` — `free` \| `premium` | Stored in workspace JSON |
| Rules | `lib/entitlements.ts` | `FREE_MEETING_QA_LIMIT = 5`, `canViewFullMeetingQa` |
| Enforcement | **Client only** | `meetings/[id]/summary/page.tsx` truncates Q&A list |

**No server-side entitlement checks** on meeting APIs yet.

### 1.8 AI providers (today)

| Integration | File | Used by |
|-------------|------|---------|
| **Groq** | `groq.ts` | Live answer (primary), resume analyze, STT in `transcribe`, vision in `screen-context.ts` |
| **Gemini / Vertex** | `gemini.ts` | Fallback for live, resume, screen, transcribe; admin catalog |
| **Qwen-VL sidecar** | `qwen-vl.ts` → `tools/qwen-vl/server.py` | Optional local vision; live answer tries Qwen first when image present; screen-context uses Groq → Gemini → Qwen |
| **Admin AI catalog** | `ai-config.ts`, `/api/admin/ai` | Providers/models in workspace store + env key fallbacks for connection tests |
| **Translate** | `translate.ts`, `/api/translate` | Server-side translation |
| **Knowledge retrieve** | `knowledge-retrieve.ts` | Keyword retrieval for live answer (no vector DB) |

Env keys (server-only): `GROQ_API_KEY`, `GEMINI_API_KEY`, `VERTEX_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, model overrides (`GROQ_MODEL`, `GROQ_VISION_MODEL`, `GEMINI_MODEL`, `GROQ_STT_*`).

### 1.9 Tests (today)

| Suite | Command | Scope |
|-------|---------|-------|
| License unit | `npm run test:licenses` | Crypto + store + shared verify (imports TS via `tsx`/dynamic) |
| Playwright E2E | `npm run test:e2e`, `test:e2e:license`, `test:e2e:ai-providers` | Web flows; isolated `CUEAI_DATA_DIR` |
| Lint | `npm run lint` | ESLint on `@cueai/web` |

### 1.10 Deployment scripts (today)

| Script | Purpose |
|--------|---------|
| `prepare-desktop-web.cjs` | Copy Next standalone → `desktop/shared/build-resources/web` |
| `prepare-cloud-deploy.cjs` | `dist/cueai-server/` — standalone + Dockerfile + `.env.production.example` (placeholders only) + license seed |
| `prepare-client-handoff.cjs` | Portable exe + client `.env` template |
| `start-remote-licensing.cjs` | Dev web + optional ngrok |
| `dev-windows.cjs` / `dev-mac.cjs` | Web + Electron orchestration |
| `generate-license.mjs` / `generate-license-keys.mjs` | CLI license ops |

---

## 2. Target architecture

### 2.1 Principles

- **Modular monolith** in Python (`apps/api`) — not microservices.
- **PostgreSQL** = source of truth for workspace + licenses + meetings.
- **Redis** = Celery broker, result backend (short TTL), rate limits, job status, optional cache — **not** primary persistence.
- **Celery** only for work that is long-running, bursty, or schedulable.
- **Next.js** stays UI (+ temporary reverse proxy to FastAPI).
- **No frontend behavior change** in early phases; desktop URLs and payloads stable.

### 2.2 Target diagram

```
Clients (web, Electron)
        │
        ▼
apps/web (Next.js) ──proxy (optional)──► apps/api (FastAPI)
        │                                      │
        │                                      ├── PostgreSQL
        │                                      ├── Redis
        │                                      └── Celery workers
        │
        └── static/SSR only (end state)

tools/qwen-vl (optional) ◄── HTTP ── Celery vision tasks or desktop-local
```

---

## 3. API route → future FastAPI module mapping

HTTP methods reflect current Next handlers. FastAPI paths can stay `/api/...` during strangler phase to avoid client changes.

### auth

| Current route | Methods | Server deps | Notes |
|---------------|---------|-------------|-------|
| `/api/auth/login` | POST | `db`, `session`, `bypass-auth`, `appendAudit` | Sets `cueai_admin_session` |
| `/api/auth/signup` | POST | `db`, `session` | |
| `/api/auth/logout` | POST | cookie clear | |
| `/api/auth/me` | GET | `api-auth`, `db` | Includes `plan` when present |
| `/api/auth/providers` | GET | env OAuth flags | |
| `/api/auth/oauth-sync` | POST | NextAuth + session bridge | |
| `/api/auth/[...nextauth]` | * | NextAuth | May remain on Next longer |

### workspace

| Current route | Methods | Server deps |
|---------------|---------|-------------|
| `/api/workspaces` | GET, POST | `db`, `requireAuth` |
| `/api/onboarding` | GET, PUT | `db`, `user-profile` |

### entitlements

| Current | Location | Future |
|---------|----------|--------|
| (no dedicated API) | `lib/entitlements.ts`, `DbUser.plan` | `GET /api/entitlements/me`; enforce on meeting read + AI quotas in API |

### admin

| Current route | Methods | Permission / auth |
|---------------|---------|-------------------|
| `/api/admin/overview` | GET | `admin.access` (via overview permission pattern) |
| `/api/admin/workspace` | GET, PATCH | `workspace.read` / `workspace.write` |
| `/api/admin/users` | GET, PATCH, DELETE | `users.*` |
| `/api/admin/invites` | GET, POST, PATCH, DELETE | `users.invite` etc. |
| `/api/admin/settings` | GET, PATCH | `privacy.*`, `retention.write` |
| `/api/admin/audit` | GET | `audit.read` |
| `/api/admin/usage` | GET | `usage.read` |
| `/api/admin/ai` | GET, PATCH, POST, DELETE | `ai.read` / `ai.write` |
| `/api/admin/knowledge` | GET, POST, PATCH, DELETE | `knowledge.*` |
| `/api/admin/devices` | GET, PATCH | `devices.*` — **Mac admin devices** |
| `/api/admin/licenses` | GET, POST, DELETE | `licenses.read` / `licenses.write` |
| `/api/admin/retention/cleanup` | GET, POST | `retention.write` |
| `/api/admin/purge-synthetic` | POST | `workspace.write` |

Role matrix: `lib/roles.ts` (`Admin` | `Manager` | `User`).

### licensing

| Current route | Methods | Auth | Server deps |
|---------------|---------|------|-------------|
| `/api/license/activate` | POST | **None** (public) | `licenses.ts`, `license-crypto` |
| `/api/license/validate` | POST | None | same |
| `/api/license/deactivate` | POST | None | same |
| `/api/license/status` | GET | Query params | same |

Admin license routes listed under **admin**.

### meetings

| Current route | Methods | Auth | Server deps |
|---------------|---------|------|-------------|
| `/api/meetings` | GET, POST | `requireAuth` | `meetings.ts` |
| `/api/meetings/[id]` | GET, PATCH, DELETE | `requireAuth` | `meetings.ts`, `canAccessMeeting` |
| `/api/live/briefing` | GET, PUT | **None in handler** | `meetings.ts` `liveBriefing` on global store |
| `/api/live/meeting-event` | POST | Partial | `meetings.ts` append transcript/answers |

### live

| Current route | Methods | Auth | maxDuration | Server deps |
|---------------|---------|------|-------------|-------------|
| `/api/live/answer` | POST, OPTIONS | Optional session (usage/profile) | 120s | `groq`, `gemini`, `qwen-vl`, `live-answer.ts`, `knowledge-retrieve` |
| `/api/live/screen` | POST, OPTIONS | Optional session (usage) | 120s | `screen-context.ts` |
| `/api/transcribe` | POST | Optional session (usage) | 60s | Groq STT → Gemini fallback |

CORS `Access-Control-Allow-Origin: *` on live answer, screen, briefing, transcribe (desktop companion origins).

### resume

| Current route | Methods | Auth | maxDuration | Server deps |
|---------------|---------|------|-------------|-------------|
| `/api/resume/analyze` | POST | Optional (profile + usage) | 60s | `extract-document`, groq/gemini, `saveLiveBriefing` |
| `/api/resume/extract` | POST | — | 30s | `extract-document.ts` |

### knowledge

| Current route | Methods | Notes |
|---------------|---------|-------|
| `/api/admin/knowledge` | CRUD | Indexed in JSON; `status: processing` |
| (retrieve) | — | `knowledge-retrieve.ts` used inside live answer only |

### devices

| Current route | Methods | Auth | Notes |
|---------------|---------|------|-------|
| `/api/devices/register` | POST | `requireAuth` | Mac credential hashing |
| `/api/devices/status` | GET | `requireAuth` | |

Distinct from **license** `deviceId` in `licenses.json` activations.

### notifications

| Current route | Methods | Server deps |
|---------------|---------|-------------|
| `/api/notifications` | GET | `requireAuth`, derived from audit/invites |

### translate

| Current route | Methods | maxDuration |
|---------------|---------|-------------|
| `/api/translate` | POST | 120s |

### maintenance

| Current route | Methods | Server deps |
|---------------|---------|-------------|
| `/api/admin/retention/cleanup` | GET, POST | `retention-cleanup.ts` |
| `/api/admin/purge-synthetic` | POST | `synthetic.ts` |

### invites (cross-cutting)

| `/api/invites/accept` | GET, POST | invite acceptance |

---

## 4. Storage → PostgreSQL tables (proposed)

Map types from `lib/server/db.ts` and `license-db.ts`. Use UUID/text IDs compatible with existing `lic_*`, `usr_*`, `meet_*` style where present.

| Table | Source type / field | Notes |
|-------|---------------------|-------|
| `workspaces` | `DbWorkspace` | privacy, retention JSON columns |
| `users` | `DbUser` | `password_hash`, `plan`, `onboarding` JSON |
| `invites` | `DbInvite` | |
| `meetings` | `DbMeeting` | transcript, answers JSONB; index `workspace_id`, `user_id`, `status` |
| `live_briefings` | `WorkspaceStore.liveBriefing` | **Today global per store** — migrate to `workspace_id` or `user_id` |
| `knowledge_items` | `DbKnowledge` | |
| `usage_events` | `DbUsageEvent` | append-only |
| `audit_events` | `DbAudit` | append-only |
| `ai_providers` | `DbAiProvider` | |
| `ai_models` | `DbAiModel` | |
| `ai_config` | `DbAiConfig` legacy fields | or normalise into providers |
| `devices` | `DbDevice` | Mac registration |
| `licenses` | `DbLicense` | `license_key_hash` only |
| `license_activations` | `DbLicenseActivation` | |
| `notifications` | (derived) | optional materialised view / query |

**Migration source files:** `workspace-store.json`, `licenses.json` under `CUEAI_DATA_DIR`.

---

## 5. Async operations → Celery queues (proposed)

Only routes that already block up to `maxDuration` or run batch jobs:

| Queue | Current entrypoint | Rationale |
|-------|-------------------|-----------|
| `ai.chat` | `/api/live/answer` (non-SSE path) | Up to 120s; Groq/Gemini |
| `ai.vision` | `/api/live/screen`, optional Qwen HTTP | Heavy; may call `tools/qwen-vl` |
| `ai.resume` | `/api/resume/analyze` | 60s; document + LLM |
| `speech` | `/api/transcribe` | Audio upload + STT |
| `translate` | `/api/translate` | 120s |
| `email` | `email.ts` from admin invites | Non-blocking delivery |
| `maintenance` | `retention-cleanup.ts`, `purge-synthetic` | Scheduled via Celery Beat |
| `knowledge` | knowledge `status: processing` | Future indexing |

**Keep synchronous (initially):**

- All `/api/license/*` (desktop 15s timeout)
- Auth login/signup
- CRUD admin reads/writes (except heavy reports)
- `/api/meetings` simple CRUD
- `/api/devices/*`

**SSE streaming:** `/api/live/answer` may need a hybrid (stream from worker via Redis pub/sub or keep on Next until phase 2).

---

## 6. Redis opportunities

| Use | Current pain | Keys / pattern |
|-----|--------------|----------------|
| Celery broker + results | N/A | `redis://` DB 0/1 |
| Job status for async AI | UI spinners only | `job:{uuid}` → JSON status |
| Rate limiting | None on license activate / AI | `rl:license:{ip}`, `rl:ai:{userId}` |
| Free-tier meeting QA | Client-side truncate only | enforce + count in API |
| Session cache | Every request reads JSON file | optional `sess:{userId}` |
| Distributed lock | `writeQueue` in Node | `lock:workspace`, `lock:licenses` during dual-write |
| Admin overview cache | Recomputes from JSON | TTL cache |

---

## 7. Desktop compatibility requirements

These **must not break** during migration:

| Requirement | Detail |
|-------------|--------|
| Base URL | `CUEAI_WEB_URL` or `getWebOrigin()`; packaged `workspace-data/.env` via `desktop/shared/workspace-env.ts` |
| License paths | `POST /api/license/activate|validate|deactivate` — JSON shape in `desktop/shared/licensing/types.ts` |
| License timeout | 15s in `licensing/client.ts` |
| Signed payload | Ed25519 fields in `SignedActivationPayload`; verify in `licensing/verify.ts` with `LICENSE_SIGNING_PUBLIC_KEY` |
| CORS | `*` on live answer, screen, briefing, transcribe |
| Middleware bypass | Desktop calls `/api/live/*` and `/api/transcribe` without browser session cookie |
| Screen API | Windows uses `/api/live/screen` (not a separate legacy path) |
| Mac devices | OAuth session cookie required for `/api/devices/register` |
| Embedded web | `prepare-desktop-web.cjs` + `CUEAI_DATA_DIR` in packaged Next child process |

**Proxy strategy:** Next `rewrites` `/api/:path*` → FastAPI so desktop binaries need no change.

---

## 8. Migration order (recommended)

| Phase | Scope | Outcome |
|-------|-------|---------|
| **0** | This doc + OpenAPI sketch + `docker-compose` (postgres, redis, api, worker) | No behavior change |
| **1** | **licensing** module in FastAPI + Postgres; Next proxy; dual-write or one-time import `licenses.json` | Desktop activation unchanged URL |
| **2** | **auth** session verification compatible with `cueai_admin_session` HMAC secret | Web + API share `AUTH_SECRET` |
| **3** | **workspace** + **entitlements** (server-side `plan`, meeting Q&A limits) | Fix client-only entitlement gap |
| **4** | **meetings** + scoped **live/briefing** (per user/workspace) | Fix global briefing |
| **5** | **live** + Celery for answer/screen/transcribe; Redis job IDs | Desktop polling contract |
| **6** | **admin** submodules (users, invites, settings, audit, usage, ai, knowledge, devices) | Largegest surface |
| **7** | **resume** + **translate** | |
| **8** | **maintenance** (Celery beat retention) | |
| **9** | Remove Next `app/api` handlers; JSON store read-only backup | |

---

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dual-write JSON + Postgres | Data drift | One module at a time; feature flags |
| Multi-instance Next today | Corrupt JSON | Postgres + Redis locks before horizontal scale |
| Global `liveBriefing` | Wrong user context on shared server | Fix in phase 4 before multi-tenant cloud |
| Entitlements client-only | API leaks full meeting Q&A | Phase 3 server enforcement |
| Two device concepts | Ops confusion | Keep `devices` vs `license_activations` docs and APIs separate |
| SSE live answer | Hard to move to Celery | Defer or use Redis stream |
| NextAuth on Next | OAuth callbacks stay on web origin | Keep `[...nextauth]` on Next; API trusts synced session |
| Qwen sidecar | GPU/local only | Not required in cloud; Groq/Gemini path sufficient |
| `AUTH_BYPASS` in dev | False confidence | Integration tests with real auth against API |

---

## 10. Explicit “must NOT change” (migration phase)

- Cookie name `cueai_admin_session` and HMAC session wire format (until a planned auth v2).
- License key format, hash algorithm, Ed25519 activation payload JSON, grace hours semantics.
- Desktop public API paths listed in §7.
- CORS headers on desktop-facing live/transcribe routes.
- Frontend routes, `CueAiRouteGate`, `CUEAI_USER_NAV`, admin permission names in `roles.ts`.
- Electron IPC channels and preload contracts.
- Existing Next.js API routes **remaining mounted** until each module’s proxy is verified.
- `npm run test:licenses` and license E2E scenarios must pass after licensing migration.

---

## 11. Code disposition

### Reuse (port behavior / copy prompts verbatim)

| Area | Files |
|------|-------|
| License rules | `licenses.ts`, `license-crypto.ts`, `license-db.ts` types |
| Meeting access rules | `meetings.ts` (`canAccessMeeting`, status helpers) |
| Live prompts | `lib/live-answer.ts` |
| Screen prompts | `screen-context.ts` |
| Roles / permissions | `roles.ts` |
| Groq/Gemini call patterns | `groq.ts`, `gemini.ts` (reference for Python client) |
| Desktop verify | `desktop/shared/licensing/verify.ts` (test vectors) |
| Document extract | `extract-document.ts` logic |

### Refactor (before or during port)

| Area | Why |
|------|-----|
| `live/briefing` | Scope to user/workspace; add auth |
| `entitlements.ts` | Enforce in API + meeting GET |
| `admin/page.tsx` | Already splitting panels; not backend but affects API usage |
| `ai-config.ts` | Clarify env vs catalog precedence |
| `api-auth` + middleware | Single policy document for public vs optional-auth routes |

### Delete eventually

| Area | When |
|------|------|
| `apps/web/src/app/api/**` handlers | Per-module after proxy proven |
| `lib/server/db.ts` JSON persistence | After Postgres cutover |
| `lib/server/license-db.ts` JSON | After licensing in Postgres |
| `scripts/generate-license.mjs` direct JSON write | When admin API is sole generator (CLI can call API) |

### Keep temporarily for compatibility

| Area | Why |
|------|-----|
| All Next API routes | Strangler |
| `lib/server/*` called from Next | Until handler delegates to HTTP client or shared package |
| Next middleware | Until auth split is designed |
| `prepare-cloud-deploy.cjs` (Next standalone) | Until web+api deploy story merged |
| `tools/qwen-vl` | Desktop local vision |

---

## 12. Environment variables (inventory)

See `apps/web/.env.example`. Critical groups:

| Group | Variables |
|-------|-----------|
| Auth | `AUTH_SECRET`, `AUTH_URL`, `AUTH_*_ID/SECRET`, `NEXT_PUBLIC_SKIP_AUTH`, `NEXT_PUBLIC_AUTH_BYPASS` |
| Data | `CUEAI_DATA_DIR` |
| AI | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_STT_*`, `GEMINI_*`, `VERTEX_*`, `OPENAI_*`, `ANTHROPIC_*` |
| Licensing | `LICENSE_SIGNING_PRIVATE_KEY`, `LICENSE_SIGNING_PUBLIC_KEY`, `LICENSE_OFFLINE_GRACE_HOURS`, `LICENSE_ENFORCEMENT` |
| Email | `RESEND_API_KEY`, `SMTP_*`, `EMAIL_FROM` |
| Vision sidecar | `CUEAI_QWEN_VL_URL` (default `http://127.0.0.1:39292`) |
| Retention | `RETENTION_CLEANUP_ENABLED`, `RETENTION_CLEANUP_ALLOW_DEV` |
| Public URL | `NEXT_PUBLIC_APP_URL`, `NGROK_URL` |
| E2E | Playwright sets `CUEAI_DATA_DIR`, `NEXT_PUBLIC_SKIP_AUTH=false` |

**FastAPI (`apps/api/.env.example`):** `REDIS_URL` (required), `DATABASE_URL` (optional until DB migration phase) — never commit secrets.  
**Future:** `CELERY_BROKER_URL` (often same Redis URL as broker/backend).

---

## 13. Qwen-VL sidecar integration (current)

| Item | Detail |
|------|--------|
| Location | `tools/qwen-vl/server.py` |
| Start | `npm run dev:vision`; Electron may start sidecar (`qwen-vl-sidecar.ts`) |
| Endpoints | `GET /status`, `POST /analyze` |
| Consumer | `lib/server/qwen-vl.ts` from live answer + screen-context fallback |
| Migration | Keep as optional HTTP dependency; Celery `ai.vision` task can call same URL; do not bundle model in API container by default |

---

## 14. Future `apps/api` Python layout (reference only)

```
apps/api/
  main.py
  core/           # config, db session, redis, security
  modules/
    auth/
    workspace/
    entitlements/
    admin/
    licensing/
    meetings/
    live/
    resume/
    knowledge/
    devices/
    notifications/
    translate/
    maintenance/
  worker/         # Celery app + tasks
```

One deployable image; workers scale independently.

---

## 15. Verification checklist (current baseline)

Run before/after each migration phase:

| Check | Command | Baseline (2026-03-25) |
|-------|---------|------------------------|
| License unit tests | `npm run test:licenses` | **PASS** (4/4) |
| Web lint | `npm run lint` | **FAIL** (36 errors, 10 warnings — pre-existing, mostly React hooks in admin/auth UI) |
| Web build | `npm run build:web` | **PASS** (verified 2026-03-25) |
| License E2E | `npm run test:e2e:license` | Not run in this pass (requires dev server) |

---

## 16. Related docs

- `docs/LICENSE-IMPLEMENTATION.md`
- `docs/RESTRUCTURE-MIGRATION.md`
- `dist/cueai-server/DEPLOY.md` (generated by `client:deploy-bundle`)

---

*FastAPI and PostgreSQL foundation live under `apps/api/`; module migrations follow §8 order.*
