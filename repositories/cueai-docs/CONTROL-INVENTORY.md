# CueAI control inventory and audit

Checklist of interactive controls in the web app and the desktop overlays, what each one actually does, and its status after the October 2026 audit. Every row was checked by reading the handler code; "verified by test" names the automated test that exercises it.

Status values:

- **OK**: handler calls a real API or local action, shows loading/disabled state while busy, and reports errors.
- **Fixed**: was dead, fake or silent on failure; corrected in this audit.
- **Open**: known defect not fixed yet (see "Open findings").

## Architecture map (where controls lead)

```
Web app (cueai-web, Next.js 16)                       Desktop overlay (cueai-desktop/windows|macos)
  pages under src/app/(app)/*                          renderer src/App.tsx (React, contextIsolation, no nodeIntegration)
  │ fetch, cookie session                                │ window.cueai.* via contextBridge preload
  ▼                                                      ▼
  API routes src/app/api/*  ◄──── HTTPS + session/device credentials ────  services/live-answer.ts, screen requests
  │ requireAuth / requirePermission (role + workspace from signed session)
  ├─ @cueai/ai-orchestrator   ai-router (generateAi), credential-resolver, provider-health
  ├─ @cueai/knowledge-service rag-service (keyword or Qdrant vectors), kb-answer (KB-only answers)
  ├─ @cueai/resume-service, export-service, translation, transcription
  └─ FastAPI (cueai-api) for live answers/screen analysis when reachable
                                                       Electron main: electron/ipc/handlers.ts (companion:*, permissions:*, store:*)
```

Provider keys stay server-side (env, encrypted workspace catalog, encrypted per-user credentials). The overlay never holds a provider key; Knowledge Base mode is a `source: "knowledge_base"` field on the existing `/api/live/answer` request, and the server scopes it to the signed-in user's workspace.

## Navigation (sidebar, `src/lib/app-access.ts` → `CUEAI_NAV`)

| # | Item | Route | Who sees it | Status | Verified by test |
|---|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | all | OK | `test:navigation` |
| 2 | Resume Tailor | `/resume` | all | OK | `test:navigation` |
| 3 | Mock Interview | `/mock-interview` | all | Fixed (own page; opening it never starts a live session) | `test:navigation`, `test:mock-interview` |
| 4 | Live Session | `/meetings/live` | all | OK (legacy `?mode=mock`, `?session=`, `?mock=`, `?practice=` redirect to Mock Interview) | `test:navigation` |
| 5 | Meetings Summary | `/meetings` | all | OK | `test:navigation` |
| 6 | Knowledge Base | `/knowledge` | Admin | OK (User is redirected server-side to `/dashboard`) | `test:navigation` |
| 7 | Screen Context | `/screen-context` | Admin | OK | `test:navigation` |
| 8 | Translation | `/translation` | Admin | OK | `test:navigation` |
| 9 | Admin Portal | `/admin` | Admin | OK | `test:navigation` |
| 10 | Settings | `/settings` | all | OK | `test:navigation` |

## Top bar

| Control | Action | Status |
|---|---|---|
| Workspace switcher / rows | `POST /api/workspaces` | OK; rows lack a busy state (Open) |
| Search / command palette | Filters meetings and nav links | Fixed: label said "docs, answers"; now "Search meetings and pages"; input has `aria-label` |
| Theme toggle, notifications bell, mark all read, rows | local / navigation | OK |
| Account menu button | opens menu | Fixed: `aria-label`, `aria-haspopup`, `aria-expanded` |
| Account menu "Device & Security" | went to Profile | Fixed: renamed "Privacy", links to `/settings#privacy` |
| Profile, Settings, Log out | navigation / `logout` | OK |

## Dashboard

| Control | Action | Status |
|---|---|---|
| Try Again, Activities, Settings link | reload / toggle / link | OK |

## Resume Tailor (`/resume`)

