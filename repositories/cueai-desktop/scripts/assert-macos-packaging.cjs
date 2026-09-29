#!/usr/bin/env node
/**
 * electron-builder cannot produce macOS .dmg/.app on Windows or Linux
 * without a dedicated Mac (or a hosted Mac CI runner).
 */
if (process.platform !== "darwin") {
  console.error(`
CueAI for Mac cannot be packaged on ${process.platform}.

electron-builder only builds .dmg / .app on macOS:
https://www.electron.build/multi-platform-build

On this Windows machine, run CueAI for Mac in dev instead:

  npm run dev:web
  npm run dev:mac

Package the installer on a Mac (or GitHub Actions macos-latest):

  npm run dist:mac
`);
  process.exit(1);
}
