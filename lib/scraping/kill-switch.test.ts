import { describe, it, expect, afterEach } from "vitest";
import { isKillSwitchActive } from "./kill-switch";

const ORIGINAL = process.env.SCRAPING_KILL_SWITCH;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.SCRAPING_KILL_SWITCH;
  } else {
    process.env.SCRAPING_KILL_SWITCH = ORIGINAL;
  }
});

describe("isKillSwitchActive", () => {
  it("is inactive when the env var is unset", () => {
    delete process.env.SCRAPING_KILL_SWITCH;
    expect(isKillSwitchActive()).toBe(false);
  });

  it('is active for the exact string "true"', () => {
    process.env.SCRAPING_KILL_SWITCH = "true";
    expect(isKillSwitchActive()).toBe(true);
  });

  it('is inactive for "false"', () => {
    process.env.SCRAPING_KILL_SWITCH = "false";
    expect(isKillSwitchActive()).toBe(false);
  });

  it("is inactive for a garbage value", () => {
    process.env.SCRAPING_KILL_SWITCH = "TRUE";
    expect(isKillSwitchActive()).toBe(false);
  });
});
