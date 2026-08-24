# CueAI

Monorepo:

| App | Stack | Role |
|-----|--------|------|
| `apps/web` | Next.js + Tailwind | Design source of truth — dashboard, admin, resume, settings |
| `apps/desktop` | Electron + React + TypeScript | Windows desktop shell + floating companion |
| `backend` | FastAPI + PostgreSQL + Redis | Production API (REST + WebSocket) |

## Development

Terminal 1 — web (required for desktop main window):

```bash
npm run dev:web
```

Terminal 2 — Electron (loads http://localhost:3000 + companion on :5173):

```bash
npm run dev:desktop
```

Terminal 3 — API (Phase 1+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

See `backend/README.md` for backend phases and architecture.

Docker (API + Postgres/pgvector + Redis + MinIO + Celery):

```bash
cd backend
cp docker/.env.docker.example docker/.env
docker compose --env-file docker/.env up --build
```

### Desktop shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Space` | Toggle companion |
| `Ctrl+Shift+C` | Show companion |
| `Ctrl+Shift+M` | Start meeting |
| `Ctrl+Shift+S` | Summary |
| `Ctrl+K` | Command palette focus |
| `Esc` | Hide companion |

### Architecture
- **Main window** → Next.js `apps/web` (design source of truth, including redesigned landing) via `http://localhost:3000`
- **Companion window** → Vite React overlay in `apps/desktop/src` (always-on-top) via `:5173`
- **Preload** → secure `contextBridge` IPC (`window.cueDesktop` / `window.cueai`)
- **Tray** · global shortcuts · JSON settings store · electron-builder
- **Backend** → FastAPI clean architecture (`backend/app`)

## Build

```bash
npm run build:web
npm run build:desktop
npm run dist -w @cueai/desktop
```
