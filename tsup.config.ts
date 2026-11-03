import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    tui: "src/tui.tsx",
    rpc: "src/rpc.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  external: [
    "@opencode/plugin",
    "@opencode/plugin/rpc",
    "@opencode/plugin/tui",
    "@opencode/client",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
  ],
})
