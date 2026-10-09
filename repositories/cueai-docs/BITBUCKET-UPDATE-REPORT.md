# CueAI Bitbucket / GitHub update report

**Date:** 2026-10-09  
**Prepared from the actual working tree.** Secrets are not included.

## Current branch and remotes

### GitHub monorepo (repository root)

| Item | Value |
|------|--------|
| Branch | `separation` (tracks `origin/separation`) |
| Remote `origin` | `https://github.com/indrakiran7b/CueAI.git` |
| Unpushed commits before this work | none (`origin/separation..HEAD` empty) |
| Bitbucket remote on root | **none** — do not invent one |

### Bitbucket (nested repositories)

Each `repositories/cueai-*` folder that contains `.git` uses:

`https://bitbucket.org/wayfinderops/<repo>.git` on branch `main`.

Repos with **this batch of changes**:

- `repositories/cueai-web` → `cueai-web.git`
- `repositories/cueai-infra` → `cueai-infra.git`
- `repositories/cueai-docs` → `cueai-docs.git`

`cueai-api` / `cueai-desktop` had no intended source changes in this batch (`cueai-api` only had a gitignored `.data/` untracked tree).

## Changed files grouped by feature

### Google OAuth / session

- `repositories/cueai-web/src/auth.ts`
- `repositories/cueai-web/src/app/api/auth/[...nextauth]/route.ts`
- `repositories/cueai-web/src/lib/server/oauth-request-origin.ts` (new)
- `repositories/cueai-web/src/app/api/auth/providers/route.ts`
- `repositories/cueai-web/src/app/api/auth/oauth-sync/route.ts`
- `repositories/cueai-web/src/lib/server/oauth-link.ts` (new)
- `repositories/cueai-web/src/lib/oauth-complete.ts` (new)
- `repositories/cueai-web/src/app/auth/complete/page.tsx` (new)
- `repositories/cueai-web/src/app/login/page.tsx`
- `repositories/cueai-web/src/app/signup/page.tsx`
- `repositories/cueai-web/src/components/auth/social-auth-buttons.tsx`
- `repositories/cueai-web/src/components/providers/auth-provider.tsx`
- `repositories/cueai-web/src/components/admin/admin-login-form.tsx`
- `repositories/cueai-web/src/lib/auth.ts`
- `repositories/cueai-web/src/middleware.ts`
- `repositories/cueai-web/scripts/test-oauth-complete.mts` (new)
- `apps/web/src/auth.ts`
- `apps/web/src/app/api/auth/oauth-sync/route.ts`
- `apps/web/src/lib/server/oauth-link.ts` (new)
- `scripts/test-oauth-link.mjs` (new)

### Stripe billing

- `repositories/cueai-web/src/lib/server/billing.ts`
- `repositories/cueai-web/src/lib/server/billing-plans.ts`
- `repositories/cueai-web/src/lib/server/stripe.ts`
- `repositories/cueai-web/src/app/api/billing/checkout/route.ts`
- `repositories/cueai-web/src/app/api/billing/webhook/route.ts`
- `repositories/cueai-web/src/app/api/stripe/webhook/route.ts` (new alias)
- `repositories/cueai-web/src/lib/server/meetings.ts` (entitlement-related)
- `repositories/cueai-web/scripts/test-billing.mts` (new)
- `repositories/cueai-web/scripts/test-live-checkout.mts` (live helper; reads gitignored `.env.local` at runtime)
- `repositories/cueai-docs/BILLING-STRIPE.md`

### Docker / env templates

- `.env.example`
- `repositories/cueai-web/.env.example`
- `repositories/cueai-infra/.env.example`
- `repositories/cueai-infra/docker-compose.yml`
- `repositories/cueai-web/package.json` (`test:billing`, `test:oauth`)
- `repositories/cueai-web/tsconfig.json`

### Documentation (this update)

