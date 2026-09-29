# CueAI Stripe Billing Integration

## Architecture

```
Customer → /pricing|/billing → CueAI POST /api/billing/checkout
        → Stripe Checkout (cards, Apple Pay, ACH when enabled)
        → Stripe webhooks → POST /api/billing/webhook
        → CueAI subscription + entitlements
        → Keygate license mint / suspend (existing keygate.ts)
        → Windows / macOS via /api/license/* (unchanged)
```

**Stripe** = payment, subscription, invoices  
**CueAI** = account, plan mapping, entitlements, webhook idempotency  
**Keygate** = license + device authorization (never called from Electron with admin keys)

## Environment

See `apps/web/.env.example`. Required before production checkout works:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-only Stripe secret |
| `STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable (safe for browser) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRICE_PRO_MONTHLY` etc. | Price IDs from Stripe Dashboard |
| `KEYGATE_BASE_URL` + admin key | Optional post-payment license mint |
| `KEYGATE_PLAN_ID_PRO` / `KEYGATE_PLAN_ID_TEAM` | Keygate plan ids for minting |
| `TRIAL_DAYS` | Optional trial (0 = off) |

## Local webhook forwarding

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET`.

Checkout success URL: `/billing/success`  
Checkout cancel URL: `/billing/cancelled`

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/billing/catalog` | Public |
| GET | `/api/billing/subscription` | Session |
| GET/POST | `/api/billing/status` | Session |
| POST | `/api/billing/checkout` | Session (`planId` and/or `price_id`) |
| POST | `/api/billing/portal` | Session |
| POST | `/api/billing/webhook` | Stripe signature |
| GET | `/api/admin/billing` | `usage.read` |

## UI

- `/pricing` — plan picker + checkout (optional marketing entry)
- `/settings#billing` — primary Billing UI (Settings → Billing)
- `/billing` — retained route (not in main sidebar); Stripe success/cancel under `/billing/success` and `/billing/cancelled`
- Header **Upgrade** / **Manage Plan** → `/settings#billing`

Admin Portal does **not** include a Billing tab. License/device admin remains under Licenses / Mac devices.

## Tests

```bash
npm run test:billing
npm run test:licenses
```
