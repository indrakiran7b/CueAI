# Repository Restructure — Migration Report

Completed: 2026-09-22

## Summary

CueAI was reorganized from a mixed web/desktop/mobile layout into a monorepo with isolated **web**, **Windows desktop**, **macOS desktop**, **shared desktop resources**, and **web tests**. Android/Capacitor/mobile code was removed. The API/backend remains in `apps/web` (Next.js route handlers + `src/lib/server/`) — there is no separate FastAPI `backend/` directory in this repository.

---

## Old folder structure (before)

```
cueai-android/
├── android/                    # Capacitor Android (removed)
├── mac/                        # Duplicate Android Gradle (removed)
├── src/                        # Capacitor Vite mobile UI (removed)
├── public/                     # Mobile Vite assets (removed)
├── e2e/                        # Playwright (duplicate, removed)
├── stitch-export/              # Android Stitch prompts (removed)
├── apps/
│   ├── web/                    # Next.js + API
│   ├── desktop/                # Windows Electron (flat)
│   └── desktop-mac/            # macOS Electron (later merged to desktop/macos)
├── capacitor.config.ts         # (removed)
├── vite.config.ts              # Mobile root Vite (removed)
└── playwright.config.ts        # testDir: ./e2e
```

## New folder structure (after)

```
cueai-android/
├── apps/
│   ├── web/                    # Web app + API + persistence
│   └── desktop/
│       ├── windows/            # Windows Electron + companion
│       ├── macos/              # macOS Electron + native HUD
│       └── shared/             # Embedded web bundle (build-resources)
├── tests/
│   └── web/e2e/                # Playwright web E2E
├── scripts/                    # prepare-desktop-web, dev-mac, etc.
├── docs/
│   └── RESTRUCTURE-MIGRATION.md
├── keycloak/
├── tools/
├── package.json                # workspaces: web, desktop/windows, desktop/macos
└── playwright.config.ts        # testDir: ./tests/web/e2e
```

---

## Files / folders moved

| From | To |
|------|-----|
| `apps/desktop/*` (Windows app) | `apps/desktop/windows/` |
| `apps/desktop-mac/*` | `apps/desktop/macos/` (partial move in prior session; `desktop-mac` removed) |
| `apps/desktop/build-resources/` | `apps/desktop/shared/build-resources/` |
| `e2e/*` | `tests/web/e2e/` (canonical; root `e2e/` deleted) |

## Android / mobile removed

| Removed | Notes |
|---------|--------|
| `android/` | Gradle / APK build tree |
| `mac/` | Duplicate Android project |
| `src/` | Capacitor mobile UI |
| `capacitor.config.ts`, root `vite.config.ts`, `index.html` | Mobile build entry |
| `stitch-export/` | Android UI prompt packs |
| `scripts/capture-stitch.mjs` | Android prototype capture |
| Keycloak client `cueai-android` | Renamed to `cueai-web` |

**Not removed:** transitive npm optional packages (`@esbuild/android-*`, etc.) in `package-lock.json` — these are toolchain artifacts, not CueAI Android UI.

## Platform-specific desktop files

### Windows (`apps/desktop/windows/`)

- Electron main/preload, overlay window manager, Windows loopback audio, `SetWindowDisplayAffinity` capture exclusion, portable/setup electron-builder configs, live AI pipeline services (question detection, PCM, screen context).

### macOS (`apps/desktop/macos/`)

- `electron/platform/macos/*` (permissions, capture, audio, device, content protection)
- `electron/menu/app-menu.ts`, macOS companion window, DMG/entitlements in `build/`

### Shared desktop (`apps/desktop/shared/`)

- `build-resources/web/` — Next.js standalone bundle for packaged Electron builds
- README documenting future shared-code extraction candidates (store, protocol, shortcuts, etc.)

## Web

- Unchanged location: `apps/web/`
- Contains all REST/API routes under `src/app/api/` and server logic under `src/lib/server/`

## Backend

No standalone `backend/` package. Production API and JSON store:

- `apps/web/src/app/api/**`
- `apps/web/src/lib/server/**`
- Data directory: `apps/web/.data/` (or `CUEAI_DATA_DIR`)

## Test organization

| Path | Runner |
|------|--------|
| `tests/web/e2e/` | Playwright (root `playwright.config.ts`) |

