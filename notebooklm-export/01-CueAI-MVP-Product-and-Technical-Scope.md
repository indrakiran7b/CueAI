# CueAI MVP v1.0 - Complete Product and Technical Scope

Source: Confluence space CueAI (wayfinderops.atlassian.net)  
Exported for NotebookLM

---

# CueAI MVP v1.0 - Product and Technical Scope

> Parent index for CueAI MVP v1.0 technical planning, architecture design, estimation, sprint breakdown, and delivery tracking.

## Product Statement

**CueAI** is a real-time AI productivity copilot for meetings, screen context, knowledge answers, translation, and resume tailoring.

## MVP v1.0 Goal

Build a customer-ready MVP with:

* Desktop AI assistant overlay
* Real-time transcription
* Live AI answer suggestions
* Visual screen context understanding
* Presenter Privacy Mode
* Meeting notes and action items
* Knowledge base and RAG support
* Real-time translation support
* Resume rewrite based on job description
* Web dashboard
* Admin dashboard
* AI provider integration
* Privacy and consent controls

## Clickable Child Page Index

| # | Page | Purpose |
| --- | --- | --- |
| 01 | MVP Overview and Scope | Overall MVP definition, goals, and success criteria |
| 02 | Feature Priority - P0 P1 P2 | Must-have, should-have, and later roadmap features |
| 03 | Desktop App and Live Copilot | Desktop overlay, live transcription, and AI answer cards |
| 04 | Visual Screen Context and Presenter Privacy Mode | Screen OCR/vision context and presenter privacy controls |
| 05 | Meeting Notes Translation and Knowledge Base | Summaries, action items, translation, and knowledge base |
| 06 | Resume Tailor and Resume Rewrite | Resume upload, JD matching, ATS optimization, and export |
| 07 | Web Dashboard and Admin Dashboard | User dashboard, admin portal, roles, and usage tracking |
| 08 | Technical Architecture and Integrations | Components, tech stack options, AI providers, integrations |
| 09 | Privacy Compliance and Safety Rules | Consent, privacy settings, data handling, responsible usage |
| 10 | Customer Deliverables and Handover | Product, documentation, and handover deliverables |
| 11 | Roadmap and Phase 2 | Phase 1.5, Phase 2, and enterprise roadmap |

## Product Positioning

CueAI should be positioned as a professional meeting, sales, support, productivity, and career-assistance platform with clear consent, privacy controls, and responsible usage guidelines.

## Final MVP Statement

We will build CueAI MVP v1.0 with desktop overlay, real-time transcription, live AI answers, visual screen context understanding, meeting summaries, action items, company knowledge base, web dashboard, admin dashboard, AI provider integration, real-time translation support, Presenter Privacy Mode, and AI Resume Tailor.

The product must be marketed as a professional meeting, sales, support, productivity, and career-assistance platform — not as cheating, deception, or bypass software.

## Technical Team Next Steps

* Review each child page.
* Confirm MVP scope and feature priorities.
* Prepare architecture diagram.
* Choose tech stack.
* Prepare sprint plan and effort estimate.
* Identify risks and blockers.
* Prepare deployment and handover plan.

---

# 01 - MVP Overview and Scope

This page defines the CueAI MVP v1.0 product scope for technical planning.

## Core Scope

* Desktop application
* Web dashboard
* Admin dashboard
* Live transcription
* AI suggestion cards
* Meeting summaries
* Action items
* Knowledge base
* Translation support
* Resume Tailor
* Privacy and consent settings

## Success Criteria

* Team can estimate the MVP.
* Team can define architecture.
* Team can split features into sprints.
* Team can identify delivery risks.

---

# 02 - Feature Priority - P0 P1 P2

## P0 - Must Have

