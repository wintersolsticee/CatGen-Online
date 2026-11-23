import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:2567",
      "/matchmake": "http://localhost:2567",
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
});
