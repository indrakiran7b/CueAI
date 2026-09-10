# CueAI Tech Stack - App and Platform

Source: Confluence space CueAI (wayfinderops.atlassian.net)  
Exported for NotebookLM

---

# CueAI Tech Stack - App and Platform

> Parent page for CueAI MVP v1.0 application stack, platform stack, deployment tools, and environment decisions.

## Purpose

This page defines the final technology stack split for CueAI MVP v1.0.

The stack is divided into:

1. Application Tech Stack
2. Platform Tech Stack

## Clickable Child Page Index

| # | Page | Purpose |
| --- | --- | --- |
| 01 | CueAI App Tech Stack | Developer-facing stack for desktop app, web dashboard, backend, AI, resume tailor, and OCR |
| 02 | CueAI Platform Tech Stack | DevOps/platform stack for RKE2, Hetzner, on-prem, ingress, CI/CD, database, monitoring, logging, and secrets |
| 03 | Official Website Links | Official documentation links for all stack technologies |
| 04 | Final Engineering Decisions | Locked MVP engineering decisions, exclusions, rules, and Sprint 0 tasks |

## Final High-Level Stack

| Area | Final Decision | Usage |
| --- | --- | --- |
| Desktop App | Electron + React + TypeScript | Floating overlay, live copilot, hotkeys, screen/audio capture |
| Web App | Next.js + TypeScript + Tailwind CSS | User dashboard, admin portal, Resume Tailor, settings |
| Backend API | Python FastAPI | REST APIs, WebSocket, AI router, session management |
| Database | PostgreSQL + pgvector | Application data, vector search, knowledge base embeddings |
| PostgreSQL Operator | StackGres | PostgreSQL on RKE2 with backup/HA path |
| Queue | Redis + Celery | Background jobs, document processing, resume processing |
| File Storage | MinIO / S3-compatible storage | Resume files, knowledge documents, exports, backups |
| Authentication | Keycloak OIDC/OAuth2 | Login, roles, future SSO path |
| AI Provider | Grok primary, OpenAI fallback | Live answers, summaries, resume rewrite, screen understanding |
| Kubernetes | RKE2 | Hetzner and on-prem deployment |
| CI/CD | Bitbucket + Jenkins + Docker Hub + Helm | Build, push, deploy |
| Secrets | Sealed Secrets | Encrypted Kubernetes secrets stored in Git |
| Monitoring | Prometheus + Grafana, 1-day retention | Metrics and dashboards for dev/MVP |
| Logs | Loki + Promtail, 1-day retention | Application and platform logs |

## Key Decisions

* Use Grok as the primary AI provider for development.
* Keep OpenAI as fallback for quality-sensitive tasks.
* Use Keycloak instead of custom JWT-only auth.
* Use StackGres for PostgreSQL on RKE2.
* Use MinIO for MVP object storage unless Hetzner Object Storage is selected later.
* Use Docker Hub as image registry.
* Use GoDaddy for domain/DNS management.
* Use Jenkins and Helm for deployment now.
* Add Argo CD later only if GitOps is needed.
* Skip NetworkPolicy for dev MVP; add later for production hardening.

## Next Steps

* Review App Tech Stack page.
* Review Platform Tech Stack page.
* Confirm versions with the technical team.
* Create Jenkins pipelines.
* Create Helm charts.
* Prepare RKE2 environment.
* Install StackGres, Keycloak, MinIO, Redis, monitoring, logging, and Sealed Secrets.

---

# 01 - CueAI App Tech Stack

## Purpose

This page defines the developer-facing application technology stack for CueAI MVP v1.0.

## Application Stack Table

