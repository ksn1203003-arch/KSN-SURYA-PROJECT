import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico", "robots.txt", "icons/*.png"],
      manifest: {
        name: "TeachScript",
        short_name: "TeachScript",
        description: "AI-powered CS teaching platform for Indian schools",
        theme_color: "#378ADD",
        background_color: "#F5F4F0",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Pre-download only the app shell (page, styles, the main script, icons). Each role's dashboard
        // chunk is fetched the first time it is opened and then kept by the runtime rule below — a student
        // no longer downloads the teacher and admin dashboards on first install.
        globPatterns: ["**/*.{html,css,ico,svg,woff2}", "assets/index-*.js", "icons/*.png"],
        // Deep links such as /student/dashboard/lessons are answered with the app shell (index.html), but
        // API calls, health checks and anything that looks like a file (certificate PDFs, downloads)
        // must always reach the network and never be answered from the cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/health/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            // Built JS/CSS chunks have content hashes in their names, so a cached copy is never stale
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "app-chunks",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Only the app's own static pictures. Anything from the API (profile photos, logos,
            // certificates) is personal data and must never be kept in a cache on a shared school computer.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && !url.pathname.startsWith("/api/") && /\.(png|jpg|jpeg|svg|gif|webp)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
