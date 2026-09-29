# CueAI repository separation — cutover status

**Last updated:** 2026-03-29

## Current layout

| Tree | Role |
|------|------|
| **`apps/*`** | Legacy / pre-cutover source mirror. **Not deleted.** Still present for reference and tooling that has not moved. |
| **`repositories/cueai-*`** | **Separated Bitbucket repository boundaries.** Each folder maps 1:1 to a target Bitbucket remote. |
| **`apps/journiq/`** | Separate product; **not** one of the 15 CueAI Bitbucket repositories. |

## Runtime architecture (unchanged)

- **TypeScript BFF + UI:** `repositories/cueai-web` with domain code in `repositories/cueai-*-service` packages (linked via npm workspaces and `file:../` dependencies).
- **FastAPI + Celery Python:** **`repositories/cueai-api`** remains the **runtime owner** for knowledge, live answer, live screen, and related workers.
- **Service repos with `python/` folders:** **Migration ownership copies** for Bitbucket boundaries — not standalone Python services yet.

## Git / Bitbucket

- **No** separate Git repositories have been initialized under `repositories/cueai-*` for this cutover.
- **No** push to Bitbucket has been performed as part of separation validation.

## Monorepo root

Root `package.json` workspaces and scripts already target `repositories/cueai-web`, `repositories/cueai-desktop/*`, and `@cueai/*` service packages.

## Parent folder `repositories/` (not a 16th repo)

Loose files may exist **directly under** `repositories/` (sibling to the 15 folders). These are **accidental duplicates** from extraction and must **not** be treated as their own Bitbucket repository. Canonical copies live inside the named `cueai-*` folders. See `docs/bitbucket-separation-final-check.md` §5.

## Obsolete paths

See `OBSOLETE_APPS_PATHS.md` in this directory.
