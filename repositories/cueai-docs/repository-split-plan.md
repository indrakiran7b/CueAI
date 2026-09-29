# CueAI — repository split plan (Phase 2)

Proposed **final layout** for each Bitbucket repository under `repositories/`.  
Source of truth during migration: move from current `apps/*`, `docs/*`, `scripts/*`, `tools/*`, `tests/*` without rewriting implementations.

---

## cueai-docs/

```
cueai-docs/
  README.md
  architecture/
    BACKEND-MIGRATION.md          ← docs/architecture/
  knowledge/
    RAG.md                        ← docs/knowledge/
  BILLING-STRIPE.md
  LICENSE-IMPLEMENTATION.md
  KEYGATE-INTEGRATION.md
  RESTRUCTURE-MIGRATION.md
  repository-split-analysis.md    ← this effort
  repository-split-plan.md
  repository-split-validation.md
  handover/                       ← future; scripts/prepare-client-handoff outputs documented here
  apps/
    web/CLAUDE.md                 ← optional copy of app-specific doc pointers
    desktop/macos/README.md
    api/README.md
```

---

## cueai-infra/

```
cueai-infra/
  README.md
  docker-compose.yml              ← postgres, redis, celery-worker, qdrant, keycloak
  keycloak/
    cueai-realm.json
  scripts/
    prepare-cloud-deploy.cjs
    prepare-client-handoff.cjs
    client-env.example
  kubernetes/                     ← empty placeholder until manifests exist
  terraform/                      ← empty placeholder
```

**docker-compose** build context after split:

```yaml
celery-worker:
  build:
    context: ../cueai-api
    dockerfile: Dockerfile.worker
```

---

## cueai-shared-libraries/

```
cueai-shared-libraries/
  package.json                    # @cueai/shared-libraries
  tsconfig.json
  src/
    licensing/                    ← apps/desktop/shared/licensing/*
    poll-job.ts                   ← merge decision: desktop/shared canonical
    roles.ts                      ← apps/web/src/lib/roles.ts
    rag/
      types.ts                    ← apps/web/src/lib/server/rag/types.ts
  python/                         # optional future: shared Pydantic models
    README.md
```

---

## cueai-notification-service/

```
cueai-notification-service/
  package.json
  tsconfig.json
  src/
    email.ts                      ← apps/web/src/lib/server/email.ts
    routes/
      notifications/
        route.ts                  ← apps/web/src/app/api/notifications/route.ts
  README.md
```

---

## cueai-translation-service/

```
cueai-translation-service/
  package.json
  tsconfig.json
  src/
    translate.ts
    translate-request.ts          ← apps/web/src/lib/server/
    routes/
      translate/route.ts
      admin-translate/route.ts    ← admin/translate
  python/
    access_policies.py            ← excerpt or import from api live/access.py (REVIEW)
  README.md
```

---

## cueai-export-service/

```
cueai-export-service/
  package.json
  tsconfig.json
  src/
    exportDocument.ts             ← apps/web/src/lib/exportDocument.ts
  README.md                       ← document coupling to resume/knowledge UI
```

---

## cueai-resume-service/

```
cueai-resume-service/
  package.json
  tsconfig.json
  src/
    applyResumeRewrites.ts
    extract-document.ts           ← only if not shared (REVIEW)
    routes/
      analyze/route.ts
      extract/route.ts
  README.md
```

**cueai-web** retains: `src/components/resume/*`, `src/app/resume-tailor/**`, `src/lib/resume-store.ts` (UI state).

---

## cueai-knowledge-service/

```
cueai-knowledge-service/
  package.json
  tsconfig.json
  src/
    knowledge-retrieve.ts
    knowledge-store.ts            ← client store if service-only
    rag/                          ← entire apps/web/src/lib/server/rag/*
    routes/
      admin/knowledge/**          ← mirrored route handlers
      meetings/knowledge/route.ts
  python/
    app/
      modules/knowledge/**        ← apps/api/app/modules/knowledge/*
  tests/
    rag/**                        ← tests/rag/*
  fixtures/
    test_knowledge/**             ← test_knowledge/*
  README.md
```

---

## cueai-screen-context-service/

```
cueai-screen-context-service/
  package.json
  tsconfig.json
  src/
    screen-context.ts
    qwen-vl.ts                    ← client to sidecar
    routes/
      live/screen/route.ts
  python/
    app/
      modules/live/screen_*.py
      tasks/vision.py             ← Celery task (worker colocated with api or here)
  tools/
    qwen-vl/                      ← tools/qwen-vl/*
  README.md
```

