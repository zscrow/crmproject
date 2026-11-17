import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/webhooks/whatsapp": "http://127.0.0.1:3001", "/api": {target:"http://127.0.0.1:8788", cookieDomainRewrite:""} },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.jsx"],
    setupFiles: ["./tests/setup.js"],
  },
});
