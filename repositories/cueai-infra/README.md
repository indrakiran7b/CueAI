# cueai-infra

Docker Compose, Keycloak realm import, and deployment scripts for CueAI.

- **Compose:** `docker-compose.yml` — Redis, Qdrant, FastAPI (`cueai-api`), Next (`cueai-web`), Celery worker, optional Postgres, optional Keycloak.
- **Env names:** copy `.env.example` to `.env`.
- **Runtime map:** [RUNTIME.md](./RUNTIME.md) (actual process graph, not 15 HTTP services).
