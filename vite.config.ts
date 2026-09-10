import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { authRegisterPlugin } from "./scripts/auth-register-plugin";

export default defineConfig({
  base: "./",
  plugins: [react(), authRegisterPlugin()],
  server: {
    port: 5173,
  },
});
