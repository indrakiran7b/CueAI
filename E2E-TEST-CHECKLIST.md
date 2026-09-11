# CueAI E2E Test Checklist

Date: 2026-09-08  
Environment: Windows 10/11, Node 24, Chrome (Playwright), Electron 37.10.3

## Application Startup
- [x] Web dev server starts (`npm run dev:web`)
- [x] Landing page loads (200)
- [x] No fatal console errors on landing
- [x] Login page renders
- [x] Signup page renders
- [x] Desktop bridge health (`39291`)

## Routing
- [x] `/` — 200
- [x] `/login` — 200
- [x] `/signup` — 200
- [x] `/dashboard` — 200 (authenticated)
- [x] `/meetings` — 200
- [x] `/meetings/live` — 200
- [x] `/meetings/summary` — 200
- [x] `/resume` — 200
- [x] `/knowledge` — 200
- [x] `/translation` — 200
- [x] `/screen-context` — 200
- [x] `/companion` — 200
- [x] `/settings` — 200
- [x] `/design-system` — 200
- [x] `/forgot-password` — 200
- [x] `/admin` — redirects unauthenticated (307 → login)
- [x] Protected route redirect after logout

## Navigation
- [x] Sidebar: Dashboard
- [x] Sidebar: Meetings
- [x] Sidebar: Live Session
- [x] Sidebar: Knowledge Base
- [x] Sidebar: Translation
- [x] Sidebar: Settings
- [x] Rapid navigation (no crash)

## Authentication
- [x] Signup via API + UI session
- [x] Login invalid credentials error
- [x] Logout clears server cookie + client session
- [x] Protected routes blocked when logged out
- [x] Admin portal blocked for User role
- [ ] OAuth Google/GitHub (requires real OAuth credentials)
- [ ] Forgot password backend (UI stub only)

## Dashboard
- [x] Greeting + stats render (mock data)
- [x] Quick action links visible
- [x] Desktop Companion status shown

## Meetings
- [x] Meetings list renders (mock data)
- [x] Search input works

## Live Session
- [x] Page loads
- [x] Start/stop session UI (mock transcript/AI)
- [ ] Real microphone transcription (requires GROQ_API_KEY + mic permission)

## AI Answers
- [x] Live session mock AI suggestions display
- [ ] Real AI backend for live session (mock only in UI)

## Knowledge Base
- [x] Document list loads (localStorage mock)
- [x] Persists across reload

## Translation
- [x] Language switch (EN/HI/TE)
- [x] Copy translation feedback
- [x] Tab switching (mock static content)

## Screen Context
- [x] Permission/capture UI renders
- [ ] Native Windows capture in browser (Electron required)

## Resume
- [x] Upload UI renders
- [ ] Resume analyze API (requires GROQ_API_KEY — not run in automated suite)

## Admin
- [x] Non-admin redirect to dashboard
- [ ] Full admin CRUD (requires Admin role user)

## Settings
- [x] Page renders
- [x] Toggle persistence in localStorage

## Error Handling
- [x] Invalid login error message
- [x] Rapid navigation stability

## Production Build
- [x] `npm run build:web` — PASS
- [x] `npm run build:desktop` — PASS
- [ ] `npm run dist:desktop` — script restored; rebuild installer after quitting running CueAI

## Desktop Companion
- [x] Bridge health
- [x] Overlay show/hide/toggle
- [x] Companion UI loads bundled `dist/index.html`
- [x] Minimum bounds enforced (≥400×420)
- [x] Meeting session API
- [ ] Manual: all 8 resize directions
- [ ] Manual: expand/restore/pin/opacity
- [ ] Manual: global hotkey from external app
- [ ] Manual: mic on/off lifecycle
- [ ] Manual: system audio capture
- [ ] Manual: screenshot privacy hide/show
- [ ] Manual: content protection verification

## Automated Tests
- [x] Playwright suite (`npm run test:e2e`) — 15/15
- [x] Desktop bridge suite (`npm run test:e2e:desktop`) — 7/7
