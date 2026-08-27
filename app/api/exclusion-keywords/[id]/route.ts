import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exclusionKeyword } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

/**
 * Deletes one exclusion keyword owned by the caller. Requires a session
 * (401 otherwise); scoped by both `id` and `userId` so deleting another
 * user's keyword 404s rather than succeeding. 404 if no matching row.
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
    .delete(exclusionKeyword)
    .where(
      and(
        eq(exclusionKeyword.id, id),
        eq(exclusionKeyword.userId, session.user.id),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
