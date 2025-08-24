import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000
  },
  build: {
    outDir: "dist"
  }
});