| Component | Technology | Version / Target | Product Usage | Environment | Notes |
| --- | --- | --- | --- | --- | --- |
| Desktop App | Electron | Latest stable | Windows desktop app, floating overlay, hotkeys, screen/audio capture | Dev, Staging, Prod | Tauri can be evaluated after MVP |
| Desktop UI | React | Latest stable | Desktop app UI and assistant overlay | Dev, Staging, Prod | Shared components possible with web app |
| Desktop Language | TypeScript | Latest stable | Type-safe desktop app development | Dev, Staging, Prod | Required for maintainability |
| Web Dashboard | Next.js | Latest stable | User dashboard, admin dashboard, Resume Tailor, settings | Dev, Staging, Prod | App Router preferred |
| Web UI Styling | Tailwind CSS | Latest stable | Responsive dashboard UI | Dev, Staging, Prod | Use shared design system |
| Backend API | Python FastAPI | Latest stable | REST APIs, WebSocket, AI router, session management | Dev, Staging, Prod | Auto OpenAPI docs |
| API Protocol | REST + WebSocket | HTTP/WebSocket | Live session, transcript updates, AI responses | Dev, Staging, Prod | WebSocket for live features |
| Worker | Celery | Latest stable | Background jobs, document processing, resume processing | Dev, Staging, Prod | Runs separately from API |
| Queue Client | Redis client | Latest stable | Worker queue and short-lived cache | Dev, Staging, Prod | Connects to platform Redis |
| Database Client | SQLAlchemy / asyncpg | Latest stable | PostgreSQL database access | Dev, Staging, Prod | Alembic for migrations |
| DB Migration | Alembic | Latest stable | Schema migrations | Dev, Staging, Prod | Required for release process |
| Vector Search | pgvector integration | PostgreSQL extension | Knowledge base embeddings and RAG search | Dev, Staging, Prod | Runs inside PostgreSQL |
| Auth Integration | Keycloak OIDC/OAuth2 | Current Keycloak version | Login, roles, token validation | Dev, Staging, Prod | Backend validates JWT from Keycloak |
| AI Provider | Grok | Current API model | Primary AI answers, summaries, resume rewrite | Dev, Staging, Prod | Primary model for cost optimization |
| AI Fallback | OpenAI | Current API model | Fallback/premium quality tasks | Dev, Staging, Prod | Keep provider router generic |
| Future AI Providers | Gemini / Claude / Local LLM | Later | Optional future provider support | Phase 2 | Provider router must support expansion |
| Transcription | Grok/xAI STT or OpenAI Whisper | Benchmark required | Audio transcription | Sprint 0 POC | Choose based on quality, latency, cost |
| OCR | Tesseract OCR | Latest stable | Basic screen text extraction | P0 | Used for manual Analyze Screen |
| Vision AI | Grok Vision / OpenAI Vision | Benchmark required | Advanced screen understanding | P1 | For slides, dashboards, screenshots |
| Resume Parsing | Python PDF/DOCX libraries | Latest stable | Extract resume and JD content | Dev, Staging, Prod | Use pypdf/pdfplumber/python-docx |
| Resume Rewrite | Grok primary, OpenAI fallback | Current API model | Resume-to-JD rewrite and ATS optimization | Dev, Staging, Prod | Must use user-provided facts |
| Resume Export | python-docx + PDF export | Latest stable | Export DOCX/PDF resume | Dev, Staging, Prod | PDF export can use HTML/PDF service |
| File SDK | S3-compatible SDK | Latest stable | Upload/download resumes, docs, exports | Dev, Staging, Prod | Works with MinIO/Hetzner/S3 |
| Testing | Pytest | Latest stable | Backend unit/integration tests | Dev/CI | Required in pipeline |
| Web Testing | Playwright / Vitest | Latest stable | Web UI tests | Dev/CI | Start with smoke tests |
| Package Format | Docker images | OCI image | API, web, worker packaging | CI/CD | Pushed to Docker Hub |

## Main Application Modules

| Module | Main Technologies | Product Usage |
| --- | --- | --- |
| Live Copilot | Electron, FastAPI, WebSocket, Grok | Live AI answer cards during meetings |
| Visual Screen Context | Electron screen capture, Tesseract, Grok/OpenAI Vision | Read visible screen content with permission |
| Meeting Notes | FastAPI, Celery, Grok, PostgreSQL | Summaries, action items, follow-up drafts |
| Knowledge Base | FastAPI, pgvector, PostgreSQL, MinIO | Upload docs and answer from company knowledge |
| Resume Tailor | FastAPI, Celery, Grok, python-docx | Resume rewrite based on job description |
| Admin Dashboard | Next.js, Keycloak, FastAPI | Users, settings, usage, provider config |

## App Stack Decisions

* Use Electron for MVP desktop app.
* Use Next.js for web and admin dashboard.
* Use FastAPI for backend APIs.
* Use Grok as primary AI provider.
* Keep OpenAI as fallback.
* Use Keycloak tokens for auth.
* Use PostgreSQL + pgvector for app data and vector search.
* Use Redis + Celery for background jobs.
* Use S3-compatible file APIs for storage.

