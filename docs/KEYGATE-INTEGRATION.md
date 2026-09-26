# Keygate Integration (CueAI) — production

## Architecture

```
Windows / macOS desktop
        │  license key + stable device identity (secure store)
        ▼
CueAI Backend  (Next.js /api/license/*)
        │  server-to-server (no admin key in clients)
        ▼
Keygate (/api/v1/license/*)
```

**Incorrect:** Desktop → Keygate with `KEYGATE_SERVER_API_KEY`.

Mac Lock (`/api/devices/*`) remains a **separate** account-device trust layer after license + login.

---

## Environment (CueAI server host only)

```bash
# Required for Keygate as primary provider
KEYGATE_BASE_URL=https://your-keygate.example.com

# Optional admin automation (never ship to desktop)
KEYGATE_SERVER_API_KEY=kg_live_...
# alias:
KEYGATE_API_KEY=kg_live_...

KEYGATE_PRODUCT_ID=
KEYGATE_PUBLIC_KEY=   # optional hex pubkey for Keygate token verification

# CueAI offline desktop tokens (Ed25519)
LICENSE_SIGNING_PRIVATE_KEY=
LICENSE_SIGNING_PUBLIC_KEY=

# Packaged Windows/macOS clients
LICENSE_ENFORCEMENT=true
LICENSE_OFFLINE_GRACE_HOURS=72
```

Development: omit `KEYGATE_BASE_URL` and/or set `LICENSE_ENFORCEMENT=false` to use local `licenses.json` / skip desktop gate.

---

## Endpoints (CueAI)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/license/activate` | Activate + register device |
| POST | `/api/license/verify` | Alias of validate |
| POST | `/api/license/validate` | Verify + refresh signed payload |
| POST | `/api/license/device/register` | Alias of activate |
| POST | `/api/license/deactivate` | Free device slot |
| GET | `/api/license/status` | Status |
| GET/POST | `/api/license/entitlements` | Plan + features |

FastAPI mirror: `/v1/license/*`.

---

## Desktop enforcement

- Dev: `LICENSE_ENFORCEMENT=false` → opens CueAI without license gate.
- Packaged: `LICENSE_ENFORCEMENT=true` (or packaged + public key present) → online startup check via `resolveStartupPath()`; invalid/expired/revoked → `/license` only.
- Device ID: persistent UUID in `license.device` (Keychain/DPAPI via `safeStorage`).

---

## Remaining ops

1. Deploy Keygate and set `KEYGATE_BASE_URL` on the CueAI host.
2. Create product/plans and mint license keys in Keygate.
3. Generate CueAI signing keys: `npm run generate:license-keys`.
4. Ship desktop with `LICENSE_SIGNING_PUBLIC_KEY` + `LICENSE_ENFORCEMENT=true` (see `scripts/client-env.example`).
5. Run live activate/verify on Windows and macOS against that Keygate.

Until Keygate is reachable, local licensing remains the fallback.

## Billing bridge (Stripe → Keygate)

Paid subscriptions are handled by CueAI Stripe webhooks (`/api/billing/webhook`).
After a verified `active`/`trialing` subscription, CueAI may call `keygateAdminCreateLicense`
/ `keygateAdminSetLicenseStatus` using server-side `KEYGATE_SERVER_API_KEY` only.

See `docs/BILLING-STRIPE.md`.
