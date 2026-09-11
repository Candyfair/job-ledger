"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

/** Display labels for Better Auth `providerId` values (SPEC.md §1 — GitHub
 * and Google only). Unknown ids fall back to a capitalized raw value rather
 * than being dropped. */
const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

type AccountHeaderProps =
  | {
      variant: "authenticated";
      email: string;
      image: string | null;
      providers: string[];
    }
  | {
      variant: "anonymous";
      /** Carried onto the sign-in link so signing up from here can still
       * trigger the anonymous run-claim flow (SPEC.md §3). Only set when the
       * visitor is on `/dashboard?runId=<id>`. */
      runId?: string | null;
    };

/**
 * Persistent account header — rendered on `/` and `/dashboard` only (SPEC.md
 * §3 "Account menu", §6), never on the auth pages. Authenticated: avatar,
 * email, linked OAuth provider(s), and sign-out. Anonymous: a single
 * sign-in/sign-up link that forwards the current `runId` when there is one.
 *
 * Sits above each page's own title header as a slim bar. The wordmark links
 * to the visitor's sensible landing spot (the dashboard when signed in, the
 * trigger form otherwise) so the two in-app routes stay one click apart.
 */
export function AccountHeader(props: AccountHeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-2 text-zinc-900">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <Link
          href={props.variant === "authenticated" ? "/dashboard" : "/"}
          className="text-sm font-semibold tracking-tight text-zinc-900"
        >
          The Job Ledger
        </Link>

        {props.variant === "authenticated" ? (
          <div className="flex items-center gap-3 text-sm">
            {props.image ? (
              // Plain <img>, not next/image: a 28px decorative avatar from an
              // arbitrary OAuth provider host isn't worth wiring
              // remotePatterns / an image loader for.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.image}
                alt=""
                className="h-7 w-7 rounded-full bg-zinc-100 object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600"
              >
                {props.email.charAt(0).toUpperCase()}
              </span>
            )}

            <span className="hidden text-zinc-700 sm:inline">
              {props.email}
            </span>

            {props.providers.length > 0 && (
              <span className="hidden items-center gap-1 md:flex">
                {props.providers.map((id) => (
                  <span
                    key={id}
                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600"
                  >
                    {providerLabel(id)}
                  </span>
                ))}
              </span>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="font-medium text-blue-700 hover:underline"
            >
              Se déconnecter
            </button>
          </div>
        ) : (
          <Link
            href={
              props.runId
                ? `/sign-in?runId=${encodeURIComponent(props.runId)}`
                : "/sign-in"
            }
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Se connecter / Créer un compte
          </Link>
        )}
      </div>
    </header>
  );
}
