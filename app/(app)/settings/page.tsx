"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, LogOut, Minus, Plus, Scale, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  DEFAULT_REST_SECONDS,
  formatRestDuration,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  parseRestSeconds,
  REST_TIMER_PRESETS,
} from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";
import { getConvexErrorMessage } from "@/lib/convexError";

const REST_STEP_SECONDS = 15;
const SAVED_BADGE_MS = 2500;

const WEIGHT_UNIT_OPTIONS: ReadonlyArray<{
  readonly value: WeightUnit;
  readonly label: string;
}> = [
  { value: "kg", label: "Kilograms (kg)" },
  { value: "lb", label: "Pounds (lb)" },
];

export default function SettingsPage() {
  const { isAuthenticated } = useConvexAuth();
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );
  const updateSettings = useMutation(api.userSettings.updateSettings);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [unitSaving, setUnitSaving] = useState(false);
  const [unitSaved, setUnitSaved] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  const [draftRestInput, setDraftRestInput] = useState<string | null>(null);
  const [restSaving, setRestSaving] = useState(false);
  const [restSaved, setRestSaved] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const unitSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const restSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (unitSavedTimeoutRef.current !== null) {
        clearTimeout(unitSavedTimeoutRef.current);
      }
      if (restSavedTimeoutRef.current !== null) {
        clearTimeout(restSavedTimeoutRef.current);
      }
    };
  }, []);

  const settings = appShellState?.settings ?? null;
  const currentUnit = settings?.unit ?? "kg";
  const currentRestSeconds =
    settings?.defaultRestSeconds ?? DEFAULT_REST_SECONDS;
  const restInputValue = draftRestInput ?? String(currentRestSeconds);
  const hasRestDraftChanges =
    draftRestInput !== null &&
    draftRestInput.trim() !== String(currentRestSeconds);

  function showUnitSaved() {
    setUnitSaved(true);
    if (unitSavedTimeoutRef.current !== null) {
      clearTimeout(unitSavedTimeoutRef.current);
    }
    unitSavedTimeoutRef.current = setTimeout(() => {
      setUnitSaved(false);
    }, SAVED_BADGE_MS);
  }

  function showRestSaved() {
    setRestSaved(true);
    if (restSavedTimeoutRef.current !== null) {
      clearTimeout(restSavedTimeoutRef.current);
    }
    restSavedTimeoutRef.current = setTimeout(() => {
      setRestSaved(false);
    }, SAVED_BADGE_MS);
  }

  async function handleSelectUnit(unit: WeightUnit) {
    if (settings === null || unit === settings.unit || unitSaving) {
      return;
    }

    setUnitSaving(true);
    setUnitError(null);
    setUnitSaved(false);
    try {
      await updateSettings({ unit });
      showUnitSaved();
    } catch (error) {
      setUnitError(
        getConvexErrorMessage(
          error,
          "Could not save weight unit. Please try again.",
        ),
      );
    } finally {
      setUnitSaving(false);
    }
  }

  async function handleSelectRestPreset(seconds: number) {
    if (settings === null || restSaving) {
      return;
    }

    setRestError(null);
    setDraftRestInput(null);
    if (seconds === settings.defaultRestSeconds) {
      return;
    }

    setRestSaving(true);
    setRestSaved(false);
    try {
      await updateSettings({ defaultRestSeconds: seconds });
      showRestSaved();
    } catch (error) {
      setRestError(
        getConvexErrorMessage(
          error,
          "Could not save default rest timer. Please try again.",
        ),
      );
    } finally {
      setRestSaving(false);
    }
  }

  function handleStepRest(delta: number) {
    const trimmed = restInputValue.trim();
    const numericValue = trimmed === "" ? Number.NaN : Number(trimmed);
    const baseSeconds = Number.isFinite(numericValue)
      ? Math.round(numericValue)
      : currentRestSeconds;
    const nextSeconds = Math.min(
      MAX_REST_SECONDS,
      Math.max(MIN_REST_SECONDS, baseSeconds + delta),
    );
    setRestError(null);
    setRestSaved(false);
    setDraftRestInput(
      nextSeconds === currentRestSeconds ? null : String(nextSeconds),
    );
  }

  async function handleSaveCustomRest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings === null || restSaving) {
      return;
    }

    const trimmed = restInputValue.trim();
    const parsed = parseRestSeconds(
      trimmed === "" ? Number.NaN : Number(trimmed),
    );
    if (parsed.kind === "error") {
      setRestError(parsed.message);
      setRestSaved(false);
      return;
    }

    if (parsed.seconds === settings.defaultRestSeconds) {
      setDraftRestInput(null);
      setRestError(null);
      return;
    }

    setRestSaving(true);
    setRestError(null);
    setRestSaved(false);
    try {
      await updateSettings({ defaultRestSeconds: parsed.seconds });
      setDraftRestInput(null);
      showRestSaved();
    } catch (error) {
      setRestError(
        getConvexErrorMessage(
          error,
          "Could not save default rest timer. Please try again.",
        ),
      );
    } finally {
      setRestSaving(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      router.replace("/signin");
      router.refresh();
    } catch (error) {
      setSignOutError(
        getConvexErrorMessage(error, "Could not sign out. Please try again."),
      );
      setSigningOut(false);
    }
  }

  const isLoadingSettings = appShellState === undefined;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="text-sm text-ink-muted">
          Configure your weight units, default rest timer, and account session.
        </p>
      </header>

      {isLoadingSettings ? (
        <div
          className="space-y-6"
          aria-busy="true"
          aria-label="Loading settings"
        >
          <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 animate-pulse">
            <div className="h-5 w-32 rounded-md bg-surface-subtle" />
            <div className="h-12 w-full rounded-xl bg-surface-subtle" />
            <div className="h-4 w-3/4 rounded-md bg-surface-subtle" />
          </div>
          <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 animate-pulse">
            <div className="h-5 w-40 rounded-md bg-surface-subtle" />
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {REST_TIMER_PRESETS.map((preset) => (
                <div
                  key={preset}
                  className="h-11 rounded-xl bg-surface-subtle"
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Scale className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    Weight unit
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Used across workout logging, targets, and progression
                    charts.
                  </p>
                </div>
              </div>
              {unitSaved && (
                <span
                  role="status"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-tint px-2.5 py-1 text-xs font-medium text-success"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved
                </span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Preferred weight unit"
              className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-subtle p-1.5"
            >
              {WEIGHT_UNIT_OPTIONS.map((option) => {
                const isSelected = currentUnit === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={unitSaving || settings === null}
                    onClick={() => {
                      void handleSelectUnit(option.value);
                    }}
                    className={`min-h-12 rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      isSelected
                        ? "bg-brand text-white shadow-xs"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {unitError !== null && (
              <p
                role="alert"
                className="rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger"
              >
                {unitError}
              </p>
            )}

            <p className="text-xs leading-relaxed text-ink-muted">
              Historical workouts convert cleanly whenever you switch because
              logged weights are stored canonically in kilograms.
            </p>
          </section>

          <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Timer className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    Default rest timer
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Applied automatically to new sets when no custom rest is
                    set.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {restSaved && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2.5 py-1 text-xs font-medium text-success"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Saved
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand tabular-nums">
                  {formatRestDuration(currentRestSeconds)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Quick presets
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {REST_TIMER_PRESETS.map((preset) => {
                  const isActive =
                    draftRestInput === null && currentRestSeconds === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={restSaving || settings === null}
                      onClick={() => {
                        void handleSelectRestPreset(preset);
                      }}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold tabular-nums transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        isActive
                          ? "border-brand bg-brand text-white shadow-xs"
                          : "border-border bg-surface-subtle text-ink hover:border-brand/40 hover:bg-brand-tint hover:text-brand"
                      }`}
                    >
                      {formatRestDuration(preset)}
                    </button>
                  );
                })}
              </div>
            </div>

            <form
              noValidate
              onSubmit={(event) => {
                void handleSaveCustomRest(event);
              }}
              className="space-y-2.5 border-t border-border pt-4"
            >
              <label
                htmlFor="custom-rest-seconds"
                className="block text-xs font-medium uppercase tracking-wide text-ink-muted"
              >
                Custom duration (seconds)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={restSaving || settings === null}
                  onClick={() => handleStepRest(-REST_STEP_SECONDS)}
                  aria-label={`Decrease rest timer by ${REST_STEP_SECONDS} seconds`}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-border bg-surface-subtle px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-tint hover:text-brand cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                  <span>{REST_STEP_SECONDS}s</span>
                </button>

                <input
                  id="custom-rest-seconds"
                  type="number"
                  inputMode="numeric"
                  min={MIN_REST_SECONDS}
                  max={MAX_REST_SECONDS}
                  step={1}
                  disabled={restSaving || settings === null}
                  value={restInputValue}
                  onChange={(event) => {
                    setRestError(null);
                    setRestSaved(false);
                    setDraftRestInput(event.target.value);
                  }}
                  className="min-h-11 w-24 flex-1 sm:flex-none rounded-xl border border-border bg-surface-subtle px-3.5 text-center text-base font-semibold text-ink tabular-nums outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
                />

                <button
                  type="button"
                  disabled={restSaving || settings === null}
                  onClick={() => handleStepRest(REST_STEP_SECONDS)}
                  aria-label={`Increase rest timer by ${REST_STEP_SECONDS} seconds`}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-border bg-surface-subtle px-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-tint hover:text-brand cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>{REST_STEP_SECONDS}s</span>
                </button>

                {hasRestDraftChanges && (
                  <button
                    type="submit"
                    disabled={restSaving || settings === null}
                    className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {restSaving ? "Saving..." : "Save"}
                  </button>
                )}
              </div>

              <p className="text-xs text-ink-muted">
                Enter a whole number between {MIN_REST_SECONDS} and{" "}
                {MAX_REST_SECONDS} seconds.
              </p>

              {restError !== null && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger"
                >
                  {restError}
                </p>
              )}
            </form>
          </section>
        </>
      )}

      <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">Account</h2>
          <p className="text-sm text-ink-muted">
            Sign out of this device. Your workouts, routines, and preferences
            remain safely synced.
          </p>
        </div>

        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            void handleSignOut();
          }}
          className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-tint px-5 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>{signingOut ? "Signing out..." : "Sign out"}</span>
        </button>

        {signOutError !== null && (
          <p
            role="alert"
            className="rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            {signOutError}
          </p>
        )}
      </section>
    </div>
  );
}
