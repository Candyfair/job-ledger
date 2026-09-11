"use client";

import { signIn } from "@/lib/auth-client";

// Post-sign-in landing: `/`, the merged trigger / saved-search screen
// (SPEC.md §3, §6). A newly authenticated user with zero JobConfig rows
// lands directly where they create one.
const POST_SIGN_IN_REDIRECT = "/";

type OAuthButtonsProps = {
  /** Carried through from `?runId=` on the sign-in/sign-up page (SPEC.md §3
   * "Claiming an anonymous run"). When present, the post-sign-in redirect
   * gains a `claimRunId` query param instead of landing bare — `/` picks it
   * up on mount (`RunClaimOnMount`) and calls `POST /api/scrape/claim` once
   * the session exists. `callbackURL` is how the id survives the OAuth
   * redirect round-trip. */
  runId?: string;
};

export function OAuthButtons({ runId }: OAuthButtonsProps) {
  const callbackURL = runId
    ? `${POST_SIGN_IN_REDIRECT}?claimRunId=${encodeURIComponent(runId)}`
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
