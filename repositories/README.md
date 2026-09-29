# CueAI — 15 Bitbucket repository layout

**Canonical application code lives here.** Root npm workspaces and dev scripts target `repositories/cueai-*`.

| Repository | Role |
|------------|------|
| cueai-web | Next.js UI + BFF (thin re-exports to services) |
| cueai-api | FastAPI core |
| cueai-desktop | Electron (Windows + macOS) |
| cueai-docs | Documentation |
| cueai-infra | Docker Compose, Keycloak, deploy scripts |
| cueai-shared-libraries | Shared TS utilities (licensing, extract-document, roles) |
| cueai-*-service | Extracted domain implementations |
| cueai-gateway | Reference only (no standalone gateway yet) |

Legacy **`apps/*`** is obsolete — see `OBSOLETE_APPS_PATHS.md`.  
**`apps/journiq/`** is not part of CueAI.

Docs: `docs/final-repository-separation-plan.md`, `docs/final-repository-separation-validation.md`.
