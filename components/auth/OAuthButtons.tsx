"use client";

import { signIn } from "@/lib/auth-client";

// Post-sign-in landing: `/`, the merged trigger / saved-search screen
// (SPEC.md §3, §6). A newly authenticated user with zero JobConfig rows
// lands directly where they create one.
const POST_SIGN_IN_REDIRECT = "/";

export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() =>
          signIn.social({
            provider: "github",
            callbackURL: POST_SIGN_IN_REDIRECT,
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
            callbackURL: POST_SIGN_IN_REDIRECT,
          })
        }
        className="flex h-11 items-center justify-center gap-2 rounded border border-zinc-300 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Continue with Google
      </button>
    </div>
  );
}