| Control | Action | Status |
|---|---|---|
| Upload / drop / replace | type + 5 MB checks | OK |
| Analyze & Continue, Tailor, Re-check score, Retry | `/api/resume/analyze`, `/api/resume/score` with loading and errors | OK (`test:resume-tailor`, `test:resume-jd`) |
| Templates, Preview / Edit / Discard | local | OK |
| Download PDF | `POST /api/resume/pdf`, checks real file and page count | OK (`test:resume`) |
| Download DOCX | built locally and validated | OK (`test:resume`) |
| View Resume | opens PDF/TXT; DOCX downloads | Open (minor label) |

## Mock Interview (`/mock-interview`)

| Control | Action | Status |
|---|---|---|
| Resume select / upload | `/api/resume/extract` | Fixed: client 5 MB check (server also enforces 5 MB) |
| Job description upload | `/api/resume/extract` | Fixed: 5 MB check; message now lists Markdown, which is accepted |
| Role, optional JD, level (Fresher / Some Experience / Experienced) | local | OK |
| Start Mock Interview | `POST /api/meetings/mock` | OK (`test:mock-interview`) |
| Answer / Submit / Ctrl+Enter, Skip, Pause / Resume, End Interview | `…/mock/answer`, `…/mock/finish` | OK (`test:mock-interview`) |
| Continue from `?session=` | `loadMock` | Fixed: a bad or foreign link now shows an error instead of silently showing setup |
| Results: Generate / Retry | `…/mock/finish` | OK; scores labelled as AI estimates |
| Open in Meetings | link wrapping a button | Open (A11Y nested interactive) |

## Live Session (`/meetings/live`)

| Control | Action | Status |
|---|---|---|
| Mode toggle (Regular / Test CueAI) | local + URL | OK |
| Start Live Session → wizard | opens wizard | OK |
| Wizard: resume / job link / documents upload, remove doc | extract / `/api/meetings/knowledge` | Fixed: remove now reports a failed DELETE. Server enforces size and type (`RAG_MAX_UPLOAD_BYTES`) |
| Wizard: guidance level, auto-answer checkbox | were stored in a config nothing read (server hardcodes `balanced` / `true`) | Fixed: removed; the wizard says auto-answer is set in the overlay menu |
| Wizard: Start session | briefing PUT + meeting POST | Fixed: duplicate clicks ignored, button shows loading; a failed save shows a warning instead of silently starting an unsaved session |
| Private / Live | desktop session sync | OK |
| Waveform, "Listening…", "Streaming" badge | were driven by a 400 ms timer, not audio | Fixed: static text says audio is captured only in the desktop overlay (which has its own indicator); badge shows "Answering" only while a request runs |
| Transcript panel | web page never receives transcript lines | Fixed: says the transcript is in the desktop overlay and saved to the summary on end |
| Transcript scroll bar / bookmark | bookmark always jumped to 28% | Fixed: bar shows real scroll position; fake bookmark removed |
| Pause | stops only the local timer | Fixed: renamed "Pause timer" / "Resume timer" |
| End Session | PATCH was fire-and-forget inside a link | Fixed: a button that waits for the save, shows loading, reports failure, and offers "end without saving" |
| Ask | `/api/live/answer` stream | OK (`test:live-modes`, `test:live`) |
| Answer card Pin | local only, not saved | Open |

## Meetings Summary (`/meetings`, `/meetings/[id]/*`)

| Control | Action | Status |
|---|---|---|
| Scope tabs, search, filters | fetch / client filter | OK |
| Card badge | was always "Summary ready" | Fixed: "No summary" when the meeting has none |
| Delete meeting | `DELETE /api/meetings/[id]` | Fixed: failure and network errors are shown |
| Legacy `/meetings/summary` | always said "No meetings yet." | Fixed: now tells the user to pick a meeting |
| Summary / feed / translation links | links | OK (several wrap a `<Button>` in a `<Link>`: Open A11Y) |

## Knowledge Base (`/knowledge`, `/knowledge/documents/[id]`)

