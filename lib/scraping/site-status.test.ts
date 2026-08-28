import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { markSiteFailed } from "./site-status";

vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markSiteFailed", () => {
  it("upserts the site row inactive with the cause, note, and a timestamp", async () => {
    const chain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(chain as never);

    await markSiteFailed("apec", "bot_challenge", "Accès bloqué");

    const values = vi.mocked(chain.values).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(values).toMatchObject({
      site: "apec",
      active: false,
      lastErrorNote: "Accès bloqué",
      lastFailureCause: "bot_challenge",
    });
    expect(values.lastErrorAt).toBeInstanceOf(Date);

    // .values(...) returns the next link in the chain; the upsert clause is
    // called on that.
    const afterValues = vi.mocked(chain.values).mock.results[0].value as {
      onConflictDoUpdate: ReturnType<typeof vi.fn>;
    };
    const conflict = afterValues.onConflictDoUpdate.mock.calls[0][0] as {
      set: Record<string, unknown>;
    };
    expect(conflict.set).toMatchObject({
      active: false,
      lastErrorNote: "Accès bloqué",
      lastFailureCause: "bot_challenge",
    });
    expect(conflict.set.lastErrorAt).toBeInstanceOf(Date);
  });

  it("passes markup_broken through unchanged", async () => {
    const chain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(chain as never);

    await markSiteFailed("hellowork", "markup_broken", "Le site a changé");

    const values = vi.mocked(chain.values).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(values.site).toBe("hellowork");
    expect(values.lastFailureCause).toBe("markup_broken");
  });
});
