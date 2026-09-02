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

describe("GET /api/job-configs", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns the signed-in user's job configs", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const rows = [
      {
        id: "jc-1",
        title: "Backend",
        excludedKeywords: ["Go"],
        location: null,
      },
    ];
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain(rows) as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(rows);
  });
});

describe("POST /api/job-configs", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/job-configs", {
        method: "POST",
        body: JSON.stringify({ title: "x", excludedKeywords: [] }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects a missing title", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);

    const res = await POST(
      new Request("http://localhost/api/job-configs", {
        method: "POST",
        body: JSON.stringify({ excludedKeywords: [] }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("rejects excludedKeywords that isn't a string array", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);

    const res = await POST(
      new Request("http://localhost/api/job-configs", {
        method: "POST",
        body: JSON.stringify({ title: "Backend", excludedKeywords: [1, 2] }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("creates a job config scoped to the signed-in user", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const created = {
      id: "jc-1",
      userId: "user-1",
      title: "Backend",
      excludedKeywords: ["Go"],
      location: null,
    };
    vi.mocked(db.insert).mockReturnValue(mockDrizzleChain([created]) as never);

    const res = await POST(
      new Request("http://localhost/api/job-configs", {
        method: "POST",
        body: JSON.stringify({ title: "Backend", excludedKeywords: ["Go"] }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual(created);
  });

  it("creates a job config when excludedKeywords is omitted (defaults to [])", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    const created = {
      id: "jc-2",
      userId: "user-1",
      title: "Backend",
      excludedKeywords: [],
      location: null,
    };
    const insertChain = mockDrizzleChain([created]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const res = await POST(
      new Request("http://localhost/api/job-configs", {
        method: "POST",
        body: JSON.stringify({ title: "Backend" }),
      }),
    );

    expect(res.status).toBe(201);
    const valuesArg = insertChain.values.mock.calls[0][0] as {
      excludedKeywords: string[];
    };
    expect(valuesArg.excludedKeywords).toEqual([]);
  });
});
