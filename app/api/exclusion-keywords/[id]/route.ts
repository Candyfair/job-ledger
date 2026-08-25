import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exclusionKeyword } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

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
