import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cueai.android",
  appName: "CueAI",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#090909",
    },
  },
};

export default config;
