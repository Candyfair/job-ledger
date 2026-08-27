import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

/** Lists the caller's job configs. Requires a session; 401 otherwise. */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(jobConfig)
    .where(eq(jobConfig.userId, session.user.id))
    .orderBy(jobConfig.createdAt);

  return NextResponse.json(rows);
}

/**
 * Creates a job config owned by the caller. Requires a session (401
 * otherwise); 400 if `title` is missing/blank, `keywords` isn't a string
 * array, or `location` is present but not a string.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, keywords, location } = body ?? {};

  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== "string")) {
    return NextResponse.json(
      { error: "keywords must be an array of strings" },
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

  const [created] = await db
    .insert(jobConfig)
    .values({
      userId: session.user.id,
      title: title.trim(),
      keywords,
      location: location ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
