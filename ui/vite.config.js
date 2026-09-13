import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The shipped bundle is minified but not anonymous: a readable header names the
// libraries it vendors, with the exact versions the lockfile resolved. The header is
// derived from package.json and package-lock.json only, so two builds of the same
// commit produce the same bytes.
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(__dirname, "package-lock.json"), "utf8"));
const VENDORED = [
  "react",
  "react-dom",
  "scheduler",
  "flexlayout-react",
  "prismjs",
  "react-colorful",
  "react-simple-code-editor",
  "modern-screenshot",
];

function lockedVersion(name) {
  const entry = lock.packages && lock.packages[`node_modules/${name}`];
  if (!entry || !entry.version) {
    throw new Error(`package-lock.json does not resolve ${name}; refresh the lockfile before building`);
  }
  return entry.version;
}

const banner = [
  `/*! BV Node Pack ${pkg.version} frontend bundle.`,
  ` * Built by Vite from the TypeScript sources in ui/src of`,
  ` * https://github.com/BlackVortexAI/bv_nodepack (GPL-3.0). Not obfuscated: this is`,
  ` * ordinary minified output; the sources, lockfile and build script are in the repository.`,
  ` * Vendored libraries (see THIRD_PARTY_NOTICES.md for licenses):`,
  ...VENDORED.map((name) => ` *   ${name} ${lockedVersion(name)}`),
  ` */`,
].join("\n");

function bundleBanner() {
  return {
    name: "bv-bundle-banner",
    // Runs after minification, so the header survives as readable text.
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk") {
          chunk.code = `${banner}\n${chunk.code}`;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), bundleBanner()],
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
      external: ["../../scripts/app.js", "/scripts/app.js", "../../scripts/api.js", "/scripts/api.js"],
      output: {
        entryFileNames: "[name].js",
        format: "es",
        inlineDynamicImports: true
      }
    }
  }
});
