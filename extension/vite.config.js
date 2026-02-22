import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    emptyOutDir: true,
    minify: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        script: "src/script.js",
        popup: "src/popup.js",
        background: "src/background.js",
        main: "src/tailwind.css",
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
