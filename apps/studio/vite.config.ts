import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["mediabunny", "fflate"] },
  server: {
    proxy: process.env.STUDIO_LOCAL_API
      ? { "/api/studio": { target: process.env.STUDIO_LOCAL_API } }
      : undefined,
  },
});