---

## cueai-transcription-service/

```
cueai-transcription-service/
  package.json
  tsconfig.json
  src/
    groq-transcribe.ts            ← extract from groq.ts if split (REVIEW)
    routes/
      transcribe/route.ts
  README.md
```

---

## cueai-ai-orchestrator/

```
cueai-ai-orchestrator/
  package.json
  tsconfig.json
  src/
    gemini.ts
    groq.ts
    llm-generate.ts
    ai-config.ts
    credential-resolver.ts
  python/
    app/modules/live/
      answer_service.py
      providers.py
      gemini.py
      prompts.py
      context.py                  ← shared with api live router (REVIEW)
  llm-benchmark/                  ← full tree
  README.md
```

---

## cueai-gateway/

```
cueai-gateway/
  README.md                       ← stub: no standalone gateway code yet
  docs/
    TARGET.md                     ← maps middleware.ts + fastapi-proxy future state
  src/
    fastapi-proxy.ts              ← optional move from web (REVIEW — may stay in web BFF)
```

**Phase 1 deliverable:** documentation-only repo until Kong/Envoy/FastAPI gateway is implemented.

---

## cueai-api/

```
cueai-api/
  README.md
  requirements.txt
  pytest.ini
  .env.example
  Dockerfile.worker
  alembic/
  app/
    main.py
    api/deps.py
    core/
    db/
    persistence/
    modules/
      auth/
      workspace/
      onboarding/
      entitlements/
      license/
      jobs/
    services/
    tasks/health.py
  tests/                          ← api-specific tests + licenses/billing node tests (REVIEW)
  scripts/
    run-celery-worker.cjs
    verify-celery-task.cjs
    test-api.cjs
    generate-license-keys.mjs
    generate-license.mjs
```

**Imports after split:** `app.modules.knowledge` → dependency on `cueai-knowledge-service` Python package; `live.router` composes orchestrator + screen services.

---

## cueai-desktop/

```
cueai-desktop/
  package.json                    # workspaces: windows, macos
  windows/                        ← apps/desktop/windows
  macos/                          ← apps/desktop/macos
  shared/                         ← until published from shared-libraries (path dep)
  build-resources/
  src/types/companion.ts          ← apps/desktop/src
  scripts/
    dev-windows.cjs
    dev-mac.cjs
    prepare-desktop-web.cjs
    assert-macos-packaging.cjs
    generate-mac-icon.mjs
    e2e-desktop-bridge.mjs
    launch-client-desktop.ps1
  README.md
```

Root orchestrator `package.json` may reference:

```json
"workspaces": [
  "repositories/cueai-web",
  "repositories/cueai-desktop/windows",
  "repositories/cueai-desktop/macos"
]
```

---

## cueai-web/

```
cueai-web/
  package.json                    # @cueai/web
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  middleware.ts
  auth.ts
  public/
  src/
    app/                          # pages; api/ routes = thin re-exports where extracted
    components/
    lib/                          # UI helpers; server/ shrinks as services extract
  tests/
    web/e2e/                      ← Playwright specs
  playwright.config.ts            ← or root pointer
  README.md
```

**Dependency example (path-only):**

```json
"dependencies": {
  "@cueai/resume-service": "file:../cueai-resume-service",
  "@cueai/shared-libraries": "file:../cueai-shared-libraries"
}
```

---

## Migration sequencing (Phase 4)

1. Create `repositories/` and empty repo roots + README stubs.
2. **git mv** `docs/` → `repositories/cueai-docs/` (keep copy in docs/ via move).
3. **git mv** infra files → `repositories/cueai-infra/`.
4. **git mv** `apps/desktop` → `repositories/cueai-desktop/`.
5. **git mv** `apps/web` → `repositories/cueai-web/`.
6. **git mv** `apps/api` → `repositories/cueai-api/`.
7. Extract service subtrees into respective `repositories/cueai-*-service/` (Python/TS).
8. Update root `package.json` workspaces, docker-compose context, script paths.
9. Add minimal `package.json` / `pyproject.toml` per service **without** version bumps.
10. Run validation commands; document failures in `repository-split-validation.md`.

---

## Duplication policy

- **Never** duplicate business logic in two repos.
- **Allowed:** thin `route.ts` re-exports in cueai-web pointing at service package.
- **Shared:** one copy in cueai-shared-libraries; consumers use npm `file:` links until Bitbucket publish.

---

## Mapping table (summary)

See `docs/repository-split-validation.md` for the full **SOURCE | TARGET | REASON | PATH CHANGES** table after moves complete.