| Control | Action | Status | Verified by test |
|---|---|---|---|
| Upload (PDF, DOCX, TXT, MD, CSV) | `POST /api/admin/knowledge` (202 → background indexing) | Fixed: unsupported types are rejected before upload; server enforces size and type | `test:kb-overlay` (real PDF and DOCX) |
| Status badge | Processing / Ready / Indexing failed / Re-indexing | Fixed | `test:kb-overlay` |
| Retry indexing (failed docs) | `POST …/[id]/reindex` | Fixed (new) | `test:kb-overlay` scenario 6 |
| Re-index all | reindex per doc, disabled while busy | OK | |
| Ask (button / Enter) | `POST` query | Fixed: Enter no longer fires duplicate queries while busy | |
| Open file | `/file` | Fixed: was labelled "Open PDF" for every type | |
| Delete | `DELETE /api/admin/knowledge?id=` removes vectors, file and record | OK | `test:kb-overlay` scenario 7 |

## Screen Context (`/screen-context`)

| Control | Action | Status |
|---|---|---|
| Enable / Allow / Not now | local consent | Fixed: consent text promised app exclusion and pinning that do not exist; now describes the real behavior |
| Analyze Screen | capture + `POST /api/live/screen` | OK |
| Refresh | duplicate of Analyze Screen | Fixed: removed |
| Privacy on/off | on: exclude CueAI windows and hide preview; off: show preview | Fixed: tooltip states exactly this and that the overlay's own privacy setting is not changed |
| Status badge | said "OCR" | Fixed: "Vision ready / off" (a vision model is used) |
| Display list | showed a made-up "Built-in Display" | Fixed: shows only real displays, otherwise the "Open CueAI Desktop" hint |

## Translation (`/translation`)

| Control | Action | Status |
|---|---|---|
| Meeting list, tabs, bilingual, language buttons | `/api/admin/translate` | OK |
| Copy translation | clipboard | Fixed: disabled while translating; copy failure is shown |

## Admin Portal (`/admin`)

| Control | Action | Status |
|---|---|---|
| Workspace save, user search, role select, deactivate, send invite, revoke | admin APIs | OK |
| Resend invite | `PATCH /api/admin/invites` | Fixed: showed "Invite resent." when the email failed; now reports the delivery error |
| Privacy policies (share transcripts, AI training opt-in, PII redaction, invite-only) | saved but read by nothing | Fixed: shown as "Not enforced yet", no switch |
| AI provider / model buttons (enable, test, delete, set default, add) | `/api/admin/ai` | Open: no per-button loading; add/save clears input before the result |
| Retention numbers | PATCH on blur | Open: no revert on failure |
| Devices: activate, block, revoke, remove, allow replacement | `/api/admin/devices` | Fixed: network errors shown; revoke/remove ask for confirmation |

## Settings (`/settings`)

| Section / control | Action | Status | Verified by test |
|---|---|---|---|
| AI Providers & Models | `GET /api/settings/ai-providers` (read-only, sanitized) | Fixed: replaced fake model radios | `test:provider-status` |
| Profile save, personalization | `/api/profile` | OK | `test:profile` |
| Privacy | — | Fixed: four checkboxes saved nothing; replaced with links to the real controls | |
| Appearance, palette | theme APIs | OK | `test:themes` |
| Keyboard Shortcuts | read-only list | OK |
| Desktop Preferences toggles | `storeSet` in CueAI Desktop | Fixed: a failed save reverts the toggle and says so; "Prefer presenter layout" and "Auto-collapse" removed (the desktop app never reads them) | |
| Notifications | — | Fixed: checkboxes were read by nothing; replaced with a short explanation | |
| Workspace name | `PATCH /api/admin/workspace` | Fixed: loading/disabled state, error vs success colour; made-up "Slug" field removed | |
| Billing | checkout / portal APIs | OK (`test:billing`); "View all plans" / "Billing details" link to the same page (Open) |
| API Keys | `/api/settings/api-keys*` | OK | `test:api-keys` |
| Delete Account | was local-only while promising permanent deletion | Fixed: relabelled "Sign out and clear this device"; explains admins delete accounts in Admin Portal → Users | |

## Desktop overlay (Windows `cueai-desktop/windows/src/App.tsx`, macOS `cueai-desktop/macos/src/App.tsx`)

