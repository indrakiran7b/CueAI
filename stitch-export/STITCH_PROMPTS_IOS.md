# CueAI iOS → Google Stitch Prompt Pack

Same product, screens, and **teal** design system as the Android prototype — adapted for **iOS** (iPhone frame, SF-style chrome, home indicator).

Use with [Google Stitch](https://stitch.withgoogle.com). Prefer **Pro / Experimental** mode. Upload Android screenshots from `stitch-export/` as references so layout stays consistent.

---

## Global design system (paste at the start of EVERY prompt)

```text
Product: CueAI — professional iOS meeting / sales / support / career AI copilot.
Consent-first. Presenter Privacy Mode. Not cheating or “undetectable” software.

Platform: iOS mobile app — iPhone 15 Pro frame (~393×852), Dynamic Island / status bar, home indicator.
Theme: dark ink UI with teal accent. Match the Android CueAI design language exactly (same colors, hierarchy, modules) but use native iOS patterns: large titles optional, SF Symbols–style icons, floating tab bar, glass sheets, and iOS-safe bottom padding.

Colors (must match Android):
- Background: #0B1215
- Elevated surface / cards: #152026
- Soft surface: #1A262C
- Primary accent (teal): #14B8A6
- Deep teal: #0D9488
- Bright teal (active states): #2DD4BF
- Teal soft fill: rgba(20,184,166,0.12)
- Text: #F4FAF8
- Muted text: #A8C0B9
- Dim text: #7A948C
- Border: rgba(148,184,176,0.22)
- Danger: #F87171
- Warning: #FBBF24
- Success: #34D399

Typography:
- Display / headlines: Sora (or closest geometric sans)
- Body / UI: Figtree (or SF Pro–like clean sans)
- Letter-spacing tight on headlines (−0.02em feel)

Components:
- Floating bottom tab bar (blurred dark glass): Home · Live · Notes · Knowledge · Resume
- Active tab: bright teal #2DD4BF
- Primary CTA: pill/rounded button with teal gradient #14B8A6 → #0D9488, dark text #042F2E
- Cards: ~16–18px radius, subtle teal-tinted border
- Chips / pills for Consent, Live, Privacy, status
- Live assistant: highly transparent glassmorphic floating overlay (teal accents, NOT blue like Cluely)
- Logo: teal rounded square speech-bubble mark + “CueAI”

Visual rules:
- One clear composition per screen; dark atmospheric background with soft teal radial glow
- No purple gradients, no cream/serif look, no Cluely blue
- Professional productivity copilot branding only
```

---

## Master one-shot prompt (all screens)

Paste this if you want Stitch to generate the full iOS set in one go:

```text
[Paste global design system]

Design a complete CueAI iOS app UI kit matching our existing Android CueAI MVP prototype, same teal dark theme and same feature modules.

Generate these screens for iPhone:

1) Splash — CueAI logo, tagline “Real-time meeting copilot with screen context, notes, translation, and resume tailor.”, chips: System overlay / Presenter Privacy / Consent-first, CTA “Enter iOS prototype”, footer “UI prototype · MVP v1.0 · Not for deception use”.

2) Home — Header CueAI + Consent on chip. Headline: “CueAI is ready for your next call.” Live meeting hero (Google Meet) with “Start overlay window”. Quick grid: Notes, Knowledge, Resume Tailor, Privacy. Up next list. Tab bar Home active.

3) Live launcher — “Start a separate CueAI window.” Host picker Meet / Zoom / Teams. Presenter Privacy Mode toggle. Permission rows (display over apps, mic, exclude from capture). CTA “Start overlay session”. Tab Live active.

4) Live overlay session — Full-screen Meet mock presenting slides. Top “What others see (screen share)” strip with “CueAI hidden”. Floating transparent CueAI glass panel: drag island, Private chip, live transcript strip, Listening + “What should I say?”, Assist / What to say / Follow-ups / Recap chips, Smart + language + ask input + send. Bottom dock Sharing / Privacy / Stop. No main tab bar.

5) Notes — Meeting chips, tabs Short / Detailed / Decisions / Actions / Risks / Questions / Transcript / Email, export Copy / MD / PDF. Tab Notes active.

6) Knowledge — Tabs Search / Library / Add sources, cited RAG answer, doc library with filters, upload PDF/DOCX/URL/Q&A. Tab Knowledge active.

7) Resume Tailor — Steps Inputs → Analysis → Rewrite → Compare, upload resume + JD, match score, rewrite, before/after. Tab Resume active.

8) Privacy & safety — Toggles Presenter Privacy, consent banner, visual screen context, on-device-first audio + responsible usage rules.

Keep identical teal palette and information architecture as Android CueAI. Make chrome feel native iOS (status bar, home indicator, glass tab bar). High-fidelity dark UI mockups.
```

---

## Per-screen prompts

### 01 — Splash

```text
[Paste global design system]

Design an iOS splash / onboarding screen for CueAI.
Centered teal rounded-square logo mark, title “CueAI”, short product tagline about meeting copilot + screen context + notes + translation + resume tailor.
Feature chips: System overlay window · Presenter Privacy Mode · Consent-first.
Primary teal CTA: “Enter iOS prototype”.
Small footer: “UI prototype · MVP v1.0 · Not for deception use”.
Single composition, dark #0B1215 with soft teal glow behind the logo. iPhone frame with home indicator.
```

### 02 — Home

```text
[Paste global design system]

Design the CueAI iOS Home dashboard.
Header: CueAI brand mark + “Consent on” teal chip.
Eyebrow “TODAY”. Headline: “CueAI is ready for your next call.”
Supporting line about transparent overlay assist, screen context, notes, translation, resume tailor.
Live meeting hero card (Live now · Google Meet · Enterprise discovery) with primary CTA “Start overlay window”.
2×2 quick actions: Notes, Knowledge, Resume Tailor, Privacy.
“Up next” meeting cards (Soon / Done).
Floating glass tab bar with Home active in #2DD4BF.
```

### 03 — Live launcher

```text
[Paste global design system]

Design the CueAI iOS Live launcher screen.
Eyebrow “SYSTEM OVERLAY”. Headline: “Start a separate CueAI window.”
Explain CueAI floats above Meet / Zoom / Teams as its own window, not inside the meeting UI.
Host app picker cards: Google Meet, Zoom, Teams (one selected with teal border).
Presenter Privacy Mode toggle row (on).
Permission checklist: Display over other apps · Microphone · Exclude overlay from screen capture.
Primary CTA: “Start overlay session”.
Tab bar with Live active.
```

### 04 — Live overlay (glass window)

```text
[Paste global design system]

Design the CueAI iOS live overlay session.
Background: full-screen Google Meet mock — “You are presenting · Architecture overview · Slide 4 of 12”.
Top strip: “What others see (screen share)” with teal “CueAI hidden” chip and “Overlay excluded from capture”.
Floating CueAI glassmorphic overlay (high transparency + blur, teal accents — NOT Cluely blue):
- Compact pill island: CueAI logo, “Overlay · drag to move”, Private chip, minimize
- Banner: Hidden from screen share
- Live transcript strip (speaker name in teal)
- Listening chip + “What should I say?” teal pill CTA
- AI answer text area
- Horizontal mode chips: Assist · What to say · Follow-ups · Recap
- Input row: Smart · EN · ask field · teal send
Bottom session dock: Sharing · Privacy · Stop.
No main tab bar during this session.
```

### 05 — Notes

```text
[Paste global design system]

Design CueAI iOS Meeting Notes.
Meeting selector chips, feature tabs: Short, Detailed, Decisions, Actions, Risks, Questions, Transcript, Email.
Show short summary content, action items with owner + due, translate control.
Footer: Copy · Export MD · Export PDF.
Tab bar Notes active (#2DD4BF).
```

### 06 — Knowledge

```text
[Paste global design system]

Design CueAI iOS Knowledge Base.
Tabs: Search · Library · Add sources.
Search: ask field + knowledge-backed cited answer card.
Library: documents with category filters (Product, Sales, Support FAQ, Q&A, Web), indexed status, Re-index / Delete.
Add sources: PDF / DOCX / TXT-MD / Website URL / Manual Q&A.
Tab bar Knowledge active.
```

### 07 — Resume Tailor

```text
[Paste global design system]

Design CueAI iOS Resume Tailor as its own tab destination.
Step pills: Inputs → Analysis → Rewrite → Compare.
Inputs: resume upload PDF/DOCX, JD paste + upload, target role, experience level, tone, output DOCX/PDF, content-integrity note, CTA “Analyze & tailor resume”.
Also show Analysis (match score %), Rewrite, and Compare before/after variants if generating a flow.
Tab bar Resume active. Consent-first, truthful rewrite messaging.
```

### 08 — Privacy

```text
[Paste global design system]

Design CueAI iOS Privacy & safety settings.
Headline: “Professional by design.”
Warning callout about informing participants when transcription/AI is active.
Toggles: Presenter Privacy Mode, Meeting consent banner, Visual screen context, On-device-first audio.
Responsible usage rules: not for deception, exams, or invented resume claims.
Back control + tab bar visible.
```

---

## Optional DESIGN.md for Stitch

```md
# CueAI iOS Design System

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
- tab bar: 22px
- pill: 999px

## Navigation
Home · Live · Notes · Knowledge · Resume
```

---

## Tips

1. Create a **new Stitch project** named `CueAI iOS`.
2. Paste the **global design system** into every generation.
3. Upload Android PNGs from `stitch-export/` as references for 1:1 layout parity.
4. Start with the **Master one-shot** for the full kit, then refine **04 Live overlay** alone for glass quality.
5. Keep saying: **teal dark theme**, **iPhone frame**, **same as Android CueAI**, **not Cluely blue**.