## Sprint 0 Validation Items

* Desktop overlay and hotkey POC
* Microphone and system audio capture POC
* WebSocket transcript streaming POC
* Grok API integration POC
* Screen OCR POC
* Resume Tailor POC
* Keycloak login integration POC

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| System audio capture differs by OS | High | Validate early in Sprint 0 |
| AI latency may affect live answers | High | Use streaming and optimize prompts |
| OCR quality may vary | Medium | Start with manual Analyze Screen and improve later |
| Resume formatting may be complex | Medium | DOCX first, PDF later if needed |
| Provider cost may vary | Medium | Track token usage per workspace/user |

---

# 02 - CueAI Platform Tech Stack

## Purpose

This page defines the DevOps and platform technology stack for deploying CueAI MVP v1.0 on RKE2, Hetzner Cloud, and on-prem environments.

## Platform Stack Table

| Component | Technology | Version / Target | Product Usage | Environment | Notes |
| --- | --- | --- | --- | --- | --- |
| Kubernetes | RKE2 | Latest stable | Main container platform for CueAI workloads | Dev, Staging, Prod | Supports Hetzner and on-prem |
| Cloud Provider | Hetzner Cloud | Current | Cloud VM hosting for RKE2 | Dev, Staging, Prod | Use Hetzner VMs and volumes |
| On-Prem Platform | RKE2 on customer servers | Current | Customer/private deployment path | Staging, Prod | Same Helm charts should work |
| Container Runtime | containerd | RKE2 default | Container execution | All | Managed by RKE2 |
| Ingress Controller | NGINX Ingress | Latest stable | Expose web, API, Keycloak, Grafana, MinIO | All | Standard ingress path |
| TLS Manager | cert-manager | Latest stable | TLS certificates | All | Use Let's Encrypt or internal CA |
| DNS | GoDaddy DNS | Existing | Domain and DNS records | All | Point domains to LB/Ingress IP |
| Load Balancer - Hetzner | Hetzner Load Balancer | Current | Public entrypoint for cloud cluster | Staging, Prod | For app/API/auth ingress |
| Load Balancer - On-Prem | MetalLB | Latest stable | Public/private service IPs on-prem | On-prem | Use only for on-prem |
| Container Registry | Docker Hub | Existing account | Store CueAI Docker images | CI/CD | Use private repos if possible |
| Source Control | Bitbucket | Existing | Source code and deployment repo | Dev/CI | Also stores Helm charts/manifests |
| CI/CD | Jenkins | Existing/preferred | Build, test, push, deploy | Dev, Staging | Argo CD can be added later |
| Deployment Package | Helm | Helm 3 | Kubernetes app deployment | All | Separate values per environment |
| Secrets | Sealed Secrets | Latest stable | Encrypt Kubernetes secrets in Git | All | Good MVP choice |
| Database Operator | StackGres | Latest stable | PostgreSQL operator on RKE2 | Dev, Staging, Prod | Use with pgvector validation |
| Database | PostgreSQL | 16 or 17 target | CueAI relational data and pgvector | All | Managed by StackGres |
| Vector Extension | pgvector | Latest compatible | RAG embeddings and semantic search | All | Validate with StackGres image |
| Cache/Queue | Redis | Latest stable | Celery broker and cache | All | Helm chart initially |
| Object Storage | MinIO | Latest stable | Uploaded resumes, docs, exports, backups | Dev/MVP | Can move to Hetzner Object Storage later |
| External Object Storage | Hetzner Object Storage / S3-compatible | Later | Managed object storage | Prod later | Confirm availability in account |
| Auth Server | Keycloak | Latest stable | OIDC/OAuth2 authentication | All | Realm: cueai |
| Monitoring | Prometheus | Latest stable | Metrics collection | Dev/MVP | 1-day retention for dev |
| Dashboard | Grafana | Latest stable | Dashboards and troubleshooting | Dev/MVP | 1-day metrics retention |
| Logging | Loki | Latest stable | Centralized logs | Dev/MVP | 1-day retention |
| Log Agent | Promtail | Latest stable | Ship pod logs to Loki | Dev/MVP | Grafana Alloy can replace later |
| Backup - Dev | MinIO backup bucket | MVP | DB dumps and file backups | Dev | Prefer over Bitbucket for dumps |
| Backup - Temporary | Bitbucket Downloads/private repo | Temporary only | Small dev DB backups if needed | Dev only | Do not use for production DB backups |
| Backup - Prod | Hetzner Storage Box / S3 bucket | Later | Production backup target | Prod | Better than Bitbucket |
| Network Policy | Not enabled for dev | Later | Pod isolation | Prod later | Skip for dev MVP |
| Security Scanning | Trivy | Latest stable | Image vulnerability scanning | CI | Add in Jenkins pipeline |
| GitOps | Argo CD | Later | Declarative deploys | Phase 2 | Not required for MVP |