- `docs/FILE-BY-FILE-ARCHITECTURE.md`
- `docs/BITBUCKET-UPDATE-REPORT.md`
- copies under `repositories/cueai-docs/` for the Bitbucket docs remote

### Explicitly **not** staged

- `repositories/cueai-web/.env.local` (gitignored; real Google/Stripe secrets)
- `scripts/.last-meeting-api-test.json` (local test artifact)
- `repositories/cueai-api/.data/` (local data)

## Summary of modifications

1. Google OAuth uses NextAuth v5 (not Appwrite). Callback Host follows the browser (`localhost` vs `127.0.0.1`). Identity is bridged to the existing HMAC cookie `cueai_admin_session`. Email/password is unchanged. New Google users are role `User`.
2. Stripe Checkout/webhooks/portal live in Next.js. Free remains $0. Pro/Team monthly display defaults $5/$10. Price IDs and secrets come from env. Paid access requires a verified webhook.
3. Compose forwards Google and Stripe env into `web`/`api`.
4. Architecture documentation added.

## Tests actually executed

| Command | Result |
|---------|--------|
| `npm run test:billing` (cueai-web) | pass 15/15 |
| `npm run test:oauth` (cueai-web) | pass 1/1 |
| `node scripts/test-oauth-link.mjs` | pass |
| `npx tsc --noEmit` (cueai-web) | pass |
| `python -m pytest tests/test_health.py tests/test_auth_workspace.py tests/test_live_answer.py` (cueai-api) | pass 33 |
| `docker compose -f repositories/cueai-infra/docker-compose.yml config` | OK |

Not run: Playwright e2e, `next build`, live Stripe CLI webhook, full Google account-picker login, knowledge RAG pytest against Qdrant.

## Security checks performed

- Diff of `.env.example` files: empty placeholders only (`AUTH_GOOGLE_SECRET=`, commented `sk_test_...`).
- Grep of staged TypeScript for live `sk_live_`, `GOCSPX-`, long `whsec_` values: no matches in application source.
- `test-billing.mts` uses dummy `sk_test_cueai_billing_dummy` / `whsec_cueai_billing_test` (not live keys).
- Real credentials remain in gitignored `.env.local`.

No previously committed live secret was identified in this uncommitted diff. History-wide secret scanning was not performed.

## Configuration that must be supplied separately

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- Google Cloud authorized origins + redirect URIs (NextAuth callbacks, not Appwrite)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRO_PRICE_ID`
- `STRIPE_PRICE_TEAM_MONTHLY` / `STRIPE_TEAM_PRICE_ID`
- `APP_BASE_URL` or `AUTH_URL`
- Optional: Gemini/Groq, Qdrant, Keygate, license signing keys

## Known failures and incomplete work

- Google OAuth **browser consent was not completed** in this pass. Provider + generated `redirect_uri=http://localhost:3000/api/auth/callback/google` were verified via HTTP 302.
- `apps/web` is not the running local server.
- Nested Git + GitHub monorepo dual-tracking continues.
- `npm run test:licenses` documented in BILLING-STRIPE.md does not exist on `cueai-web/package.json`.

## Commit hashes

Filled after each successful commit:

| Repo | Branch | Commit |
|------|--------|--------|
| GitHub root `CueAI` | `separation` | *(pending GitHub commit)* |
| Bitbucket `cueai-web` | `main` | `90e9ddb793a83f4d4b47745860cbc24e3ec6903d` |
| Bitbucket `cueai-infra` | `main` | `92ed41cdbc45556239ad47f108c3a74e7e8914a8` |
| Bitbucket `cueai-docs` | `main` | `b11828f182df5acd09977abda9ba647d1ea88eae` (this docs commit; hash table updated in GitHub copy if needed) |

## Push result

| Remote | Result |
|--------|--------|
| GitHub `origin` (`separation`) | *(pending)* |
| Bitbucket `cueai-web` `main` | *(pending)* |
| Bitbucket `cueai-infra` `main` | *(pending)* |
| Bitbucket `cueai-docs` `main` | *(pending)* |
