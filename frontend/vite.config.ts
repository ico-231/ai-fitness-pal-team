import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Dev: Vite chạy ở :5173 và chuyển tiếp /api sang backend FastAPI :8000
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker (chỉ ở bản build; `npm run dev` không bật để khỏi kẹt cache khi phát triển).
    // registerType "prompt": bản mới KHÔNG tự reload giữa chừng (đang tập / đang chat) — hiện toast "Có bản mới · Tải lại".
    VitePWA({
      registerType: "prompt",
      injectRegister: false, // tự đăng ký trong src/lib/pwa.ts
      manifest: false, // dùng public/manifest.webmanifest (đã có link trong index.html)
      workbox: {
        // Precache app shell + file có hash. KHÔNG precache giọng PT (18 MB) và ảnh cơ thể.
        globPatterns: ["**/*.{js,css,html,woff2,svg,ico,webmanifest}", "*.png", "boot/*.png"],
        globIgnores: ["voice/**", "bodymap/**"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: null, // điều hướng xử lý bằng runtimeCaching (mạng trước, rớt mạng trả shell đã lưu)
        runtimeCaching: [
          {
            // Mở trang (HTML): mạng trước → mất mạng thì trả shell đã precache để app vẫn mở được
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "fitbro-pages",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10 },
              plugins: [{ handlerDidError: async () => (await caches.match("/index.html", { ignoreSearch: true })) || Response.error() }],
            },
          },
          {
            // Ảnh cơ thể + giọng PT thu sẵn: lưu dần khi dùng (cache-first), có giới hạn số tệp. Font Google có luật riêng bên dưới
            urlPattern: ({ url }) => /^\/(bodymap|voice)\//.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "fitbro-media", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "fitbro-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // /api/* KHÔNG được cache (dữ liệu người dùng + token): không có luật nào khớp → đi thẳng ra mạng.
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