## Kubernetes Namespaces

| Namespace | Purpose | Main Components |
| --- | --- | --- |
| cueai | Application workloads | web, api, worker, export service |
| cueai-db | Database workloads | StackGres PostgreSQL cluster |
| cueai-auth | Authentication | Keycloak |
| cueai-storage | Object storage | MinIO |
| monitoring | Metrics and dashboards | Prometheus, Grafana |
| logging | Logs | Loki, Promtail |
| ingress-nginx | Ingress | NGINX Ingress Controller |
| cert-manager | TLS | cert-manager |
| sealed-secrets | Secrets | Sealed Secrets controller |

## Application Workloads

| Workload | Kubernetes Type | Replicas - Dev | Replicas - Prod Later | Usage |
| --- | --- | --- | --- | --- |
| cueai-web | Deployment | 1 | 2+ | Web dashboard |
| cueai-api | Deployment | 1 | 3+ | Backend API and WebSocket |
| cueai-worker | Deployment | 1 | 2+ | Celery background jobs |
| cueai-export-service | Deployment | 1 | 2 | Resume/doc export service |
| redis | StatefulSet/Helm | 1 | HA later | Queue/cache |
| keycloak | Deployment | 1 | 2+ | Auth server |
| minio | StatefulSet/Helm | 1 | Distributed or external | Object storage |
| postgresql | StackGres cluster | 1 | 3 | Main DB + pgvector |

## Domain Plan with GoDaddy

| Domain/Subdomain | Target | Usage |
| --- | --- | --- |
| app.cueai-domain.com | NGINX Ingress | Web dashboard |
| api.cueai-domain.com | NGINX Ingress | Backend API |
| auth.cueai-domain.com | NGINX Ingress | Keycloak |
| storage.cueai-domain.com | NGINX Ingress | MinIO API/console if exposed |
| grafana.cueai-domain.com | NGINX Ingress | Grafana dashboard |

## CI/CD Flow

```plaintext
Developer pushes code to Bitbucket
        |
        v
Jenkins pipeline starts
        |
        v
Run tests and security scan
        |
        v
Build Docker images
        |
        v
Push images to Docker Hub
        |
        v
Run Helm upgrade on RKE2
        |
        v
CueAI services updated
```

## Backup Decision

| Backup Type | Dev Decision | Production Decision |
| --- | --- | --- |
| PostgreSQL full backup | pg_dump to MinIO backup bucket | StackGres backup to S3/Storage Box |
| PostgreSQL temporary backup | Bitbucket only if small and short-lived | Not allowed |
| MinIO backup | Local bucket replication/manual copy | External S3/Storage Box |
| Config backup | Bitbucket Git repo | Bitbucket Git repo |
| Secrets backup | Sealed Secrets in Git | Sealed Secrets or External Secrets later |

## Retention Decision

| Data Type | Dev Retention | Notes |
| --- | --- | --- |
| Prometheus metrics | 1 day | Low-cost dev setup |
| Loki logs | 1 day | Low-cost dev setup |
| DB backups | 1 to 3 latest dumps | Keep only until dev environment closes |
| App uploaded test files | As needed | Delete after testing |

## Platform Decisions

