import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { cpSync } from "fs";

function copyStatic() {
  return {
    name: "copy-static",
    writeBundle() {
      cpSync("icons", "dist/icons", { recursive: true });
      cpSync("src/newtab.html", "dist/newtab.html");
      cpSync("src/popup.html", "dist/popup.html");
      cpSync("manifest.json", "dist/manifest.json");
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), copyStatic()],
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
