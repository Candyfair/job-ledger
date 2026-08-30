import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * SPEC.md §8 — extraction adapter contract test: every {@link
 * ExtractionAdapter} implementation must resolve to the same {@link
 * ExtractedListing} shape for the same fixture input. One mocked
 * `messages.create` branches on the requested `model` to hand back each
 * provider's own response shape (Haiku's `text` block vs. DeepSeek's
 * `tool_use` block) — the point being to prove both adapters converge on
 * identical output despite diverging response mechanics, never to make a
 * live call.
 */

const FIXTURE_LISTINGS = [
  {
    listingId: "l0",
    title: "Développeur Backend",
    company: "Doctolib",
    companyNormalized: "doctolib",
    roleCanonical: "backend-developer",
    datePosted: "2026-08-24",
    salaryRaw: null,
  },
];

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { ClaudeHaikuAdapter } from "./claude-haiku";
import { DeepSeekV4FlashAdapter } from "./deepseek-v4-flash";

describe("extraction adapter contract", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockImplementation((params: { model: string }) => {
      if (params.model === "deepseek-v4-flash") {
        return Promise.resolve({
          stop_reason: "end_turn",
          content: [
            {
              type: "tool_use",
              name: "submit_listings",
              input: { listings: FIXTURE_LISTINGS },
            },
          ],
        });
      }
      return Promise.resolve({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({ listings: FIXTURE_LISTINGS }),
          },
        ],
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves to the same output shape for both adapters given the same fixture", async () => {
    const haikuResult = await new ClaudeHaikuAdapter().extractListings(
      "raw content",
    );
    const deepseekResult = await new DeepSeekV4FlashAdapter().extractListings(
      "raw content",
    );

    expect(haikuResult).toEqual(FIXTURE_LISTINGS);
    expect(deepseekResult).toEqual(FIXTURE_LISTINGS);
    expect(deepseekResult).toEqual(haikuResult);
  });
});
