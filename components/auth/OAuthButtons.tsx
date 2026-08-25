"use client";

import { signIn } from "@/lib/auth-client";

// Post-sign-in redirect target is temporarily /settings, not /: the home
// dashboard doesn't exist yet (Session 5) and landing on the untouched
// Next.js starter page gives no feedback that sign-in succeeded. Point
// this back at / once the real dashboard lands.
const POST_SIGN_IN_REDIRECT = "/settings";

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
