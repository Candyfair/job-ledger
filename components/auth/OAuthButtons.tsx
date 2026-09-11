"use client";

import { signIn } from "@/lib/auth-client";

// Post-sign-in landing with no runId in context: `/`, the merged trigger /
// saved-search screen (SPEC.md §3, §6). A newly authenticated user with zero
// JobConfig rows lands directly where they create one.
const POST_SIGN_IN_REDIRECT = "/";

// Post-sign-in landing when a runId IS in context (SPEC.md §3 "Create an
// account from an anonymous run", changed 2026-09-11 from `/` — landing on
// the trigger form left the visitor with no visible sign their run had
// carried over). `/dashboard` already renders the claim-in-flight shell
// (`app/dashboard/page.tsx`) and mounts `RunClaimOnMount`, which selects the
// claimed run once the claim persists. Recreating the search itself as a
// saved `JobConfig` is still manual, on `/` — reachable from the header
// wordmark or "Relancer une recherche", just no longer the landing page.
const CLAIM_REDIRECT = "/dashboard";

type OAuthButtonsProps = {
  /** Carried through from `?runId=` on the sign-in/sign-up page (SPEC.md §3
   * "Claiming an anonymous run"). When present, the post-sign-in redirect
   * targets `/dashboard` with a `claimRunId` query param instead of `/`
   * bare — `RunClaimOnMount` (mounted on both `/` and `/dashboard`) picks it
   * up on mount and calls `POST /api/scrape/claim` once the session exists.
   * `callbackURL` is how the id survives the OAuth redirect round-trip. */
  runId?: string;
};

export function OAuthButtons({ runId }: OAuthButtonsProps) {
  const callbackURL = runId
    ? `${CLAIM_REDIRECT}?claimRunId=${encodeURIComponent(runId)}`
    : POST_SIGN_IN_REDIRECT;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() =>
          signIn.social({
            provider: "github",
            callbackURL,
          })
        }
        className="flex h-11 items-center justify-center gap-2 rounded bg-black text-sm font-medium text-white hover:bg-zinc-800"
      >
        Continue with GitHub
      </button>
      <button
        type="button"
        onClick={() =>
          signIn.social({
            provider: "google",
            callbackURL,
          })
        }
        className="flex h-11 items-center justify-center gap-2 rounded border border-zinc-300 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Continue with Google
      </button>
    </div>
  );
}