## package.json / workspace changes

```json
"workspaces": [
  "apps/web",
  "apps/desktop/windows",
  "apps/desktop/macos"
]
```

Scripts still use workspace names `@cueai/desktop` (Windows) and `@cueai/desktop-mac` (macOS).

## Configuration changes

| File | Change |
|------|--------|
| `playwright.config.ts` | `testDir` → `./tests/web/e2e` |
| `scripts/prepare-desktop-web.cjs` | Output → `apps/desktop/shared/build-resources/web` |
| `scripts/dev-mac.cjs` | CWD → `apps/desktop/macos` |
| `scripts/generate-mac-icon.mjs` | Output → `apps/desktop/macos/build/icon.png` |
| `.github/workflows/macos-dmg.yml` | Artifacts → `apps/desktop/macos/release/` |
| `.gitignore` | Release + build-resources paths updated |
| `apps/web/tsconfig.json` | Exclude `_local_backup` |
| `apps/web/eslint.config.mjs` | Ignore `_local_backup/**` |
| `README.md` | Reflects new layout; removed stale FastAPI backend instructions |

## Import / path changes

No application import rewrites were required for the desktop folder move — each platform app remains self-contained with relative Vite/Electron paths. Cross-app reference updates:

- macOS `extraResources` → `../shared/build-resources/web`
- Windows `extraResources` + electron-builder YAML → `../shared/build-resources/web`

## Commands executed

```bash
npm install
npm run build:web          # PASS
npm run build:desktop      # PASS (Windows)
npm run typecheck          # PASS (windows + macos workspaces)
node scripts/prepare-desktop-web.cjs  # PASS
npm run lint               # FAIL (31 pre-existing ESLint errors in apps/web)
npm run test:e2e:ai-providers  # 24 passed, 1 failed, 8 skipped (see below)
```

---

## Final status

| Area | Status | Notes |
|------|--------|-------|
| Web | **PASS** | `npm run build:web` succeeded |
| Windows Desktop | **PASS** | `npm run build:desktop` + typecheck succeeded |
| macOS Desktop | **NOT VERIFIED — requires macOS** | typecheck PASS on Windows; `dist:mac` blocked by design on Windows |
| Backend | **PASS** | Built as part of Next.js; routes compile |
| AI Providers | **PARTIAL** | API tests passed; 1 visual test failed (missing groq provider in E2E store) |
| OpenRouter | **NOT RUN** | No dedicated script found |
| Fallback | **NOT RUN** | Covered partially in ai-providers suite |
| BYOK | **NOT RUN** | No dedicated script found |
| Android Removal | **PASS** | No `android/`, Capacitor, or mobile UI remains |
| Typecheck | **PASS** | Web build TS + both desktop workspaces |
| Lint | **FAIL** | 31 errors, 8 warnings (pre-existing react-hooks / Next.js lint rules) |
| E2E | **PARTIAL** | 24/25 executed AI provider tests passed |
| Production Build | **PASS** | Web + Windows desktop production builds |

---

## Remaining warnings / follow-ups

1. **Shared desktop code extraction** — Identical modules (store, protocol, shortcuts, updater) remain duplicated in `windows/` and `macos/`; consolidate into `apps/desktop/shared/` when ready.
2. **`packages/shared` / `packages/ai`** — Not created; web and desktop still own their types. Extract when cross-app imports are needed.
3. **Stale `package-lock.json` entries** — Orphan `apps/desktop` and `apps/desktop-mac` workspace stubs may remain; harmless but can be cleaned with a fresh `npm install` after deleting `node_modules`.
4. **Lint debt** — 31 ESLint errors pre-date this migration (`react-hooks/set-state-in-effect`, etc.).
5. **E2E visual test** — `switch default model between providers` failed when `groq` provider missing from admin config (test data isolation).

---

## Verification checklist

- [x] No Android UI or Gradle build files
- [x] Web does not import Electron/desktop-only modules in browser components (unchanged)
- [x] Windows and macOS desktop separated under `apps/desktop/{windows,macos}`
- [x] Shared build bundle at `apps/desktop/shared/build-resources`
- [x] Playwright tests under `tests/web/e2e`
- [x] Root scripts and CI paths updated
