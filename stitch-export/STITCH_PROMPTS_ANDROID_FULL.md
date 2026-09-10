# CueAI Android — Full App Google Stitch Prompt Pack

Complete Android UI kit: **Auth · Home · Live · Meetings · Knowledge · Resume · Privacy**

- **Meetings replaces Notes** (no Notes tab/content)
- Login/Signup with **Google + Apple**
- Teal dark CueAI system

Use [Google Stitch](https://stitch.withgoogle.com) · Pro/Experimental · upload reference screenshots when available.

---

## Global design system (paste at the start of EVERY prompt)

```text
Product: CueAI — professional Android AI meeting / sales / support / career copilot.
Consent-first. Presenter Privacy Mode. Not cheating or “undetectable” software.

Platform: Android phone ~390×844. Status bar + home gesture area.
Theme: dark ink UI with teal accent.

Colors:
- Background: #0B1215
- Elevated / cards: #152026
- Soft surface: #1A262C
- Primary teal: #14B8A6
- Deep teal: #0D9488
- Bright teal (active): #2DD4BF
- Teal soft: rgba(20,184,166,0.12)
- Text: #F4FAF8
- Muted: #A8C0B9
- Dim: #7A948C
- Border: rgba(148,184,176,0.22)
- Live/danger: #F87171
- Warning: #FBBF24
- Success: #34D399

Typography: Sora (titles) + Figtree (body). NO serif display fonts.

Bottom tab bar (after login, except live overlay session):
Home · Live · Meetings · Knowledge · Resume
Active = #2DD4BF
NO Notes tab — Meetings replaces Notes entirely.

Components:
- Primary CTA: teal gradient #14B8A6 → #0D9488, text #042F2E
- Ghost/outline buttons, chips, toggles, cards ~16px radius
- Glassmorphic floating Live overlay (teal, not Cluely blue)
- Social auth outline buttons for Google and Apple

Visual rules: soft teal glow atmosphere; no purple; professional only.
```

---

## Screen index

| # | Screen | Tab |
|---|--------|-----|
| 01 | Splash / Welcome gate | none |
| 02 | Login | none |
| 03 | Sign up | none |
| 04 | Home | Home |
| 05 | Live launcher | Live |
| 06 | Live overlay session | none (session dock) |
| 07 | Meetings list | Meetings |
| 08 | Meeting detail / summary | Meetings |
| 09 | Knowledge — Search | Knowledge |
| 10 | Knowledge — Library | Knowledge |
| 11 | Knowledge — Add sources | Knowledge |
| 12 | Resume — Inputs | Resume |
| 13 | Resume — Analysis | Resume |
| 14 | Resume — Rewrite | Resume |
| 15 | Resume — Compare | Resume |
| 16 | Privacy & safety | via Home |

---

## Master one-shot (full app)

```text
[Paste global design system]

Design the COMPLETE CueAI Android app UI kit (high-fidelity dark teal mockups).

AUTH
01 Splash — CueAI logo, tagline, Log in + Create account, consent footer
02 Login — Login|Sign up tabs; Continue with Google; Continue with Apple; email/password; Log in
03 Sign up — same social Google+Apple; name/email/password/confirm; Create account

HOME
04 Home — CueAI header + Consent chip; “CueAI is ready for your next call.”; Live meeting hero with Start overlay; quick actions Meetings / Knowledge / Resume / Privacy; Up next list; tab Home active

LIVE
05 Live launcher — Start separate CueAI window; Meet/Zoom/Teams picker; Presenter Privacy toggle; permissions; Start overlay session; tab Live active
06 Live overlay — Meet presenting background; What others see strip; floating transparent CueAI glass (Private, Assist/What to say/Follow-ups/Recap, Smart+ask input); dock Sharing/Privacy/Stop; NO main tab bar

MEETINGS (replaces Notes)
07 Meetings list — search/filters; cards: Q3 Product Sync (Summary ready), Enterprise Security Review (Live), Customer Success Weekly, Design Critique — CueAI Companion; tab Meetings active
08 Meeting detail — Q3 Product Sync summary: executive summary, key decisions, risks/questions, action items table

KNOWLEDGE
09 Search — ask + cited RAG answer; tab Knowledge
10 Library — docs with category filters, indexed status, re-index/delete
11 Add sources — PDF/DOCX/TXT-MD/URL/Q&A

RESUME
12 Inputs — upload resume+JD, role/level/tone/format, Analyze & tailor
13 Analysis — match score %, skills, keywords, gaps
14 Rewrite — tailored resume + copy/export
15 Compare — before/after + DOCX/PDF export; tab Resume active throughout

PRIVACY
16 Privacy & safety — Presenter Privacy, consent banner, screen context, on-device audio toggles; responsible usage rules

Consistent CueAI teal dark system across all screens. No Notes anywhere.
```

---

## Per-screen prompts

### 01 — Splash / Welcome

```text
[Paste global]

CueAI Android splash/welcome.
Centered teal rounded-square logo, title CueAI, tagline “Your real-time meeting copilot.”
Support: “Live answers, screen context, meetings, knowledge, and resume tailor.”
Chips: System overlay · Presenter Privacy · Consent-first
CTAs: Log in (primary) · Create account (outline)
Footer: UI prototype · MVP v1.0 · Not for deception use
No tab bar. Soft teal glow on #0B1215.
```

### 02 — Login

```text
[Paste global]

CueAI Android LOGIN.
Tabs: Login (active) | Sign up
Headline: Welcome back
Stacked: Continue with Google · Continue with Apple
Divider: or continue with email
Fields: Email, Password (show/hide)
Primary: Log in
Forgot password link
Don’t have an account? Sign up
Consent line under CTA. No tab bar.
```

### 03 — Sign up

```text
[Paste global]

CueAI Android SIGN UP.
Tabs: Login | Sign up (active)
Headline: Create your CueAI account
Stacked: Sign up with Google · Sign up with Apple
Divider: or continue with email
Fields: Full name, Work email, Password, Confirm password
Primary: Create account
Already have an account? Log in
Terms/Privacy consent. No tab bar.
```

### 04 — Home

```text
[Paste global]

CueAI Android HOME.
Header: CueAI brand + Consent on chip
Eyebrow TODAY · Headline: CueAI is ready for your next call.
Live hero card (Live now · Google Meet · Enterprise discovery) CTA Start overlay window
Quick grid: Meetings · Knowledge · Resume Tailor · Privacy
Up next meeting cards (Soon / Done)
Tab bar Home active.
NO Notes quick action — use Meetings instead.
```

### 05 — Live launcher

```text
[Paste global]

CueAI Android LIVE launcher.
Eyebrow SYSTEM OVERLAY · Headline: Start a separate CueAI window.
Explain floating overlay above Meet/Zoom/Teams, not inside meeting UI.
Host picker: Google Meet, Zoom, Teams
Presenter Privacy Mode toggle ON
Permission rows: Display over apps · Mic · Exclude from capture
CTA: Start overlay session
Tab Live active.
```

### 06 — Live overlay session

```text
[Paste global]

CueAI Android live OVERLAY session.
Background: Google Meet presenting Architecture overview Slide 4/12
Top: What others see (screen share) · CueAI hidden
Floating glass CueAI window: drag island, Private chip, live transcript strip, Listening + What should I say?, answer text, chips Assist / What to say / Follow-ups / Recap, Smart + EN + ask + send
Bottom dock: Sharing · Privacy · Stop
NO main bottom tab bar. Teal glass, not Cluely blue.
```

### 07 — Meetings list

```text
[Paste global]

CueAI Android MEETINGS list (replaces Notes).
Title Meetings · Subtitle: Live sessions, recordings, and AI summaries in one place.
New live session outline button · Search · Filters
Cards:
1) Q3 Product Sync · Summary ready · Today 10:00 AM · 42m · 8 · Product/Roadmap
2) Enterprise Security Review · Live · Today 2:30 PM · 28m · 5 · Security
3) Customer Success Weekly · Summary ready · Yesterday · 55m · 12 · CS
4) Design Critique — CueAI Companion · Summary ready · Mon · 36m · 6 · Design
Teal camera icon on cards. Tab Meetings active.
```

### 08 — Meeting detail

```text
[Paste global]

CueAI Android meeting DETAIL for Q3 Product Sync.
Summary ready pill · Title · Today · 42 min · 8 attendees · Generated in 18s
Executive summary card (enterprise rollout, p95 under 800ms, Screen Context opt-in, SSO deferred Phase 3)
Key decisions with checkmarks
Risks & open questions (VPN latency risk + EU region locks question)
Action items: Marcus Aug 12 Open · Alex Aug 10 Open · Priya Aug 14 Done
Optional Copy / Export PDF. Back chevron. Tab Meetings active or detail chrome.
```

### 09 — Knowledge Search

```text
[Paste global]

CueAI Android Knowledge — SEARCH tab.
Tabs: Search (active) · Library · Add sources
Ask field + Ask button
Knowledge-backed answer card with citations (e.g. Security FAQ · Presenter Privacy Q&A)
Suggested prompts chips
Tab Knowledge active.
```

### 10 — Knowledge Library

```text
[Paste global]

CueAI Android Knowledge — LIBRARY.
Category filters: All · Product · Sales · Support FAQ · Q&A · Web
Document rows: title, format, category, indexed/needs-reindex, snippets count
Actions: Re-index · Delete
Sample docs: pricing PDF, security FAQ, architecture MD, privacy URL, Presenter Privacy Q&A
Tab Knowledge active.
```

### 11 — Knowledge Add sources

```text
[Paste global]

CueAI Android Knowledge — ADD SOURCES.
Upload chips: PDF · DOCX · TXT/MD
Website URL field + Add
Manual Q&A: question + answer fields
Category picker chips
CTA: Add to knowledge base
Tab Knowledge active.
```

### 12 — Resume Inputs

```text
[Paste global]

CueAI Android Resume Tailor — INPUTS step.
Steps: Inputs (active) → Analysis → Rewrite → Compare
Upload resume PDF/DOCX · Paste/upload JD
Fields: Target role, Experience level, Tone, Output DOCX/PDF
Content-integrity note: use only verified background
CTA: Analyze & tailor resume
Tab Resume active.
```

### 13 — Resume Analysis

```text
[Paste global]

CueAI Android Resume — ANALYSIS.
Match score large % (e.g. 88%)
Required / preferred skills chips
Keywords · Missing keywords · Skills gap list
CTA Continue to rewrite
Steps with Analysis active. Tab Resume active.
```

### 14 — Resume Rewrite

```text
[Paste global]

CueAI Android Resume — REWRITE.
Show tailored resume text (summary, experience, skills)
Actions: Copy · Compare · Export DOCX/PDF
Steps Rewrite active. Tab Resume active.
```

### 15 — Resume Compare

```text
[Paste global]

CueAI Android Resume — COMPARE.
Before/After toggle or split
Export DOCX · Export PDF
Steps Compare active. Tab Resume active.
```

### 16 — Privacy & safety

```text
[Paste global]

CueAI Android Privacy & safety.
Headline: Professional by design.
Warning callout: inform participants when transcription/AI is active.
Toggles: Presenter Privacy Mode · Meeting consent banner · Visual screen context · On-device-first audio
Responsible usage: not for deception, exams, or invented resume claims
Back to Home. Tab bar visible (Home or none special).
```

---

## Generation order (recommended)

1. Global system once in project notes  
2. **01–03 Auth** as one flow  
3. **04 Home**  
4. **05–06 Live**  
5. **07–08 Meetings** (upload your Meetings reference images)  
6. **09–11 Knowledge**  
7. **12–15 Resume**  
8. **16 Privacy**

Or paste the **Master one-shot** first for a full kit, then refine weak screens individually.

---

## Tips

- Always repeat: **No Notes — Meetings replaces Notes**
- Always include **Google + Apple** on Login/Sign up
- Keep **Sora/Figtree sans**, not serif titles from web mock refs
- Live overlay = **transparent teal glass**, not blue Cluely clone
- Upload Android prototype screenshots from `stitch-export/` when available for parity
