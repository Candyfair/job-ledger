import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExtractionAdapter, type ModelUsed } from "./adapter-registry";

// The real adapters run `new Anthropic()` at module scope; stub them so
// importing the registry never needs a live key or network. The guard under
// test runs before these are constructed anyway.
vi.mock("./claude-haiku", () => ({
  ClaudeHaikuAdapter: class {
    extractListings = vi.fn(async () => []);
  },
}));
vi.mock("./deepseek-v4-flash", () => ({
  DeepSeekV4FlashAdapter: class {
    extractListings = vi.fn(async () => []);
  },
}));

const KEY_ENV: Record<ModelUsed, string> = {
  claude_haiku: "ANTHROPIC_API_KEY",
  deepseek_v4_flash: "DEEPSEEK_API_KEY",
};

const MODELS = Object.keys(KEY_ENV) as ModelUsed[];

describe("getExtractionAdapter — API key guard", () => {
  const snapshot = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  };

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.clearAllMocks();
  });

  it.each(MODELS)("returns the adapter for %s when its key is set", (model) => {
    expect(getExtractionAdapter(model).extractListings).toBeInstanceOf(
      Function,
    );
  });

  it.each(MODELS)(
    "throws an error naming the missing env var for %s",
    (model) => {
      delete process.env[KEY_ENV[model]];
      expect(() => getExtractionAdapter(model)).toThrow(KEY_ENV[model]);
    },
  );

  it.each(MODELS)("treats an empty-string key as missing for %s", (model) => {
    process.env[KEY_ENV[model]] = "";
    expect(() => getExtractionAdapter(model)).toThrow(KEY_ENV[model]);
  });

  it("does not require the other model's key", () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(() => getExtractionAdapter("claude_haiku")).not.toThrow();
  });
});
