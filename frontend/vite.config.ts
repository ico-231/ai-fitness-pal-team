import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: Vite chạy ở :5173 và chuyển tiếp /api sang backend FastAPI :8000
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
