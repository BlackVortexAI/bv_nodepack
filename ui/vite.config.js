import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    minify: true,
    sourcemap: false,

    // Output directly into ComfyUI runtime folder
    outDir: resolve(__dirname, "../js"),
    emptyOutDir: false,

    rollupOptions: {
      input: {
        // Add more entries over time:
        "bv_nodepack.core": resolve(__dirname, "src/index.tsx"),
      },
      external: ["../../scripts/app.js", "/scripts/app.js"],
      output: {
        entryFileNames: "[name].js",
        format: "es",
        inlineDynamicImports: true
      }
    }
  }
});
