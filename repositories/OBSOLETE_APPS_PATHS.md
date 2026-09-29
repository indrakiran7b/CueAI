# Obsolete monorepo paths (post-separation)

**Canonical application code:** `repositories/cueai-*`  
**Active npm workspaces:** root `package.json` → `repositories/cueai-web`, `repositories/cueai-desktop/*`, and `@cueai/*` service packages.

The following paths are **legacy mirrors** and are **not** updated by the separation cutover:

- `apps/web/`
- `apps/api/`
- `apps/desktop/`

Do **not** delete until you confirm no external tooling still references `apps/*`.

**Untouched (non-CueAI):** `apps/journiq/`
