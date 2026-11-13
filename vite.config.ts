import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise the warning threshold to suppress false positives from large
    // but already-lazy-loaded sections (e.g. AttendanceManagementSection
    // which embeds jsQR). The real guard is code-splitting below.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // ── Heavy vendor libraries → their own cacheable chunks ──────────
          if (id.includes("node_modules/recharts") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/victory-vendor")) {
            return "vendor-charts";
          }
          // The WebGL background is lazy-loaded; keep three.js out of the shared vendor chunk.
          if (/node_modules\/(three|three-stdlib|@react-three|@shadergradient|camera-controls)\//.test(id)) {
            return "vendor-three";
          }
          if (id.includes("node_modules/gsap")) {
            return "vendor-gsap";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/jsqr")) {
            return "vendor-jsqr";
          }
          if (id.includes("node_modules/qrcode")) {
            return "vendor-qrcode";
          }
          if (id.includes("node_modules/read-excel-file")) {
            return "vendor-excel";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-lucide";
          }
          // All remaining node_modules → shared vendor chunk
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
