import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/renderer/src/**/*.test.tsx", "src/main/**/*.test.ts"],
    server: { deps: { inline: ["@once-ui-system/core"] } },
  },
});
