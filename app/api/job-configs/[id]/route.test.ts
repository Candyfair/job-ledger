import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH, DELETE } from "./route";
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
const params = Promise.resolve({ id: "jc-1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/job-configs/:id", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await PATCH(
      new Request("http://localhost/api/job-configs/jc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New title" }),
      }),
      { params },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 without leaking existence when the row belongs to another user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    // The WHERE clause scopes to userId, so a cross-user row simply matches
    // nothing — .returning() resolves to an empty array, same as a missing id.
    vi.mocked(db.update).mockReturnValue(mockDrizzleChain([]) as never);

    const res = await PATCH(
      new Request("http://localhost/api/job-configs/jc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New title" }),
      }),
      { params },
    );

    expect(res.status).toBe(404);
  });

  it("updates a job config owned by the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const updated = {
      id: "jc-1",
      userId: "user-1",
      title: "New title",
      excludedKeywords: ["Go"],
      location: null,
    };
    vi.mocked(db.update).mockReturnValue(mockDrizzleChain([updated]) as never);

    const res = await PATCH(
      new Request("http://localhost/api/job-configs/jc-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New title" }),
      }),
      { params },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(updated);
  });

  it("updates excludedKeywords when supplied, leaving other fields untouched", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const updateChain = mockDrizzleChain([
      {
        id: "jc-1",
        userId: "user-1",
        title: "Backend",
        excludedKeywords: ["php"],
        location: null,
      },
    ]);
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const res = await PATCH(
      new Request("http://localhost/api/job-configs/jc-1", {
        method: "PATCH",
        body: JSON.stringify({ excludedKeywords: ["php"] }),
      }),
      { params },
    );

    expect(res.status).toBe(200);
    expect(updateChain.set.mock.calls[0][0]).toEqual({
      excludedKeywords: ["php"],
    });
  });

  it("rejects excludedKeywords that isn't a string array", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);

    const res = await PATCH(
      new Request("http://localhost/api/job-configs/jc-1", {
        method: "PATCH",
        body: JSON.stringify({ excludedKeywords: [1] }),
      }),
      { params },
    );

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/job-configs/:id", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/job-configs/jc-1"),
      {
        params,
      },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 without leaking existence when the row belongs to another user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(db.delete).mockReturnValue(mockDrizzleChain([]) as never);

    const res = await DELETE(
      new Request("http://localhost/api/job-configs/jc-1"),
      {
        params,
      },
    );

    expect(res.status).toBe(404);
  });

  it("deletes a job config owned by the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(db.delete).mockReturnValue(
      mockDrizzleChain([{ id: "jc-1" }]) as never,
    );

    const res = await DELETE(
      new Request("http://localhost/api/job-configs/jc-1"),
      {
        params,
      },
    );

    expect(res.status).toBe(204);
  });
});
