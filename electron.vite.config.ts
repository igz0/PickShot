import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const sharedAlias = {
  "@main": join(rootDir, "src/main"),
  "@preload": join(rootDir, "src/preload"),
  "@renderer": join(rootDir, "src/renderer"),
  "@shared": join(rootDir, "src/shared"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      rollupOptions: {
        output: {
          entryFileNames: "index.js",
        },
      },
    },
    resolve: {
      alias: sharedAlias,
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        output: {
          entryFileNames: "index.js",
        },
      },
    },
    resolve: {
      alias: sharedAlias,
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
      },
    },
    resolve: {
      alias: sharedAlias,
    },
  },
});
