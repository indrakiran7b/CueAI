# cueai-gateway

**Gateway implementation not present as a standalone service in the current source.**

This repository holds:

- `src/fastapi-proxy.ts` — Next.js BFF helper that forwards requests to FastAPI when `CUEAI_USE_FASTAPI` is enabled.
- `src/middleware-reference.ts` — copy of edge session routing from `@cueai/web` (reference only).

There is **no** dedicated API gateway process, rate limiter, or Kong/Envoy configuration in the codebase today.

When a standalone gateway is introduced, migrate proxy/middleware concerns here without changing HTTP contracts.
