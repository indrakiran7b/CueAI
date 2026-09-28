#!/usr/bin/env python3
"""
Generate development-only Knowledge Base test PDFs with real extractable text.

Usage:
  python scripts/generate_knowledge_test_documents.py

Output:
  test_knowledge/{security,gtm,engineering,sales,data}/*.pdf

These files are fixtures for local RAG validation - not customer data.
"""

from __future__ import annotations

from pathlib import Path

try:
    from fpdf import FPDF
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "fpdf2 is required. Install with: pip install fpdf2"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test_knowledge"

# Mark every document clearly as development test knowledge.
BANNER = (
    "DEVELOPMENT TEST KNOWLEDGE - CueAI RAG fixtures. "
    "Not real customer or company documentation."
)


DOCS: dict[str, list[tuple[str, list[tuple[str, str]]]]] = {
    "security": [
        (
            "Security_Architecture.pdf",
            [
                (
                    "Security Architecture Overview",
                    "This development test document describes CueAI security architecture "
                    "for RAG validation. The platform uses TLS 1.3 for encrypted network "
                    "communication between clients, APIs, and internal services. All "
                    "external endpoints require HTTPS. Mutual TLS is used between selected "
                    "internal microservices. Secrets are never embedded in frontend builds.",
                ),
                (
                    "Encryption and Data Protection",
                    "Data at rest is encrypted with AES-256. Password hashing uses bcrypt "
                    "with a work factor of 12. Session tokens are short-lived. Refresh "
                    "tokens are rotated. API keys for Groq, Gemini, and OpenAI remain "
                    "backend-only environment variables and are never logged.",
                ),
                (
                    "API Security and Audit Logging",
                    "Every privileged Knowledge Base and meeting API call requires "
                    "authenticated workspace membership. Role-based access control (RBAC) "
                    "gates knowledge.read and knowledge.write. Audit logging records "
                    "document upload, reindex, delete, and admin queries with actor ids.",
                ),
            ],
        ),
        (
            "Authentication_and_Authorization.pdf",
            [
                (
                    "Authentication",
                    "Authentication is handled with JWT access tokens issued after "
                    "successful login. OAuth 2.0 / OIDC is supported for enterprise SSO. "
                    "Session management invalidates tokens on logout and password change. "
                    "Multi-factor authentication can be required for Admin roles.",
                ),
                (
                    "Authorization and RBAC",
                    "Authorization uses RBAC with Admin, Manager, and User roles. "
                    "Workspace isolation ensures one workspace cannot retrieve another "
                    "workspace's documents. Meeting documents are isolated by meeting_id. "
                    "Vector search always filters by workspace_id at query time.",
                ),
                (
                    "API Security Practices",
                    "How is authentication handled? Clients present a Bearer JWT. "
                    "The API validates signature, expiry, and workspace membership before "
                    "serving Knowledge Base content or Live Session answers.",
                ),
            ],
        ),
    ],
    "gtm": [
        (
            "Go_To_Market_Strategy.pdf",
            [
                (
                    "Target Customer Profile (ICP)",
                    "The target customer profile (ICP) for CueAI is mid-market and "
                    "enterprise teams that run frequent client meetings, interviews, "
                    "and sales calls. Primary buyers include RevOps leaders, Sales "
                    "Enablement managers, and Engineering managers who need live AI "
                    "assistance grounded in company knowledge.",
                ),
                (
                    "Customer Acquisition Strategy",
                    "Customer acquisition strategy focuses on product-led trials, "
                    "partner channel introductions, and targeted outbound to security-aware "
                    "buyers. Launch strategy sequences: private beta with design partners, "
                    "GTM enablement kits, then broader self-serve onboarding. Market "
                    "segments include SaaS sales teams and professional services firms.",
                ),
            ],
        ),
        (
            "Product_Positioning.pdf",
            [
                (
                    "Product Positioning",
                    "Product positioning: CueAI is a live meeting intelligence companion "
                    "that answers from your Knowledge Base first and falls back to general "
                    "AI only when documents do not contain relevant information. Competitive "
                    "positioning emphasizes citations, workspace isolation, and desktop "
                    "companion overlays rather than generic chatbots.",
                ),
                (
                    "Sales Channels",
                    "Sales channels include direct enterprise sales, self-serve web signup, "
                    "and reseller partners. Messaging highlights document-first RAG answers "
                    "with clear source citations for Security, GTM, Engineering, and Sales "
                    "playbooks uploaded by Admins.",
                ),
            ],
        ),
    ],
    "engineering": [
        (
            "Backend_Architecture.pdf",
            [
                (
                    "Backend Framework",
                    "The backend uses FastAPI (Python) for the CueAI API service. REST "
                    "endpoints handle auth, meetings, licensing, and live answer proxying. "
                    "The Next.js web app also hosts Knowledge Base admin APIs for document "
                    "upload, chunking, embeddings, and retrieval.",
                ),
                (
                    "Data and Queues",
                    "Databases store workspace, meeting, and knowledge metadata. Redis and "
                    "Celery support asynchronous jobs when configured. Caching reduces "
                    "repeated retrieval latency. Testing covers chunking, extraction "
                    "sanitization, and RAG fallback behavior.",
                ),
                (
                    "Deployment",
                    "Deployment targets containerized API workers and a Node web service. "
                    "What backend framework does the application use? FastAPI for the "
                    "Python API layer, with Next.js route handlers for Knowledge Base RAG.",
                ),
            ],
        ),
        (
            "Frontend_Architecture.pdf",
            [
                (
                    "Frontend Technology",
                    "The frontend technology is React with Next.js App Router for the web "
                    "console. Desktop Companion uses Electron on Windows and a native "
                    "companion on macOS. UI components follow the CueAI design system.",
                ),
                (
                    "Live Session Integration",
                    "Live Session streams transcript questions to /api/live/answer which "
                    "retrieves Knowledge Base context before calling the configured LLM "
                    "provider. What frontend technology is used? React and Next.js.",
                ),
            ],
        ),
        (
            "API_Architecture.pdf",
            [
                (
                    "API Structure",
                    "How are APIs structured? Public REST routes under /api for web and "
                    "/v1 for the FastAPI service. Knowledge routes include list, upload, "
                    "document detail, content pages, file download, reindex, delete, and "
                    "query. Microservices boundaries keep transcription, licensing, and "
                    "RAG indexing separable.",
                ),
                (
                    "Auth and Versioning",
                    "Authentication middleware attaches workspace context. Responses for "
                    "RAG queries include knowledgeUsed, sourceType, and sources arrays. "
                    "General AI fallback returns empty sources when no document is relevant.",
                ),
            ],
        ),
    ],
    "sales": [
        (
            "Sales_Playbook.pdf",
            [
                (
                    "Sales Process Stages",
                    "What are the stages of the sales process? 1) Prospecting, "
                    "2) Qualification, 3) Discovery, 4) Demo / Proof of Value, "
                    "5) Proposal, 6) Negotiation, 7) Closing, 8) Expansion. "
                    "Qualification checks ICP fit, timeline, and security requirements.",
                ),
                (
                    "Discovery and Objections",
                    "Discovery questions explore meeting volume, knowledge governance, "
                    "and desktop overlay needs. Common customer objections include data "
                    "privacy, hallucination risk, and SSO readiness. Respond with "
                    "workspace isolation, document-first RAG, and citation transparency.",
                ),
            ],
        ),
        (
            "Enterprise_Sales_Process.pdf",
            [
                (
                    "Enterprise Sales Process",
                    "Enterprise sales process adds security review, legal MSA, and "
                    "phased rollout. Proposal packages map Security, Engineering, GTM, "
                    "and Sales knowledge packs to buyer personas. Negotiation emphasizes "
                    "pilot success criteria and citation accuracy SLAs.",
                ),
                (
                    "Closing",
                    "Closing requires executive sponsor alignment and Admin onboarding "
                    "for the Knowledge Base. Post-sale expansion attaches meeting-scoped "
                    "documents without duplicating workspace embeddings unnecessarily.",
                ),
            ],
        ),
    ],
    "data": [
        (
            "Data_Architecture.pdf",
            [
                (
                    "Data Architecture",
                    "Development test data architecture: document metadata lives in the "
                    "workspace store; original files are stored under a secured data "
                    "directory; chunk text and embeddings are indexed in Qdrant when "
                    "configured. Analytics events track retrieval latency separately "
                    "from LLM latency.",
                ),
                (
                    "Isolation Rules",
                    "Vector metadata always includes workspace_id, document_id, category, "
                    "chunk_id, filename, page_number, and chunk_index. Cross-workspace "
                    "retrieval is forbidden.",
                ),
            ],
        ),
        (
            "Analytics_Data_Model.pdf",
            [
                (
                    "Analytics Data Model",
                    "Analytics data model dimensions: workspace, document category, "
                    "retrieval mode (vector|keyword), knowledge_used boolean, and "
                    "source_type. Measures include retrieval_ms, llm_ms, and total_ms. "
                    "This document is development test knowledge only.",
                ),
            ],
        ),
    ],
}


