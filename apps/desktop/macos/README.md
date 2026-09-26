# CueAI for Mac

macOS desktop target. Same backend, auth, meetings, AI pipeline, and data as Windows and web. Platform-specific code lives in `electron/platform/macos/`.

## Run

From the repo root:

```bash
npm run dev:mac
```

Or start web and desktop separately:

```bash
npm run dev:web:mac
npm run dev:desktop:mac
```

The workspace starts at Login / Signup when you are signed out. The companion HUD loads on `http://127.0.0.1:15175`. Toggle it with **⌘⇧Space**.

## Package

A `.dmg` / `.app` can only be built on macOS:

```bash
npm run build:mac
npm run dist:mac
```

electron-builder produces `CueAI.app` inside a `CueAI.dmg` (universal arm64 + x64 when practical).

## Platform services

| Concern | Implementation |
|---|---|
| Permissions | `electron/platform/macos/macosPermissions.ts` |
| System audio | `MacOSSystemAudioService` — not Windows loopback |
| Screen capture | `macosCapture.ts` — physical displays, CueAI windows hidden |
| Overlay protection | `setOverlayCaptureProtection` → `setContentProtection` / NSWindowSharingNone |
| Window chrome | hiddenInset traffic lights, HUD companion, Dock activate |

Windows CueAI lives in `apps/desktop/windows`.
