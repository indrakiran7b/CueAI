# License Implementation Report

## Architecture

```
CueAI Desktop (Windows / macOS)
        │ IPC (preload → main)
        ▼
apps/desktop/shared/licensing/service.ts
        │ HTTPS
        ▼
apps/web/src/app/api/license/*
        ▼
apps/web/.data/licenses.json
```

The server is authoritative. Desktop stores a **signed activation payload** locally (Keychain/DPAPI via Electron `safeStorage`). Offline use is allowed during `LICENSE_OFFLINE_GRACE_HOURS` (default 72) after the last successful validation.

**Note:** This repository uses a JSON file store (`licenses.json`), not PostgreSQL. No separate database was introduced.

---

## Backend

| Item | Location |
|------|----------|
| Models | `apps/web/src/lib/server/license-db.ts` |
| Crypto / hashing | `apps/web/src/lib/server/license-crypto.ts` |
| Business logic | `apps/web/src/lib/server/licenses.ts` |
| POST activate | `/api/license/activate` |
| POST validate | `/api/license/validate` |
| POST deactivate | `/api/license/deactivate` |
| GET status | `/api/license/status` |
| Admin generate/revoke | `/api/admin/licenses` |

License keys are stored as **SHA-256 hashes** only. Raw keys are returned once at generation time.

---

## Desktop

| Item | Location |
|------|----------|
| Shared service | `apps/desktop/shared/licensing/` |
| Windows integration | `apps/desktop/windows/electron/services/license-service.ts` |
| macOS integration | `apps/desktop/macos/electron/services/license-service.ts` |
| IPC channels | `LICENSE_*` in both `ipc/channels.ts` |
| Secure storage | `license.activation`, `license.device` in userData |
| Activation UI | `/license` (web shell, IPC-only activation) |
| Settings | Settings → License (`license-panel.tsx`) |

Enforcement: `LICENSE_ENFORCEMENT=true` or **automatic in packaged builds** when `LICENSE_SIGNING_PUBLIC_KEY` is set. Dev defaults to **off** unless explicitly enabled.

---

## Security

| Secret | Where |
|--------|--------|
| `LICENSE_SIGNING_PRIVATE_KEY` | Server only |
| `LICENSE_SIGNING_PUBLIC_KEY` | Server + desktop packaging |
| Raw license keys | Never stored server-side |

Generate keys: `npm run generate:license-keys`

Generate client license: `npm run generate:license -- --client "Client Name" --days 30 --devices 2`

---

## Environment variables

See `apps/web/.env.example`:

- `LICENSE_SIGNING_PRIVATE_KEY` — server signing (required for activation responses)
- `LICENSE_SIGNING_PUBLIC_KEY` — verification (desktop + server)
- `LICENSE_OFFLINE_GRACE_HOURS` — default 72
- `LICENSE_ENFORCEMENT` — `true` / `false`

---

## Commands

```bash
npm run generate:license-keys
npm run generate:license -- --client "Acme" --days 30 --devices 2
npm run test:licenses
npm run test:e2e:license
npm run build:web
npm run build:desktop
npm run build:desktop:mac
```

---

## Test results (2026-09-22)

| Area | Status |
|------|--------|
| Backend unit tests | **PASS** — `npm run test:licenses` (3/3) |
| Web production build | **PASS** |
| Windows desktop build | **PASS** |
| macOS desktop build | **NOT VERIFIED** — requires macOS for DMG; typecheck expected same as Windows |
| License E2E UI | **PASS** — `npm run test:e2e:license` (8/8); screenshots under `test-results/licenses/` |
| License API E2E | **PASS** — included in license E2E suite |

Screenshots (when E2E passes): `license-screen.png`, `license-invalid.png`, `license-valid.png`, `license-expired.png`, `license-device-limit.png`, `license-network-error.png`

---

## Client testing workflow

1. On server: set signing keys in `apps/web/.env.local`
2. Generate license: `npm run generate:license -- --client "Client Name" --days 30 --devices 2`
3. Deliver **license key only** to client (not private key)
4. Package desktop with `LICENSE_SIGNING_PUBLIC_KEY` and `LICENSE_ENFORCEMENT=true`
5. Client launches → `/license` → enters key → app unlocks
