import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exclusionKeyword } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

/** Lists the caller's exclusion keywords. Requires a session; 401 otherwise. */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(exclusionKeyword)
    .where(eq(exclusionKeyword.userId, session.user.id))
    .orderBy(exclusionKeyword.createdAt);

  return NextResponse.json(rows);
}

/**
 * Creates an exclusion keyword owned by the caller. Requires a session (401
 * otherwise); 400 if `keyword` is missing or blank after trimming.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { keyword } = body ?? {};

  if (typeof keyword !== "string" || keyword.trim() === "") {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(exclusionKeyword)
    .values({
      userId: session.user.id,
      keyword: keyword.trim(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
