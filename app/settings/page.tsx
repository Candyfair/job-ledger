import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig, exclusionKeyword } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/sign-in");
  }

  const [jobConfigs, exclusionKeywords] = await Promise.all([
    db
      .select()
      .from(jobConfig)
      .where(eq(jobConfig.userId, session.user.id))
      .orderBy(jobConfig.createdAt),
    db
      .select()
      .from(exclusionKeyword)
      .where(eq(exclusionKeyword.userId, session.user.id))
      .orderBy(exclusionKeyword.createdAt),
  ]);

  return (
    <SettingsClient
      initialJobConfigs={jobConfigs.map((c) => ({
        id: c.id,
        title: c.title,
        excludedKeywords: c.excludedKeywords,
        location: c.location,
      }))}
      initialExclusionKeywords={exclusionKeywords.map((k) => ({
        id: k.id,
        keyword: k.keyword,
      }))}
    />
  );
}
