import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli.ts",
    "src/vite-plugin.ts",
    "src/eslint-plugin.ts",
  ],
  format: "esm",
  dts: true,
  clean: true,
  outDir: "dist",
});
