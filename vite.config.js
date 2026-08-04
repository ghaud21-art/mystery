import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon-16.png", "icons/favicon-32.png", "icons/apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallbackDenylist: [/^\/__/],
      },
      manifest: {
        id: "/",
        name: "머더미스터리",
        short_name: "머더미스터리",
        description: "생각하는 힘을 기르는 사람들의 성향 궁합 + 모임 기록 커뮤니티",
        lang: "ko",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#14141f",
        theme_color: "#14141f",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