class DocPDF(FPDF):
    def footer(self) -> None:  # noqa: D401
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, f"Page {self.page_no()} | {BANNER[:60]}...", align="C")


def write_pdf(path: Path, sections: list[tuple[str, str]]) -> None:
    pdf = DocPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    for title, body in sections:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.multi_cell(0, 10, title)
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(120, 80, 40)
        pdf.multi_cell(0, 5, BANNER)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 6, body)
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(path))


def main() -> None:
    written: list[Path] = []
    for category, docs in DOCS.items():
        for filename, sections in docs:
            out = OUT / category / filename
            write_pdf(out, sections)
            written.append(out)
            print(f"wrote {out.relative_to(ROOT)}")

    # Optional structured fixtures for CSV/JSON ingest tests.
    data_dir = OUT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "sample_metrics.csv").write_text(
        "metric,value,notes\n"
        "retrieval_ms_p50,85,development test knowledge\n"
        "llm_ms_p50,420,development test knowledge\n"
        "knowledge_hit_rate,0.72,development test knowledge\n",
        encoding="utf-8",
    )
    (data_dir / "sample_entities.json").write_text(
        '{\n'
        '  "_comment": "DEVELOPMENT TEST KNOWLEDGE - not customer data",\n'
        '  "entities": [\n'
        '    {"name": "FastAPI", "category": "engineering"},\n'
        '    {"name": "TLS 1.3", "category": "security"}\n'
        "  ]\n"
        "}\n",
        encoding="utf-8",
    )
    print(f"\nGenerated {len(written)} PDFs under {OUT}")


if __name__ == "__main__":
    main()
