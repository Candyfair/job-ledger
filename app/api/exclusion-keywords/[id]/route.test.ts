import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE } from "./route";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { mockDrizzleChain } from "@/lib/test/mock-db";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(),
}));

const session = { user: { id: "user-1" } };
const params = Promise.resolve({ id: "ek-1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/exclusion-keywords/:id", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/exclusion-keywords/ek-1"),
      { params },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 without leaking existence when the row belongs to another user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(db.delete).mockReturnValue(mockDrizzleChain([]) as never);

    const res = await DELETE(
      new Request("http://localhost/api/exclusion-keywords/ek-1"),
      { params },
    );

    expect(res.status).toBe(404);
  });

  it("deletes an exclusion keyword owned by the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(db.delete).mockReturnValue(
      mockDrizzleChain([{ id: "ek-1" }]) as never,
    );

    const res = await DELETE(
      new Request("http://localhost/api/exclusion-keywords/ek-1"),
      { params },
    );

    expect(res.status).toBe(204);
  });
});
