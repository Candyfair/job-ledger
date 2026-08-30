import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate, mockConstructor } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockConstructor: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
    constructor(options: unknown) {
      mockConstructor(options);
    }
  },
}));

// Imported after the mock so the module-scope `new Anthropic()` in
// deepseek-v4-flash.ts picks up the mocked constructor.
import { DeepSeekV4FlashAdapter } from "./deepseek-v4-flash";

describe("DeepSeekV4FlashAdapter", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs its own Anthropic client against DeepSeek's baseURL and API key, never Claude's", () => {
    // Regression guard: both adapters use the same SDK package now, so a
    // copy-paste mix-up of baseURL/apiKey would go undetected by any test
    // that only checks messages.create()'s return shape.
    expect(mockConstructor).toHaveBeenCalledWith({
      baseURL: "https://api.deepseek.com/anthropic",
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  });

  it("returns valid entries and drops an individually-invalid one, without throwing", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "tool_use",
          name: "submit_listings",
          input: {
            listings: [
              {
                listingId: "l0",
                title: "Développeur Backend",
                company: "Doctolib",
                companyNormalized: "doctolib",
                roleCanonical: "backend-developer",
                datePosted: "2026-08-24",
                salaryRaw: null,
              },
              {
                // missing required "title" — individually invalid
                listingId: "l1",
                company: null,
                companyNormalized: null,
                roleCanonical: null,
                datePosted: null,
                salaryRaw: null,
              },
            ],
          },
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new DeepSeekV4FlashAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toHaveLength(1);
    expect(result[0].listingId).toBe("l0");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns an empty array (no throw) on a refusal stop_reason", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "refusal",
      content: [],
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new DeepSeekV4FlashAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toEqual([]);
  });

  it("returns an empty array (no throw) when no matching tool_use block is present", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "I refuse to call the tool." }],
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new DeepSeekV4FlashAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toEqual([]);
  });

  it("returns an empty array (no throw) when the tool input has no listings", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "tool_use", name: "submit_listings", input: {} }],
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new DeepSeekV4FlashAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toEqual([]);
  });
});
