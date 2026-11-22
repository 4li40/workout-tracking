"use client";

import { useMutation } from "convex/react";
import { Check, Dumbbell, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { WeightUnit } from "@/convex/lib/validators";
import { getConvexErrorMessage } from "@/lib/convexError";
import { useAppShellSignOut } from "./AppShellSignOutContext";

const UNIT_OPTIONS: ReadonlyArray<{
  readonly value: WeightUnit;
  readonly title: string;
  readonly subtitle: string;
}> = [
  {
    value: "kg",
    title: "Kilograms (kg)",
    subtitle: "2.5 kg progression steps",
  },
  {
    value: "lb",
    title: "Pounds (lb)",
    subtitle: "5 lb progression steps",
  },
];

const STARTER_ROUTINES = [
  {
    name: "Push",
    summary: "Bench, incline press, overhead press, raises, triceps",
  },
  {
    name: "Pull",
    summary: "Barbell row, pull-ups, cable row, face pulls, curls",
  },
  {
    name: "Legs",
    summary: "Back squat, RDL, leg press, leg curl, calf raises",
  },
] as const;

export function OnboardingFlow({
  initialUnit,
}: Readonly<{
  initialUnit: WeightUnit;
}>) {
  const [unit, setUnit] = useState<WeightUnit>(initialUnit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completeOnboarding = useMutation(api.userSettings.completeOnboarding);
  const { signOut, signingOut, signOutError } = useAppShellSignOut();
  const router = useRouter();
  const pathname = usePathname();
  const busy = submitting || signingOut;
  const visibleError = error ?? signOutError;

  const handleComplete = async () => {
    if (busy) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await completeOnboarding({ unit });
      if (pathname !== "/workouts") {
        router.replace("/workouts");
      }
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not complete setup. Please try again.",
        ),
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <Dumbbell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">
              Set up your training
            </h1>
            <p className="text-sm text-ink-muted">
              Choose your weight unit. You can change it anytime in Settings.
            </p>
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-ink">
            Preferred weight unit
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UNIT_OPTIONS.map((option) => {
              const selected = unit === option.value;
              return (
                <label
                  key={option.value}
                  className={`block min-h-[88px] rounded-xl border p-4 text-left transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 ${
                    selected
                      ? "border-brand bg-brand-tint ring-2 ring-brand/15"
                      : "border-border bg-surface hover:border-brand/40"
                  } ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="onboarding-weight-unit"
                    value={option.value}
                    checked={selected}
                    disabled={busy}
                    onChange={() => setUnit(option.value)}
                    className="sr-only"
                  />
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-base font-semibold text-ink">
                      {option.title}
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-surface"
                      }`}
                    >
                      {selected && (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {option.subtitle}
                  </p>
                </label>
              );
            })}
          </div>
        </fieldset>

        <section className="mt-6 rounded-xl border border-border bg-surface-subtle p-4">
          <h2 className="text-sm font-semibold text-ink">
            Starter routines included
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            We will add three ready-to-run templates from the global exercise
            library:
          </p>
          <ul className="mt-3 space-y-2">
            {STARTER_ROUTINES.map((routine) => (
              <li
                key={routine.name}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="font-semibold text-ink">{routine.name}</span>
                <span className="text-ink-muted">{routine.summary}</span>
              </li>
            ))}
          </ul>
        </section>

        {visibleError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-danger/25 bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
          >
            {visibleError}
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleComplete()}
          className="mt-6 min-h-12 w-full rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Setting up your workouts..." : "Start training"}
        </button>

        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">Wrong account?</span>
          <button
            type="button"
            disabled={busy}
            onClick={signOut}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{signingOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
