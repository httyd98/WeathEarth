import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "three/examples/jsm/controls/OrbitControls.js"]
        }
      }
    }
  }
});