* Windows desktop app
* Floating assistant overlay
* Hotkey hide and show
* Live transcription
* AI suggestion cards
* Manual Ask AI input
* Meeting context memory
* Basic screen OCR and manual screen analysis
* Presenter Privacy Mode
* Meeting summary
* Action items
* Follow-up email draft
* Knowledge base upload
* Knowledge-base-backed responses
* Web dashboard
* Admin dashboard
* User login and signup
* Workspace management
* AI provider integration
* Resume upload
* Job description upload or paste
* Resume parsing
* JD parsing
* Resume-to-JD match score
* Resume rewrite
* ATS keyword optimization
* Resume export as DOCX and PDF
* Basic privacy settings

## P1 - Should Have

* Advanced vision model support
* Real-time translation
* Multi-monitor support
* Speaker detection
* Bilingual transcript
* Follow-up templates
* Sales response mode
* Support response mode
* Technical explanation mode
* Admin usage analytics
* Custom AI personas
* Model selection per workspace
* PDF export for meeting notes
* Meeting search
* Resume version history
* Cover letter generation
* LinkedIn profile rewrite
* Job URL parsing
* Source references in responses
* Screen context refresh interval
* Exclude sensitive apps and windows

## P2 - Later

* macOS desktop app
* Android app
* iOS app
* Chrome extension
* Google Calendar integration
* Slack integration
* CRM integration
* Google Drive integration
* Notion integration
* Confluence integration
* Coaching analytics
* Sentiment analysis
* Call quality scoring
* Offline or local LLM mode
* Enterprise SSO
* Audit logs
* Enterprise admin policies
* Job application tracker
* Mock interview module
* Candidate profile website

---

# 03 - Desktop App and Live Copilot

## Purpose

This page defines the desktop application and live copilot experience for CueAI MVP v1.0.

## Goal

Build a Windows desktop app that provides a private floating AI assistant during meetings, calls, demos, and work sessions.

## P0 Features

* Windows desktop application
* Floating AI assistant overlay
* Always-on-top option
* Hotkey to open, hide, and minimize assistant
* Start and stop live session
* Real-time microphone audio capture with user consent
* Real-time system audio capture where supported
* Live transcript panel
* Manual Ask AI input box
* Live AI answer cards
* Auto-suggested answers when questions are detected
* Copy answer button
* Regenerate answer
* Pin useful answer
* Save meeting/session history
* Sync with web dashboard

## Live AI Answer Inputs

* Live transcript
* User typed prompt
* Visual screen context where enabled
* Uploaded knowledge base
* Previous context from current session

## Acceptance Criteria

* User can install and open the desktop app.
* User can start and stop a live session.
* Transcript appears in near real time.
* User can ask AI manually.
* AI can suggest answers during a meeting.
* User can copy and regenerate AI answers.
* User can hide/show the assistant using a hotkey.
* Session is saved and visible in the dashboard.

## Technical Notes

* Team should evaluate Electron, Tauri, or native Windows app.
* Audio capture must be tested for microphone and system audio.
* Overlay behavior must be tested with Zoom, Google Meet, and Microsoft Teams.
* Hotkeys must not conflict with common system shortcuts.

## Risks

* System audio capture may vary by OS and permissions.
* Overlay behavior may vary across meeting apps.
* Real-time latency must be carefully optimized.

---

# 04 - Visual Screen Context and Presenter Privacy Mode

## Purpose

This page defines CueAI screen understanding and presenter privacy capabilities for MVP v1.0.

## Visual Screen Context Understanding

CueAI can optionally analyze the user's active screen content with permission. This helps the assistant understand slides, documents, dashboards, browser pages, PDFs, code, error messages, CRM screens, and meeting materials.

## P0 Screen Context Features

* User permission before screen analysis
* Manual Analyze Screen button
* Active window screenshot capture
* Basic OCR for visible text
* Use screen text as AI context
* Combine screen context with live transcript
* Combine screen context with knowledge base
* Privacy toggle to disable screen reading

## P1 Screen Context Features

* Vision model support for screenshots
* Chart and dashboard explanation
* Slide/document understanding
* Code and error explanation
* Screen context refresh interval
* Exclude sensitive apps/windows
* Multi-monitor screen selection

## Presenter Privacy Mode