* Use RKE2 as the Kubernetes platform.
* Use Hetzner Cloud for cloud deployment.
* Support on-prem RKE2 using same Helm charts.
* Use StackGres for PostgreSQL instead of Strimzi.
* Use MinIO for MVP object storage.
* Use GoDaddy for DNS management.
* Use Docker Hub for image registry.
* Use Jenkins for deployment now.
* Use Helm charts for all CueAI services.
* Use Sealed Secrets for Kubernetes secrets.
* Use Prometheus/Grafana and Loki with 1-day retention for dev.
* Skip NetworkPolicy for dev and revisit for production.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Bitbucket is not ideal for DB backup files | Medium | Use MinIO backup bucket; Bitbucket only temporary for small dev dumps |
| StackGres pgvector compatibility must be validated | High | Validate pgvector during Sprint 0 |
| Hetzner Object Storage availability may vary | Medium | Use MinIO first |
| Jenkins direct deploy can drift from Git | Medium | Use Helm values in Git; consider Argo CD later |
| 1-day monitoring retention may miss older issues | Low for dev | Increase retention for staging/prod |
| No NetworkPolicy in dev | Low for dev | Add production hardening later |

## Sprint 0 Platform Tasks

* Provision RKE2 cluster.
* Install NGINX Ingress.
* Install cert-manager.
* Configure GoDaddy DNS records.
* Install Sealed Secrets.
* Install StackGres.
* Create PostgreSQL cluster with pgvector validation.
* Install Redis.
* Install MinIO.
* Install Keycloak and create cueai realm.
* Install Prometheus/Grafana with 1-day retention.
* Install Loki/Promtail with 1-day retention.
* Configure Jenkins pipeline.
* Push first Docker images to Docker Hub.
* Deploy first Helm release.

---

# 03 - Official Website Links

## Purpose

This page contains official website and documentation links for the CueAI MVP v1.0 application and platform technology stack.

## Application Stack Links

| Area | Technology | Official Website / Documentation | Product Usage |
| --- | --- | --- | --- |
| Desktop App | Electron | https://www.electronjs.org/ | Desktop app, overlay, hotkeys, packaging |
| Desktop UI | React | https://react.dev/ | Desktop and web UI components |
| Language | TypeScript | https://www.typescriptlang.org/ | Type-safe frontend and desktop development |
| Web App | Next.js | https://nextjs.org/ | Web dashboard and admin portal |
| UI Styling | Tailwind CSS | https://tailwindcss.com/ | Dashboard and app styling |
| Backend API | FastAPI | https://fastapi.tiangolo.com/ | Backend REST APIs and WebSocket services |
| Worker | Celery | https://docs.celeryq.dev/ | Background jobs |
| Cache / Queue | Redis | https://redis.io/ | Celery broker and cache |
| Database ORM | SQLAlchemy | https://www.sqlalchemy.org/ | PostgreSQL access layer |
| DB Migrations | Alembic | https://alembic.sqlalchemy.org/ | Database schema migrations |
| PostgreSQL Driver | asyncpg | https://magicstack.github.io/asyncpg/current/ | Async PostgreSQL access |
| Vector Search | pgvector | https://github.com/pgvector/pgvector | RAG embeddings and semantic search |
| Authentication | Keycloak | https://www.keycloak.org/ | OIDC/OAuth2 login, roles, future SSO |
| Primary AI | Grok / xAI | https://docs.x.ai/ | Live answers, summaries, resume rewrite |
| Fallback AI | OpenAI | https://platform.openai.com/docs | Fallback and premium quality AI tasks |
| Future AI | Gemini | https://ai.google.dev/ | Future provider option |
| Future AI | Claude | https://docs.anthropic.com/ | Future provider option |
| OCR | Tesseract OCR | https://github.com/tesseract-ocr/tesseract | Basic screen text extraction |
| Resume PDF Parsing | pypdf | https://pypdf.readthedocs.io/ | PDF text extraction |
| Resume PDF Parsing | pdfplumber | https://github.com/jsvine/pdfplumber | PDF text extraction and layout parsing |
| Resume DOCX | python-docx | https://python-docx.readthedocs.io/ | DOCX parsing and export |
| Testing | Pytest | https://docs.pytest.org/ | Backend tests |
| Web Testing | Playwright | https://playwright.dev/ | End-to-end UI testing |
| Web Testing | Vitest | https://vitest.dev/ | Frontend unit testing |
| Container Packaging | Docker | https://www.docker.com/ | Build application container images |

## Platform Stack Links

