import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { checkTriggerRateLimit } from "./trigger-rate-limit";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TRIGGER_RATE_LIMIT_PER_HOUR;
});

afterEach(() => {
  delete process.env.TRIGGER_RATE_LIMIT_PER_HOUR;
});

describe("checkTriggerRateLimit", () => {
  it("allows and inserts a fresh counter when no row exists for the IP", async () => {
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain([]) as never);
    const insertChain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
    const values = insertChain.values.mock.calls[0][0] as {
      ipAddress: string;
      count: number;
      windowStart: Date;
    };
    expect(values.ipAddress).toBe("1.2.3.4");
    expect(values.count).toBe(1);
  });

  it("allows and increments while under the default threshold", async () => {
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([
        { ipAddress: "1.2.3.4", windowStart: new Date(), count: 3 },
      ]) as never,
    );
    const insertChain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
    const values = insertChain.values.mock.calls[0][0] as { count: number };
    expect(values.count).toBe(4);
  });

  it("rejects without writing once the count reaches the default threshold", async () => {
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([
        { ipAddress: "1.2.3.4", windowStart: new Date(), count: 5 },
      ]) as never,
    );

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("resets to count 1 and allows once the window has elapsed, even if count was over threshold", async () => {
    const staleWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000);
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([
        { ipAddress: "1.2.3.4", windowStart: staleWindowStart, count: 9 },
      ]) as never,
    );
    const insertChain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
    const values = insertChain.values.mock.calls[0][0] as {
      count: number;
      windowStart: Date;
    };
    expect(values.count).toBe(1);
    expect(values.windowStart.getTime()).not.toBe(staleWindowStart.getTime());
  });

  it("respects TRIGGER_RATE_LIMIT_PER_HOUR when set", async () => {
    process.env.TRIGGER_RATE_LIMIT_PER_HOUR = "2";
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([
        { ipAddress: "1.2.3.4", windowStart: new Date(), count: 2 },
      ]) as never,
    );

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("falls back to the default threshold when the env var is invalid", async () => {
    process.env.TRIGGER_RATE_LIMIT_PER_HOUR = "not-a-number";
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([
        { ipAddress: "1.2.3.4", windowStart: new Date(), count: 4 },
      ]) as never,
    );
    const insertChain = mockDrizzleChain([]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const result = await checkTriggerRateLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
  });
});
