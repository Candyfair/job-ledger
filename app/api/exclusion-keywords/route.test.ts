import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/exclusion-keywords", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns the signed-in user's exclusion keywords", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const rows = [{ id: "ek-1", keyword: "PHP" }];
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain(rows) as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(rows);
  });
});

describe("POST /api/exclusion-keywords", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/exclusion-keywords", {
        method: "POST",
        body: JSON.stringify({ keyword: "PHP" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects a blank keyword", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);

    const res = await POST(
      new Request("http://localhost/api/exclusion-keywords", {
        method: "POST",
        body: JSON.stringify({ keyword: "   " }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("creates an exclusion keyword scoped to the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const created = { id: "ek-1", userId: "user-1", keyword: "PHP" };
    vi.mocked(db.insert).mockReturnValue(mockDrizzleChain([created]) as never);

    const res = await POST(
      new Request("http://localhost/api/exclusion-keywords", {
        method: "POST",
        body: JSON.stringify({ keyword: "PHP" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual(created);
  });
});
