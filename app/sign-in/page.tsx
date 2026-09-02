import Link from "next/link";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function SignInPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-md items-baseline justify-between">
          <h1 className="text-3xl font-bold text-zinc-900">Sign in</h1>
          <Link
            href="/"
            className="text-xs font-medium tracking-wide text-blue-700 hover:underline"
          >
            TRY IT WITHOUT AN ACCOUNT →
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
        <p className="text-center text-sm text-zinc-600">
          Sign in to save your job searches and site preferences between visits.
        </p>
        <OAuthButtons />
      </main>
    </div>
  );
}