| Control | Windows | macOS | Action / IPC | Status |
|---|---|---|---|---|
| Ask field (Enter) | ✓ | ✓ (also Cmd/Ctrl+Enter) | `/api/live/answer` stream | OK (`npm test` in windows: live pipeline) |
| Answer / Reply | ✓ | ✓ | same, last heard question | OK; repeat click restarts (Open: no busy state) |
| General / Knowledge Base source | ✓ | ✓ | `source: "knowledge_base"`; sources, page, excerpt and NT notice shown; KB mode never falls back to general AI | Fixed (new) — `test:kb-overlay` |
| Screen | ✓ | ✓ | `companion:capture-screenshot` | OK |
| Mic / System audio | ✓ | ✓ | `getUserMedia` / loopback; indicator follows real capture state | OK |
| Auto-answer | menu | menu | gates auto replies | OK (not persisted) |
| Pin / Keep on top | menu | menu | `companion:pin` | Open: initial state overrides saved setting |
| Privacy | menu | header | `companion:set-exclude-capture` | Fixed: label shows "on (unconfirmed)" / "Unconfirmed" when the OS did not confirm exclusion; errors shown; macOS no longer invents a success status |
| End | menu | menu | `companion:end-session` | Fixed: failure is shown |
| Copy | ✓ | ✓ | clipboard | Fixed: failure is shown |
| Close / Done | ✓ | ✓ | clears answer card | Fixed: also stops a streaming answer |
| Hide (X), Esc | ✓ | ✓ | `companion:hide` | Open: capture keeps running while hidden, with no tray indicator |
| Timer | ✓ | ✓ | counts from overlay mount | Open: not tied to the session |
| Resize, drag | ✓ | ✓ | `companion:begin-resize` / `end-resize`, app-region | OK |

Shortcuts (global, when "Global keyboard shortcuts" is on): Mod+Shift+Space and Mod+Shift+C show/hide the overlay; Mod+K command palette; Mod+Shift+T and Mod+Shift+M open Live Session; Mod+Shift+S opens summaries. Esc hides the focused overlay. macOS app menu adds Cmd+, (Settings), Cmd+Shift+H, Cmd+M, Cmd+W.

## Open findings (not fixed in this audit)

Ordered by risk. These need a product or security decision, or are larger than a control fix.

1. **Desktop local bridge (security).** `electron/services/local-bridge.ts` on both platforms listens on `127.0.0.1:39291` with `Access-Control-Allow-Origin: *` and no auth. Any web page could call it, including `/screenshot` (Windows) and `/meeting/session` (which can start capture). Recommended: allow only the CueAI web origin and require a per-launch token.
2. **Capture permissions auto-granted.** Windows grants `media` and `display-capture` to every webContents in the default session and answers `getDisplayMedia` with the primary screen; macOS grants `display-capture` unconditionally. Recommended: grant only to the overlay window.
3. **Capture continues after Hide/Esc without a tray indicator.** Recommended: show recording state in the tray, or stop listening on hide.
4. **`setWindowOpenHandler` → `shell.openExternal` for any URL**, and **`store:set` accepts any key**. Recommended: reuse the http(s) allow-list; allow-list store keys. All windows use `sandbox: false`.
5. **Global shortcuts take over common keys** (Mod+K, Mod+Shift+T/S/C) system-wide, `register` results are not checked, and `start-transcription` / `generate-summary` events are sent but not handled by the web bridge.
6. **macOS has no `companion:push-answer`**, so Screen Context answers fall back to the in-page companion on Mac.
7. Pin state override, timer not tied to session, Answer button busy state, menu items without `menuitemcheckbox` (desktop).
8. Admin AI provider/model buttons without loading state; retention fields without revert; Live Session answer Pin not saved; nested link/button pairs; billing links to the current page; Resume "View Resume" label for DOCX.

## How to re-verify

```
cd repositories/cueai-web
npm run test:kb-overlay        # 10 required Knowledge Base scenarios + extras
npm run test:provider-status   # provider truthfulness, no secrets, auth
npm run test:navigation        # sidebar order, gating, mock routing
npx tsc --noEmit && npm run build
cd ../cueai-desktop/windows && npm run typecheck && npm test && npm run build
cd ../macos && npm run typecheck && npm run build
```
