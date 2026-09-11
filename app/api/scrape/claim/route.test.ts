import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { mockDrizzleChain } from "@/lib/test/mock-db";

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(),
}));

const session = { user: { id: "user-1" } };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/scrape/claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/scrape/claim", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await POST(postRequest({ runId: "run-1" }));

    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing or not a string", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);

    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("claims an unowned run for the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const updateChain = mockDrizzleChain([]);
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const res = await POST(postRequest({ runId: "run-1" }));

    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("is a no-op (still 200) against an already-claimed run", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    // The WHERE clause scopes to userId IS NULL, so an already-claimed run
    // simply matches nothing — same shape as claiming a nonexistent runId.
    vi.mocked(db.update).mockReturnValue(mockDrizzleChain([]) as never);

    const res = await POST(postRequest({ runId: "already-claimed" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
