import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is packaged inside the Electron app for offline testing builds.
  output: "standalone",
  // Electron loads the app via 127.0.0.1; without this, Next.js 16 blocks /_next chunks
  // and client pages (e.g. Live Session) stay stuck on their SSR skeleton.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