| Area | Technology | Official Website / Documentation | Product Usage |
| --- | --- | --- | --- |
| Kubernetes | RKE2 | https://docs.rke2.io/ | Kubernetes platform for Hetzner and on-prem |
| Cloud Provider | Hetzner Cloud | https://www.hetzner.com/cloud/ | Cloud VMs, volumes, and load balancer |
| Container Runtime | containerd | https://containerd.io/ | Container runtime used by RKE2 |
| Ingress | NGINX Ingress | https://kubernetes.github.io/ingress-nginx/ | Expose CueAI web/API/auth services |
| TLS | cert-manager | https://cert-manager.io/ | TLS certificate automation |
| DNS | GoDaddy | https://www.godaddy.com/ | Domain and DNS management |
| On-Prem Load Balancer | MetalLB | https://metallb.io/ | LoadBalancer services for on-prem RKE2 |
| Image Registry | Docker Hub | https://hub.docker.com/ | Store CueAI container images |
| Source Control | Bitbucket | https://bitbucket.org/ | Source code and deployment repository |
| CI/CD | Jenkins | https://www.jenkins.io/ | Build, test, push, and deploy pipelines |
| Deployment Packaging | Helm | https://helm.sh/ | Kubernetes application packaging |
| Secrets | Sealed Secrets | https://github.com/bitnami-labs/sealed-secrets | Encrypted Kubernetes secrets stored in Git |
| PostgreSQL Operator | StackGres | https://stackgres.io/ | PostgreSQL operator for RKE2 |
| Database | PostgreSQL | https://www.postgresql.org/ | Main relational database |
| Object Storage | MinIO | https://min.io/ | S3-compatible object storage |
| Monitoring | Prometheus | https://prometheus.io/ | Metrics collection |
| Dashboards | Grafana | https://grafana.com/ | Monitoring dashboards |
| Logging | Loki | https://grafana.com/oss/loki/ | Centralized logs |
| Log Agent | Promtail | https://grafana.com/docs/loki/latest/send-data/promtail/ | Send logs to Loki |
| Image Scanning | Trivy | https://aquasecurity.github.io/trivy/ | Container image vulnerability scanning |
| GitOps Later | Argo CD | https://argo-cd.readthedocs.io/ | Future GitOps deployment option |

## Notes

* Use this page as the single official link reference for CueAI MVP stack.
* Technical team should verify exact versions during Sprint 0.
* For MVP, use latest stable versions unless compatibility requires pinning a specific version.
* Production version pinning should be documented before customer deployment.

---

# 04 - Final Engineering Decisions

## Purpose

This page captures final engineering decisions for CueAI MVP v1.0 so the technical team can build with a clear scope.

## Final Engineering Decisions

| Decision Area | Final Choice | Product Usage | Environment | Notes |
| --- | --- | --- | --- | --- |
| Environment Strategy | Dev, Staging, Prod | Separate development, validation, and customer-ready environments | All | Dev can be low-cost; staging/prod should be closer to customer deployment |
| Local Development | Docker Compose | Run API, web, database, Redis, MinIO, and Keycloak locally | Dev | Helps developers start quickly |
| Kubernetes Deployment | Helm charts | Deploy CueAI services to RKE2 | All | Use separate values files per environment |
| CI/CD | Jenkins + Docker Hub + Helm | Build, scan, push, and deploy application images | Dev, Staging | Argo CD can be added later |
| Source Control | Bitbucket | Store application code, Helm charts, and deployment manifests | All | Keep app code and deployment config organized |
| Database Migrations | Alembic | Manage PostgreSQL schema changes | All | No manual DB schema changes outside migrations |
| API Documentation | FastAPI OpenAPI / Swagger | API contract for frontend, desktop, and integration testing | All | Auto-generated from FastAPI |
| Live Communication | WebSocket | Live transcript streaming and AI answer updates | All | Required for live copilot experience |
| AI Routing | AI Provider Router | Route requests to Grok, OpenAI fallback, and future providers | All | Required from day one |
| Primary AI Provider | Grok | Default AI provider for development and MVP | All | Used for live answers, summaries, resume rewrite |
| AI Fallback Provider | OpenAI | Fallback for quality-sensitive or unsupported tasks | All | Keep as fallback route |
| Usage Tracking | Per user, workspace, feature, and provider | Track AI usage and feature usage | All | Required for cost control and future billing |
| Rate Limiting | API, user, workspace level | Prevent misuse and unexpected AI cost | All | Start basic in MVP |
| Feature Flags | Workspace-level feature toggles | Enable or disable screen context, translation, resume tailor | All | Useful for customer-specific rollout |
| Audit Logs | Basic admin and user activity logs | Track important actions for support and compliance | All | Store in PostgreSQL initially |
| Data Retention | Configurable retention policy | Control retention for transcripts, resumes, files, logs, and exports | All | Dev can be short retention; prod needs customer decision |
| Backup Policy | Separate dev and production backup rules | Avoid mixing temporary dev backup with production-grade backup | All | Dev can use MinIO; production should use S3/Storage Box |
| Security Scanning | Trivy in Jenkins pipeline | Scan Docker images before deployment | CI/CD | Add fail/warn policy later |
| Config Protection | Sealed Secrets | Store encrypted Kubernetes configuration in Git | All | Suitable for MVP |
| Monitoring Retention | 1 day for dev | Reduce dev platform cost | Dev | Increase for staging/prod later |
| Logging Retention | 1 day for dev | Reduce dev platform cost | Dev | Increase for staging/prod later |
| Desktop Release | Manual installer for MVP | Ship desktop app to early users/customer testers | MVP | Auto-update can be Phase 2 |
| Versioning | Semantic versioning | Track releases clearly | All | Example: v0.1.0, v0.2.0, v1.0.0 |
| Release Notes | Required per release | Customer handover and QA tracking | All | Include features, fixes, known issues |

