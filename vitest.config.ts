import { defineConfig } from "vitest/config";

// Unit tests only — pure modules (lib/gst, lib/fy …), no DB, no DOM.
// Co-located as `lib/**/*.test.ts`.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
