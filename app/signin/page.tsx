"use client";

import { DEFAULT_MIN_PASSWORD_LENGTH } from "@convex-dev/auth/methods/username-password";
import {
  type SignInWithUsernamePasswordResult,
  type SignUpWithUsernamePasswordResult,
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from "@convex-dev/auth/methods/username-password/react";
import { useConvexAuth } from "convex/react";
import { Dumbbell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";

export default function SignIn() {
  const { isAuthenticated } = useConvexAuth();
  const { signIn, pending: signInPending } = useSignInWithUsernamePassword(
    api.auth,
  );
  const { signUp, pending: signUpPending } = useSignUpWithUsernamePassword(
    api.auth,
  );
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const loading = signInPending || signUpPending || redirecting;
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/workouts");
    }
  }, [isAuthenticated, router]);

  const switchFlow = (nextFlow: "signIn" | "signUp") => {
    setFlow(nextFlow);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <Dumbbell className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Workout Tracker
            </h1>
            <p className="text-sm text-ink-muted">
              Track sets, beat last week, and build strength.
            </p>
          </div>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
          <div
            className="grid grid-cols-2 gap-1 rounded-xl bg-surface-subtle p-1"
            role="group"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              aria-pressed={flow === "signIn"}
              disabled={loading}
              onClick={() => switchFlow("signIn")}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                flow === "signIn"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={flow === "signUp"}
              disabled={loading}
              onClick={() => switchFlow("signUp")}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                flow === "signUp"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Sign up
            </button>
          </div>

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (loading) {
                return;
              }
              setError(null);
              void (flow === "signIn" ? signIn : signUp)({
                username,
                password,
              }).then((result) => {
                if (result.status === "complete") {
                  setRedirecting(true);
                  router.replace("/workouts");
                } else {
                  setError(errorMessage(result.userError));
                }
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="text-sm font-medium text-ink"
              >
                Username
              </label>
              <input
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                id="username"
                name="username"
                type="text"
                placeholder="Enter your username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-ink"
              >
                Password
              </label>
              <input
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete={
                  flow === "signIn" ? "current-password" : "new-password"
                }
                minLength={
                  flow === "signUp" ? DEFAULT_MIN_PASSWORD_LENGTH : undefined
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              {flow === "signUp" && (
                <p className="text-xs text-ink-muted">
                  Password must be at least {DEFAULT_MIN_PASSWORD_LENGTH}{" "}
                  characters.
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-sm font-medium text-danger break-words"
              >
                {error}
              </div>
            )}

            <button
              className="mt-1 min-h-12 w-full rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={loading}
            >
              {loading
                ? flow === "signIn"
                  ? "Signing in..."
                  : "Creating account..."
                : flow === "signIn"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

type UserError = Extract<
  SignInWithUsernamePasswordResult | SignUpWithUsernamePasswordResult,
  { status: "error" }
>["userError"];

function errorMessage(userError: UserError): string {
  switch (userError.error) {
    case "USER_NOT_FOUND":
      return "No account exists with that username.";
    case "INVALID_CREDENTIALS":
      return "Incorrect username or password.";
    case "RATE_LIMITED":
      return `Too many attempts. Try again in ${Math.ceil(userError.retryAfterMs / 1000)} seconds.`;
    case "USERNAME_TAKEN":
      return "That username is already taken.";
    case "USERNAME_TOO_SHORT":
      return `Username must be at least ${userError.minimumLength} characters.`;
    case "USERNAME_TOO_LONG":
      return `Username must be at most ${userError.maximumLength} characters.`;
    case "USERNAME_HAS_SURROUNDING_WHITESPACE":
      return "Username can't start or end with whitespace.";
    case "USERNAME_HAS_INVALID_CHARACTERS":
      return "Username contains characters that aren't allowed.";
    case "PASSWORD_TOO_SHORT":
      return `Password must be at least ${userError.minimumLength} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Password must be at most ${userError.maximumLength} characters.`;
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return "Password can't start or end with whitespace.";
    case "PASSWORD_TOO_COMMON":
      return "That password is too common. Please choose a different one.";
    case "OTHER_ERROR":
      console.error(userError.cause);
      return "Something went wrong. Please try again.";
    default:
      userError satisfies never;
      return "Something went wrong. Please try again.";
  }
}
