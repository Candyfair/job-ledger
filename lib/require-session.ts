import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function requireSession() {
  return auth.api.getSession({ headers: await headers() });
}