Presenter Privacy Mode helps users keep private notes, prompts, internal context, and AI suggestions from being exposed during legitimate screen sharing.

## P0 Privacy Mode Features

* Quick hide hotkey
* Minimize overlay during screen share
* Move assistant to selected monitor
* Always-on-top toggle
* Screen-share safe mode indicator
* Compatibility testing with Zoom, Google Meet, and Microsoft Teams

## Safe Positioning

CueAI must be positioned as a professional productivity assistant. It must not be marketed as cheating, exam bypass, interview deception, or monitoring bypass software.

## Acceptance Criteria

* User can enable or disable screen context.
* Screen context is not captured without user consent.
* AI can read visible screen text using OCR.
* AI can answer using screen context when enabled.
* User can enable Presenter Privacy Mode.
* User can quickly hide/minimize the assistant.
* Overlay behavior is tested with major meeting apps.

## Risks

* Some screen-share hiding behavior depends on operating system and meeting app support.
* Screen capture requires strong privacy controls.
* Vision processing may increase cost and latency.

---

# 05 - Meeting Notes Translation and Knowledge Base

## Purpose

This page defines meeting notes, translation, and knowledge base capabilities for CueAI MVP v1.0.

## Meeting Notes Features

* Save live transcript
* Generate short summary
* Generate detailed summary
* Capture key decisions
* Capture action items
* Detect owners and due dates
* Capture risks and blockers
* Capture open questions
* Generate follow-up email draft
* Copy summary
* Export summary as Markdown or PDF

## Translation Features

Translation is planned as a P1 near-MVP feature. It can become P0 if the customer requires multilingual live meetings.

* Input language detection
* Output language selection
* Live transcript translation
* AI answers in selected language
* Meeting summary in selected language
* Follow-up email in selected language
* Bilingual transcript view
* Initial support for English, Hindi, and Telugu

## Knowledge Base Features

* Upload PDF
* Upload DOCX
* Upload TXT or Markdown
* Add website URL
* Add manual Q&A entries
* Store product documents
* Store sales documents
* Store support FAQ documents
* Document indexing
* Semantic search
* Knowledge-backed AI answers
* Delete documents
* Re-index documents

## Acceptance Criteria

* After meeting, CueAI generates structured notes.
* Action items and decisions are clearly listed.
* User can copy or export notes.
* Admin or user can upload documents.
* Documents are indexed successfully.
* AI can answer from uploaded documents.
* Translation works in selected language where enabled.

## Risks

* Translation and summarization can increase token cost.
* Answer quality depends on document quality.
* Source references should be added before enterprise release.

---

# 06 - Resume Tailor and Resume Rewrite

## Purpose

This page defines the CueAI Resume Tailor module for MVP v1.0.

## Customer-Facing Description

Upload a resume and a job description. CueAI analyzes the job requirements, compares them with the resume, and rewrites the resume to better match the target role while keeping the content truthful, professional, and ATS-friendly.

## P0 Features

* Resume upload
* Job description paste box
* Job description upload
* Resume parsing
* Job description parsing
* Required skills extraction
* Preferred skills extraction
* Keyword extraction
* Resume-to-JD match score
* Missing keyword analysis
* Skills gap analysis
* Resume summary rewrite
* Experience bullet rewrite
* Project description rewrite
* Skills section optimization
* ATS keyword optimization
* Before and after comparison
* Export updated resume as DOCX
* Export updated resume as PDF

## P1 Features

* Resume version history
* Cover letter generation
* LinkedIn profile rewrite
* Job URL parsing
* Multiple tone options
* Country-specific resume format

## Inputs

* Resume file: PDF or DOCX
* Job description: text, PDF, DOCX, or job URL
* Target role
* Experience level
* Tone preference
* Output format

## Content Integrity Rule

CueAI should improve wording, structure, keyword alignment, and presentation using the user's existing background and verified inputs only.

## Acceptance Criteria

