import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Imported after the mock so the module-scope `new Anthropic()` in
// claude-haiku.ts picks up the mocked constructor.
import { ClaudeHaikuAdapter } from "./claude-haiku";

describe("ClaudeHaikuAdapter", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns valid entries and drops an individually-invalid one, without throwing", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
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
          }),
        },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new ClaudeHaikuAdapter();
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

    const adapter = new ClaudeHaikuAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toEqual([]);
  });

  it("returns an empty array (no throw) on unparseable JSON", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not json" }],
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const adapter = new ClaudeHaikuAdapter();
    const result = await adapter.extractListings("raw content");

    expect(result).toEqual([]);
  });

  describe("canonicalizeRoles", () => {
    it("returns an index-aligned array, tolerating a reordered / dropped entry", async () => {
      mockCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              roles: [
                { index: 1, roleCanonical: "backend-developer" },
                { index: 0, roleCanonical: "frontend-developer" },
                // no entry for index 2 — must come back null
              ],
            }),
          },
        ],
      });

      const adapter = new ClaudeHaikuAdapter();
      const result = await adapter.canonicalizeRoles([
        "Dév Frontend React",
        "Ingénieur Backend Python",
        "???",
      ]);

      expect(result).toEqual(["frontend-developer", "backend-developer", null]);
    });

    it("makes no API call and returns [] for an empty title list", async () => {
      const adapter = new ClaudeHaikuAdapter();
      const result = await adapter.canonicalizeRoles([]);

      expect(result).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("degrades to an all-null array (no throw) on a transport error", async () => {
      mockCreate.mockRejectedValue(new Error("network down"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const adapter = new ClaudeHaikuAdapter();
      const result = await adapter.canonicalizeRoles(["a", "b"]);

      expect(result).toEqual([null, null]);
    });
  });
});
