import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/sign-in");
  }

  const jobConfigs = await db
    .select()
    .from(jobConfig)
    .where(eq(jobConfig.userId, session.user.id))
    .orderBy(jobConfig.createdAt);

  return (
    <SettingsClient
      initialJobConfigs={jobConfigs.map((c) => ({
        id: c.id,
        title: c.title,
        excludedKeywords: c.excludedKeywords,
        location: c.location,
      }))}
    />
  );
}