* User can upload a resume.
* User can paste or upload a job description.
* System generates a match score.
* System shows missing keywords.
* System rewrites resume summary.
* System rewrites experience bullets.
* System optimizes skills section.
* User can review changes.
* User can export resume as DOCX or PDF.
* Resume updates stay aligned with user-provided details.

---

# 07 - Web Dashboard and Admin Dashboard

## Purpose

This page defines the CueAI web and admin portal scope for MVP v1.0.

## User Dashboard Pages

* Login page
* Signup page
* Home dashboard
* Recent meetings
* Meeting detail page
* Transcript page
* Summary page
* Action items page
* Knowledge base page
* Upload document page
* Resume Tailor page
* Resume upload page
* Job description input page
* Resume match analysis page
* Resume rewrite editor page
* Resume versions page
* AI settings page
* Team members page
* Usage dashboard
* Privacy settings page

## Admin Portal Features

* Workspace management
* User management
* Role-based access
* Invite users
* Remove users
* Knowledge base management
* AI provider configuration
* Model configuration
* Token usage dashboard
* Meeting minutes usage dashboard
* Resume rewrite usage dashboard
* Privacy settings
* Data retention settings
* Basic activity log
* Billing-ready usage tracking

## Roles

* Admin
* Manager
* User

## Acceptance Criteria

* User can log in and access dashboard.
* User can view recent meetings.
* User can open meeting notes and transcript.
* User can manage personal content.
* User can access Resume Tailor.
* Admin can invite and remove users.
* Admin can manage knowledge base.
* Admin can configure AI provider.
* Admin can view usage.
* Normal users cannot access admin-only settings.

---

# 08 - Technical Architecture and Integrations

## Purpose

This page defines the high-level technical architecture and integration scope for CueAI MVP v1.0.

## Core Components

* Windows desktop app
* Web dashboard
* Admin portal
* Backend API
* Authentication service
* Database
* Object/file storage
* Transcription service
* AI orchestration service
* Knowledge indexing service
* Resume processing service
* Export service
* Usage tracking service

## AI Provider Integration

CueAI should support a provider abstraction layer so the product can use different AI providers by workspace or feature.

## Supported Providers

* OpenAI
* Gemini
* Grok
* Claude
* Optional local LLM later

## Model Usage Areas

* Live answers
* Meeting summaries
* Knowledge-base answers
* Screen context understanding
* Translation
* Resume rewrite
* Follow-up email generation

## External App Compatibility

* Zoom
* Google Meet
* Microsoft Teams

## Suggested Technical Stack for Evaluation

* Desktop: Electron, Tauri, or native Windows
* Frontend: Next.js or React
* Backend: Python FastAPI or Node.js
* Database: PostgreSQL
* Vector database: pgvector, Qdrant, or Pinecone
* File storage: S3-compatible storage or cloud object storage
* Queue: Redis, BullMQ, Celery, or Kafka depending on scale
* Auth: Auth.js, Clerk, Supabase Auth, or custom JWT

## Architecture Questions for Technical Team

* Which desktop framework should be used?
* How will system audio capture work on Windows?
* How will screen context be captured securely?
* Which transcription provider should be used?
* Which AI provider should be default?
* Where will transcripts, screen data, and resumes be stored?
* What data should be temporary vs persisted?
* What deployment model is required: SaaS or private customer deployment?

## Acceptance Criteria

* Team can prepare architecture diagram.
* Team can finalize MVP tech stack.
* Team can identify integration risks.
* Team can estimate build effort by module.
* Team can define deployment approach.

---

# 09 - Privacy Compliance and Safety Rules

## Purpose

This page defines privacy, compliance, consent, and responsible-use rules for CueAI MVP v1.0.

## Product Positioning

CueAI must be positioned as a professional meeting, sales, support, productivity, and career-assistance platform.

## Consent Requirements

* User consent before microphone capture
* User consent before system audio capture
* User consent before screen context capture
* Clear indicator when live session is active
* Clear indicator when screen context is active
* Option to pause or stop capture
* Option to delete saved data

## Privacy Settings

