# CueAI Android

Capacitor native project for the Android app (`com.cueai.android`).

## Layout

| Path | Role |
|------|------|
| `android/` (this folder) | Gradle / Capacitor Android platform |
| Repo root `src/`, `index.html`, `vite.config.ts` | Capacitor web UI (Vite + React) |
| Repo root `capacitor.config.ts` | Capacitor config (`webDir: "dist"`) |

Capacitor expects the native project at `<capacitor-root>/android`. The Capacitor app root is the monorepo root so this folder stays top-level `android/`.

## Typical commands (from repo root)

```bash
npm run build   # or your Vite build that outputs to dist/
npx cap sync android
npx cap open android
```
