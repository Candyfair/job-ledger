import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

/**
 * Partially updates a job config owned by the caller — only fields present
 * in the body are changed. Requires a session (401 otherwise); scoped by
 * both `id` and `userId` so updating another user's config 404s rather than
 * succeeding. 400 on an invalid field value, 404 if no matching row.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { title, excludedKeywords, location } = body ?? {};

  if (
    title !== undefined &&
    (typeof title !== "string" || title.trim() === "")
  ) {
    return NextResponse.json(
      { error: "title must be a non-empty string" },
      { status: 400 },
    );
  }
  if (
    excludedKeywords !== undefined &&
    (!Array.isArray(excludedKeywords) ||
      excludedKeywords.some((k) => typeof k !== "string"))
  ) {
    return NextResponse.json(
      { error: "excludedKeywords must be an array of strings" },
      { status: 400 },
    );
  }
  if (
    location !== undefined &&
    location !== null &&
    typeof location !== "string"
  ) {
    return NextResponse.json(
      { error: "location must be a string" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(jobConfig)
    .set({
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(excludedKeywords !== undefined ? { excludedKeywords } : {}),
      ...(location !== undefined ? { location } : {}),
    })
    .where(and(eq(jobConfig.id, id), eq(jobConfig.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

/**
 * Deletes one job config owned by the caller. Requires a session (401
 * otherwise); scoped by both `id` and `userId` so deleting another user's
 * config 404s rather than succeeding. 404 if no matching row.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [deleted] = await db
    .delete(jobConfig)
    .where(and(eq(jobConfig.id, id), eq(jobConfig.userId, session.user.id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