* Enable or disable transcript storage
* Enable or disable screen context storage
* Enable or disable meeting history
* Enable or disable resume storage
* Data retention settings
* Delete meeting data
* Delete uploaded knowledge documents
* Delete resume files
* Private mode for sensitive sessions

## Responsible Usage Rules

* CueAI should not be positioned as a deception tool.
* CueAI should not claim to bypass monitoring systems.
* CueAI should not claim guaranteed invisibility.
* CueAI should be used for legitimate productivity, accessibility, notes, sales, support, learning, and career workflows.

## Data Handling Requirements

* Encrypt sensitive data in transit.
* Encrypt sensitive data at rest.
* Store API keys securely.
* Separate workspace data.
* Restrict admin-only settings.
* Log important admin actions.
* Provide delete/export options where possible.

## Acceptance Criteria

* Users are clearly informed before audio or screen capture.
* Users can disable screen context.
* Users can delete meeting and resume data.
* Admin can configure retention settings.
* System has clear privacy indicators.
* Product wording remains professional and safe.

---

# 10 - Customer Deliverables and Handover

## Purpose

This page defines customer deliverables and handover items for CueAI MVP v1.0.

## Product Deliverables

* Windows desktop app
* Web dashboard
* Admin dashboard
* Backend API
* Database schema
* Authentication module
* Live transcription module
* Live AI answer module
* Visual screen context module
* Presenter Privacy Mode module
* Knowledge base module
* Meeting notes module
* Translation module
* Resume Tailor module
* AI provider integration module
* Export and download module
* Privacy settings module

## Documentation Deliverables

* Product requirement document
* MVP feature list
* User guide
* Admin guide
* API documentation
* Deployment guide
* Environment setup guide
* AI provider setup guide
* Privacy and compliance notes
* Developer handover document

## Handover Deliverables

* Source code
* Deployment scripts
* Environment variable template
* Database migration scripts
* Admin credentials handover process
* Test cases
* Known limitations document
* Future roadmap document

## Technical Team Outputs Required

* Architecture diagram
* Tech stack decision
* Sprint plan
* Effort estimate
* Risk register
* Deployment plan
* Security checklist
* MVP test plan

## Acceptance Criteria

* All source code is handed over.
* Deployment guide is complete.
* Environment variables are documented.
* Admin setup process is documented.
* Known limitations are clearly listed.
* Customer can validate MVP modules end-to-end.

---

# 11 - Roadmap and Phase 2

## Purpose

This page defines the post-MVP roadmap for CueAI.

## Phase 1.5 - Near MVP

* Advanced screen understanding with vision models
* Real-time translation improvements
* Multi-monitor support
* Speaker detection
* Bilingual transcript
* Follow-up email templates
* Sales response mode
* Customer support response mode
* Technical explanation mode
* Admin usage analytics
* Custom AI personas
* Model selection per workspace
* Meeting search
* Resume version history
* Cover letter generation
* LinkedIn profile rewrite
* Job URL parsing
* Source references in AI answers
* Exclude sensitive apps and windows

## Phase 2

* macOS desktop app
* Android app
* iOS app
* Chrome extension
* Google Calendar integration
* Slack integration
* CRM integration
* Google Drive integration
* Notion integration
* Confluence integration
* Team coaching analytics
* Sentiment analysis
* Call quality scoring
* Offline or local LLM mode
* Enterprise SSO
* Enterprise admin policies
* Advanced audit logs
* Job application tracker
* Mock interview module
* Candidate profile website

## Phase 3 - Enterprise Scale

* Customer-private deployment
* Advanced compliance pack
* Custom LLM routing
* Department-level knowledge bases
* Advanced reporting
* Role-specific AI copilots
* Enterprise billing and licensing
* Partner integrations

## Roadmap Acceptance Criteria

* MVP remains focused and deliverable.
* Phase 1.5 items are not blocking MVP launch.
* Phase 2 items are clearly separated from MVP.
* Enterprise items are tracked for future customer conversations.
