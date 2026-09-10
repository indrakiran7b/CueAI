# CueAI → Google Stitch Import Pack

Use this pack with [Google Stitch](https://stitch.withgoogle.com).

## How to import

1. Open **https://stitch.withgoogle.com** and sign in.
2. Create a **new project**.
3. Prefer **Pro / Experimental** mode (best for screenshot references).
4. Click **+ / image** next to the prompt box.
5. Upload the matching PNG from the `stitch-export/` folder.
6. Paste the matching prompt below → Generate.
7. Repeat per screen, or upload several related shots in one prompt for a flow.

---

## Global design system (paste once at the start of every prompt)

```text
Product: CueAI — professional Android meeting / sales / support / career AI copilot.
Not cheating or “undetectable” software. Consent-first, Presenter Privacy Mode.

Platform: Android mobile app (phone frame ~390×844).
Theme: dark ink UI with teal accent.

Colors:
- Background: #0B1215
- Elevated surface / cards: #152026
- Primary accent (teal): #14B8A6
- Deep teal: #0D9488
- Bright teal (active states): #2DD4BF
- Text: #F4FAF8
- Muted text: #A8C0B9
- Dim text: #7A948C
- Danger: #F87171
- Warning: #FBBF24

Typography:
- Display / headlines: Sora
- Body / UI: Figtree

Components:
- Bottom nav (always visible except live overlay session): Home, Live, Notes, Knowledge, Resume
- Active nav item uses bright teal #2DD4BF
- Primary CTA: teal gradient button #14B8A6 → #0D9488
- Cards: rounded ~16px, subtle border
- Chips / pills for status
- Glassmorphic floating overlay window for Live assistant

Match the uploaded screenshot closely: layout, hierarchy, spacing, and teal accents.
```

---

## Screen prompts

### 01 — Splash
**File:** `01-splash.png`

```text
[Paste global design system]

Recreate this Android splash screen from the screenshot.
Centered CueAI logo mark (teal rounded square), title “CueAI”, short product tagline, feature chips (system overlay / Presenter Privacy / consent-first), primary teal button “Enter Android prototype”, small footer disclaimer.
Single composition, dark background with soft teal glow behind logo.
```

### 02 — Home
**File:** `02-home.png`

```text
[Paste global design system]

Recreate the Home dashboard from the screenshot.
Header with CueAI brand + Consent chip.
Headline: “Your meeting copilot is ready.”
Live meeting hero card with “Start overlay window” CTA.
Quick action grid: Notes, Knowledge, Resume Tailor, Privacy.
“Up next” meeting list.
Bottom nav with Home active.
```

### 03 — Live launcher
**File:** `03-live-launcher.png`

```text
[Paste global design system]

Recreate the Live overlay launcher from the screenshot.
Title about starting a separate CueAI window.
Host app picker: Google Meet, Zoom, Teams.
Presenter Privacy Mode toggle.
Permission checklist (display over apps, mic, exclude from capture).
Primary CTA: “Start overlay session”.
Bottom nav with Live active.
```

### 04 — Live overlay on Meet
**File:** `04-live-overlay-meet.png`

```text
[Paste global design system]

Recreate the Live overlay session from the screenshot.
Full-screen Google Meet mock in the background (presenting slides).
Top “What others see (screen share)” preview showing CueAI hidden when privacy is on.
Separate floating CueAI glass window (draggable title bar, Private chip, Assist / What to say / Follow-ups / Recap, ask input).
Bottom session dock: Sharing, Privacy, Stop.
No main app bottom nav during session — CueAI is a system overlay window excluded from capture.
```

### 05–07 — Meeting Notes
**Files:** `05-notes-short.png`, `06-notes-detailed.png`, `07-notes-actions.png`

```text
[Paste global design system]

Recreate the Meeting Notes module from the screenshots.
Meeting selector chips.
Feature tabs: Short, Detailed, Decisions, Actions, Risks, Questions, Transcript, Email.
Show short/detailed summaries, actions with owner + due date, transcript saved badge.
Footer actions: Copy, Export MD, Export PDF.
Bottom nav with Notes active.
```

### 08–10 — Knowledge Base
**Files:** `08-knowledge-search.png`, `09-knowledge-library.png`, `10-knowledge-add.png`

```text
[Paste global design system]

Recreate the Knowledge Base from the screenshots.
Tabs: Search, Library, Add sources.
Search: semantic ask + knowledge-backed cited answer.
Library: documents with category filters (Product, Sales, Support FAQ, Q&A, Web), index status, Re-index, Delete.
Add sources: upload PDF/DOCX/TXT-MD, website URL, manual Q&A; category chips.
Bottom nav with Knowledge active.
```

### 11–14 — Resume Tailor (separate module)
**Files:** `11-resume-inputs.png`, `12-resume-analysis.png`, `13-resume-rewrite.png`, `14-resume-compare.png`

```text
[Paste global design system]

Recreate the Resume Tailor module as its own bottom-nav destination.
Steps: Inputs → Analysis → Rewrite → Compare.
Inputs: resume upload PDF/DOCX, JD paste + upload, target role, experience level, tone, output format DOCX/PDF, content-integrity note, “Analyze & tailor resume”.
Analysis: match score %, required/preferred skills, keywords, missing keywords, skills gap.
Rewrite: tailored resume text + copy/compare/export.
Compare: before/after toggle + DOCX/PDF export.
Bottom nav must remain visible with Resume active (teal).
```

### 15 — Privacy & safety
**File:** `15-privacy-settings.png`

```text
[Paste global design system]

Recreate Privacy & safety settings from the screenshot.
Toggles: Presenter Privacy Mode, Meeting consent banner, Visual screen context, on-device-first audio.
Responsible usage rules (not for deception / exams / invented resume claims).
Back to Home. Bottom nav visible.
```

---

## Optional DESIGN.md tokens (for Stitch design system)

```md
# CueAI Design System

## Colors
- bg: #0B1215
- surface: #152026
- primary: #14B8A6
- primary-deep: #0D9488
- primary-bright: #2DD4BF
- text: #F4FAF8
- text-muted: #A8C0B9

## Typography
- display: Sora
- body: Figtree

## Radius
- card: 16px
- nav: 22px
- pill: 999px

## Navigation
Home · Live · Notes · Knowledge · Resume
```

---

## Tips

- Upload **one screen + its prompt** for best fidelity.
- For the Live overlay, upload `04-live-overlay-meet.png` and stress “separate floating window over Meet, not inside Meet UI”.
- If you need **Figma export**, create a second Stitch project in **Rapid** mode and regenerate from the same prompts (image upload may be limited there).
- Keep saying: professional productivity copilot — not undetectable / cheating software.
