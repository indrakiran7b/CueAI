# CueAI

Monorepo layout:

| Path | Stack | Role |
|------|--------|------|
| `apps/web` | Next.js + Tailwind | Web app, admin, API routes, JSON persistence (`.data/`) |
| `apps/desktop/windows` | Electron + React + Vite | Windows desktop shell + floating companion |
| `apps/desktop/macos` | Electron + React + Vite | macOS menu-bar companion + native HUD |
| `apps/desktop/shared` | — | Cross-platform desktop build resources (embedded web bundle) |
| `tests/web/e2e` | Playwright | Web E2E and AI provider tests |

There is no separate FastAPI backend in this repo — REST APIs live under `apps/web/src/app/api/`.

## Development

### Web

```bash
npm run dev:web
```

### Windows desktop

One command (starts web + Electron together):

```bash
npm run dev:desktop
```

Web-only (browser, no Electron):

```bash
npm run dev:web
```

Electron-only when web is already running on `:3000`:

```bash
npm run dev:desktop:electron
```

### macOS desktop

```bash
npm run dev:mac
```

Starts Next.js on `127.0.0.1:3002` (unless already running) and the macOS Electron app.

### Desktop shortcuts (Windows)

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Space` | Toggle companion |
| `Ctrl+Shift+C` | Show companion |
| `Ctrl+Shift+M` | Start meeting |
| `Ctrl+Shift+S` | Summary |
| `Ctrl+K` | Command palette focus |
| `Esc` | Hide companion |

### Architecture

- **Main window** → Next.js `apps/web` via `http://localhost:3000` (Windows) or `:3002` (macOS dev)
- **Companion overlay** → Vite React in each desktop app (`:15174` Windows, `:15175` macOS)
- **Preload** → secure `contextBridge` IPC (`window.cueDesktop` / `window.cueai`)
- **API / persistence** → Next.js route handlers in `apps/web/src/app/api/` and `apps/web/src/lib/server/`

## Build

```bash
npm run build:web
npm run build:desktop          # Windows
npm run build:desktop:mac      # macOS
npm run dist:desktop           # Windows portable (after web build + prepare-desktop-web)
npm run dist:mac               # macOS DMG (macOS only)
```

## Tests

```bash
npm run lint
npm run test:e2e
npm run test:e2e:ai-providers
```

See `docs/RESTRUCTURE-MIGRATION.md` for the repository layout migration report.
