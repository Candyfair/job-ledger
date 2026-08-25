import { defineConfig } from "@trigger.dev/sdk/v3";
import { playwright } from "@trigger.dev/build/extensions/playwright";

// project ref comes from the Trigger.dev dashboard (create a project there
// first) — set TRIGGER_PROJECT_REF locally / in CI, see .env.example.
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./trigger"],
  // Playwright navigation across up to 50 listings + per-page Claude Haiku
  // calls can run long; 10 minutes gives headroom without masking a genuine
  // site-level hang (which should hit the SiteStatus failure path instead).
  maxDuration: 600,
  build: {
    extensions: [playwright()],
  },
});
