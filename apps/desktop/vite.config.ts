import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

type Startup = () => Promise<void>;

let electronRestart: Promise<void> = Promise.resolve();

/**
 * vite-plugin-electron restarts Electron after every main-process rebuild by running
 * `taskkill /T /F` on the previous app. Two rebuilds in quick succession (an editor save plus a
 * sync client touching the file) start two restarts at once; the second taskkill finds the
 * process already gone, throws, and the unhandled rejection exits the dev server. Restarts are
 * queued here, and a restart whose target already exited simply launches a fresh app.
 */
function restartElectron(startup: Startup) {
  electronRestart = electronRestart.then(async () => {
    try {
      await startup();
    } catch (err) {
      const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
      console.warn(`[electron] previous app already exited (${reason}); starting a new one`);
      (process as NodeJS.Process & { electronApp?: unknown }).electronApp = undefined;
      await startup();
    }
  });
  return electronRestart;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main/index.ts",
        onstart: ({ startup }) => restartElectron(() => startup()),
        vite: {
          build: {
            outDir: "dist-electron/main",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/preload",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 15174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
