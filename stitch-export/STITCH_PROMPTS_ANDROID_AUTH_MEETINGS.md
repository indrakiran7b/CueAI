# CueAI Android → Google Stitch Prompts
## Auth (Login / Signup) + Meetings (replaces Notes)

Use with [Google Stitch](https://stitch.withgoogle.com). Prefer **Pro / Experimental**. Upload the Meetings reference PNGs when generating Meetings screens.

---

## Global design system (paste at the start of EVERY prompt)

```text
Product: CueAI — professional Android AI meeting / sales / support / career copilot.
Consent-first. Presenter Privacy Mode. Not cheating or “undetectable” software.

Platform: Android phone frame ~390×844. Material-ish mobile UI with CueAI branding.
Theme: dark ink UI with teal accent (same as CueAI Android prototype).

Colors:
- Background: #0B1215
- Elevated surface / cards: #152026
- Soft surface: #1A262C
- Primary teal: #14B8A6
- Deep teal: #0D9488
- Bright teal (active): #2DD4BF
- Teal soft: rgba(20,184,166,0.12)
- Text: #F4FAF8
- Muted text: #A8C0B9
- Dim text: #7A948C
- Border: rgba(148,184,176,0.22)
- Danger / live: #F87171
- Warning: #FBBF24
- Success: #34D399

Typography:
- Display / large titles: Sora (modern geometric sans — NOT serif)
- Body / UI: Figtree
- Avoid Playfair/serif headlines; keep CueAI sans brand language

Navigation (after login):
Bottom floating glass tab bar: Home · Live · Meetings · Knowledge · Resume
Active tab = #2DD4BF
IMPORTANT: There is NO Notes tab. Meetings replaces Notes.

Components:
- Primary CTA: teal gradient #14B8A6 → #0D9488, text #042F2E, rounded ~14–16px
- Ghost / outline buttons: teal border, transparent fill
- Cards: ~16px radius, subtle border
- Chips / status pills for Live, Summary ready, Open, Done
- Inputs: dark fields, teal focus ring
- Social auth buttons: outlined dark pills with brand icons (Gmail / Apple)

Visual rules:
- Dark atmospheric background with soft teal glow
- No purple gradients, no cream/serif look, no Cluely blue
- Professional productivity branding only
```

---

## Master flow prompt (full auth + meetings kit)

```text
[Paste global design system]

Design a CueAI Android UI kit covering authentication and Meetings.

Generate these screens for Android phone:

A) Welcome / Auth gate
B) Login
C) Sign up
D) Meetings list
E) Meeting detail (summary)

AUTH REQUIREMENTS:
- Login and Sign up are alternate modes on related screens (tabs or segmented control: Login | Sign up)
- Email + password fields
- Alternate social login/signup options:
  1) Continue with Google / Gmail
  2) Continue with Apple
- Divider: “or continue with email”
- Consent-first microcopy
- Primary teal CTAs
- Link to switch between Login and Sign up

MEETINGS (replaces Notes entirely):
Use content inspired by the uploaded Meetings references, restyled to CueAI teal dark sans UI (no serif titles).

Meetings list:
- Title “Meetings”
- Subtitle: “Live sessions, recordings, and AI summaries in one place.”
- Search “Search meetings…”
- Filters button
- Optional “New live session” outline CTA
- Grid/list of meeting cards:
  1) Q3 Product Sync — Summary ready — Today · 10:00 AM · 42m · 8 attendees — tags Product, Roadmap
  2) Enterprise Security Review — Live (red dot) — Today · 2:30 PM · 28m · 5 attendees — tag Security
  3) Customer Success Weekly — Summary ready — Yesterday · 55m · 12 attendees — tag CS
  4) Design Critique — CueAI Companion — Summary ready — Mon · 36m · 6 attendees — tag Design
- Each card: teal camera icon circle, status pill, title, metadata, tags
- Bottom tab bar with Meetings active

Meeting detail (Q3 Product Sync):
- Status pill “Summary ready”
- Title “Q3 Product Sync”
- Meta: Today · 42 min · 8 attendees · Generated in 18s
- Executive summary card with the enterprise rollout / latency SLO / Screen Context opt-in / SSO deferred copy
- Key decisions list with teal checkmarks
- Risks & open questions (warning risk + open question)
- Action items section with task / owner / due / status (Open yellow / Done green)
- Bottom tab bar Meetings active OR detail with back chevron

High-fidelity dark Android mockups. Teal CueAI system only.
```

---

## Per-screen prompts

### 01 — Welcome / Auth gate

```text
[Paste global design system]

Design CueAI Android welcome/auth gate screen.
Centered CueAI teal logo mark + large brand “CueAI”.
Tagline: “Your real-time meeting copilot.”
Short line: “Live answers, screen context, meetings, knowledge, and resume tailor.”
Primary CTA: “Log in”
Secondary outline CTA: “Create account”
Small social row preview icons for Google and Apple (not full buttons yet) OR skip social here.
Footer: “Consent-first · Presenter Privacy Mode · Not for deception use”
Dark #0B1215 with soft teal glow. No bottom tab bar.
```

### 02 — Login

```text
[Paste global design system]

Design CueAI Android LOGIN screen.
Top: back chevron optional + CueAI mark.
Segmented control / tabs: Login (active) | Sign up
Headline: “Welcome back”
Subtext: “Log in to continue to your meeting copilot.”

Social auth (stacked full-width outline buttons):
1) Continue with Google (Gmail/Google “G” icon)
2) Continue with Apple (Apple logo icon)

Divider with text: “or continue with email”

Form fields:
- Email
- Password (with show/hide)
Primary teal button: “Log in”
Row: “Forgot password?” link
Bottom: “Don’t have an account? Sign up” (switches to signup)

Tiny consent line: “By continuing you agree to CueAI’s Terms and Privacy Policy.”
No bottom tab bar. Dark teal CueAI style.
```

### 03 — Sign up

```text
[Paste global design system]

Design CueAI Android SIGN UP screen.
Segmented control: Login | Sign up (active)
Headline: “Create your CueAI account”
Subtext: “Start with meetings, live assist, knowledge, and resume tailor.”

Social auth (stacked):
1) Sign up with Google
2) Sign up with Apple

Divider: “or continue with email”

Fields:
- Full name
- Work email
- Password
- Confirm password
Optional checkbox: “Send me product updates” (unchecked by default)

Primary teal CTA: “Create account”
Bottom: “Already have an account? Log in”

Consent microcopy under CTA.
No bottom tab bar. Same visual language as Login.
```

### 04 — Meetings list (replaces Notes)

```text
[Paste global design system]

Design CueAI Android MEETINGS list screen. This replaces Notes — do not show a Notes tab or notes content.

Header: “Meetings”
Subtitle: “Live sessions, recordings, and AI summaries in one place.”
Right: outline button “New live session” with camera icon.

Search field: “Search meetings…”
Filters chip/button on the right.

Meeting cards (2-column on wide phone or stacked vertical cards — prefer stacked for Android):

Card 1:
- Teal camera icon circle
- Pill: Summary ready (teal/success)
- Title: Q3 Product Sync
- Meta: Today · 10:00 AM · 42m · 8 attendees
- Tags: Product · Roadmap

Card 2:
- Pill: Live with red live-dot
- Title: Enterprise Security Review
- Meta: Today · 2:30 PM · 28m · 5 attendees
- Tag: Security

Card 3:
- Pill: Summary ready
- Title: Customer Success Weekly
- Meta: Yesterday · 55m · 12 attendees
- Tag: CS

Card 4:
- Pill: Summary ready
- Title: Design Critique — CueAI Companion
- Meta: Mon · 36m · 6 attendees
- Tag: Design

Bottom tab bar: Home · Live · Meetings (active teal) · Knowledge · Resume
Match uploaded Meetings reference layout/hierarchy, but CueAI teal dark sans styling (no serif titles, no non-CueAI chrome).
```

### 05 — Meeting detail / summary

```text
[Paste global design system]

Design CueAI Android meeting DETAIL / SUMMARY screen for “Q3 Product Sync”. Match the uploaded summary reference content, restyled to CueAI teal.

Top: back chevron + optional share/export icons.
Status pill: Summary ready (green/teal)
Large title: Q3 Product Sync
Meta: Today · 42 min · 8 attendees · Generated in 18s

Section card — Executive summary:
“The team aligned on a three-phase enterprise rollout for CueAI Companion. Latency SLOs were set at p95 under 800ms for live suggestions. Screen Context will remain opt-in with explicit privacy controls. SSO / SCIM is deferred to Phase 3 pending Security review.”

Section — Key decisions (checkmark items):
- Ship Companion glass panel in two sprints
- Keep Screen Context opt-in for enterprise
- Defer deep RAG when confidence < 0.7

Section — Risks & open questions:
- Risk (warning icon): Latency may spike on low-bandwidth enterprise VPNs.
- Question: Which region locks are required for EU workspaces?

Section — Action items (badge “2 open”):
Table-like rows (mobile stacked or compact table):
1) Finalize Companion latency SLOs · Marcus Lee · Aug 12 · Open
2) Draft opt-in privacy copy for screen capture · Alex Chen · Aug 10 · Open
3) Share enterprise SSO checklist with Security · Priya Nair · Aug 14 · Done

Footer actions optional: Copy summary · Export PDF · Share
Bottom tab bar can stay with Meetings active, or hide and use back-only detail chrome.
High-fidelity Android mockup, CueAI teal dark system.
```

---

## Tips for Stitch

1. Create project **CueAI Android Auth + Meetings**.
2. Paste **global design system** every time.
3. Upload your Meetings list + summary screenshots as references for screens 04–05.
4. Generate Login + Sign up as a pair so the Login | Sign up switch matches.
5. Explicitly say each time: **No Notes tab — Meetings replaces Notes**.
6. Keep fonts **Sora + Figtree** (sans), not the serif title from the reference mock.
