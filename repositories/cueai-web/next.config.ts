import type { NextConfig } from "next";

/** Extract hostname (and optional port) from a public URL for Next allowedDevOrigins. */
function hostFromUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim()).host;
  } catch {
    // Allow bare hostnames like "abc.ngrok-free.app"
    return value.replace(/^https?:\/\//, "").split("/")[0] || undefined;
  }
}

const publicAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NGROK_URL ||
  process.env.AUTH_URL;

const ngrokHost = hostFromUrl(publicAppUrl);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@cueai/shared-libraries",
    "@cueai/ai-orchestrator",
    "@cueai/notification-service",
    "@cueai/translation-service",
    "@cueai/export-service",
    "@cueai/resume-service",
    "@cueai/knowledge-service",
    "@cueai/screen-context-service",
    "@cueai/transcription-service",
    "@cueai/gateway",
  ],
  // Standalone output is packaged inside the Electron app for offline testing builds.
  output: "standalone",
  // Electron loads via 127.0.0.1; ngrok clients load via *.ngrok-free.app.
  // Without matching allowedDevOrigins, Next.js 16 blocks /_next assets for those hosts.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
    ...(ngrokHost ? [ngrokHost] : []),
  ],
};

export default nextConfig;
