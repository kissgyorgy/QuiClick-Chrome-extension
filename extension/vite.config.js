import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: "dist",
    rollupOptions: {
      input: "src/script.js",
      output: {
        format: "iife",
        entryFileNames: "script.js",
        inlineDynamicImports: true,
      },
    },
  },
});
