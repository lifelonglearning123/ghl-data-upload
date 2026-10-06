import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In local dev, /api is served by uvicorn on port 8000 (see README).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