## Not in MVP / Later Decisions

| Item | Decision | Reason | Revisit When |
| --- | --- | --- | --- |
| Argo CD | Not required for MVP | Jenkins + Helm is enough initially | When GitOps workflow is needed |
| Vault | Not required for MVP | Sealed Secrets is enough initially | When enterprise-grade secret operations are required |
| NetworkPolicy | Skip for dev MVP | Keeps dev setup simple | Before production/customer hardening |
| Service Mesh | Not required | Adds operational complexity | Only if service-to-service traffic control is needed |
| Kafka / Strimzi | Not required | Current MVP does not need event streaming | If high-volume async/event pipeline is required |
| Local LLM Hosting | Not required | Grok/OpenAI APIs are enough for MVP | If customer requires private/local AI |
| GPU Nodes | Not required | No local model inference in MVP | If local vision/LLM models are introduced |
| Desktop Auto-Update | Not MVP P0 | Manual installer is enough for first validation | After first customer validation |
| Full HA for All Components | Not required for dev | Single replicas reduce cost | Staging/prod hardening phase |
| Long-Term Metrics Retention | Not required for dev | One-day retention is enough for MVP dev | Staging/prod rollout |
| Long-Term Log Retention | Not required for dev | One-day retention is enough for MVP dev | Staging/prod rollout |
| Advanced Billing | Not required for MVP | Usage tracking is enough initially | SaaS/commercial launch phase |
| Multi-region Deployment | Not required | Single region is enough for MVP | Enterprise scale phase |

## Mandatory Engineering Rules

| Rule | Description |
| --- | --- |
| Database changes through migrations | All schema changes must use Alembic migrations |
| Runtime configuration only | Application settings must come from environment/configuration management |
| AI provider abstraction | AI calls must go through AI Provider Router |
| Release through pipeline | Environment changes should go through Jenkins and Helm |
| Track AI cost from day one | Store usage by user, workspace, feature, provider, and model |
| Permission-based desktop features | Screen/audio features must require user action and clear controls |
| Keep dev low-cost | One-day logs/metrics retention is acceptable for dev |
| Keep docs updated | Any stack decision change must be updated in Confluence |

## Sprint 0 Additions

| Task | Output |
| --- | --- |
| Define Helm values structure | values-dev.yaml, values-staging.yaml, values-prod.yaml |
| Define AI Provider Router interface | Provider interface and Grok implementation |
| Define usage tracking schema | DB tables for usage tracking |
| Define feature flags schema | Workspace-level feature flag table |
| Define audit log schema | Audit event table |
| Define release versioning process | Version and release-note process |
| Define data retention settings | Retention config per workspace/environment |

## Final Summary

CueAI MVP should stay simple but structured:

* Build with Grok-first AI routing.
* Deploy on RKE2 using Jenkins, Docker Hub, and Helm.
* Use StackGres for PostgreSQL and pgvector.
* Use Keycloak for authentication.
* Use Sealed Secrets for protected Kubernetes configuration.
* Use Prometheus, Grafana, and Loki with one-day dev retention.
* Avoid adding Argo CD, Vault, Kafka, service mesh, or GPU/local LLM until there is a clear requirement.
