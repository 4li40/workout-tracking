"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, LogOut, Minus, Plus, Scale, Timer } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAppShellSignOut } from "@/components/shell/AppShellSignOutContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { signOut, signingOut, signOutError } = useAppShellSignOut();

  const [unitSaving, setUnitSaving] = useState(false);
  const [unitSaved, setUnitSaved] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  const [draftRestInput, setDraftRestInput] = useState<string | null>(null);
  const [restSaving, setRestSaving] = useState(false);
  const [restSaved, setRestSaved] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

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

  const isLoadingSettings = appShellState === undefined;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure your weight units, default rest timer, and account session.
        </p>
      </header>

      {isLoadingSettings ? (
        <div
          className="space-y-6"
          aria-busy="true"
          aria-label="Loading settings"
        >
          <Card>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {REST_TIMER_PRESETS.map((preset) => (
                  <Skeleton key={preset} className="h-11 rounded-xl" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <Card asChild>
            <section className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <Scale className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Weight unit
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Used across workout logging, targets, and progression
                      charts.
                    </p>
                  </div>
                </div>
                {unitSaved && (
                  <Badge
                    role="status"
                    variant="success"
                    className="shrink-0 py-1 font-medium"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    Saved
                  </Badge>
                )}
              </div>

              <fieldset>
                <legend className="sr-only">Preferred weight unit</legend>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary p-1.5">
                  {WEIGHT_UNIT_OPTIONS.map((option) => {
                    const isSelected = currentUnit === option.value;
                    const isDisabled = unitSaving || settings === null;
                    return (
                      <label
                        key={option.value}
                        className={`min-h-12 flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        } ${
                          isDisabled
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="radio"
                          name="settings-weight-unit"
                          value={option.value}
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => {
                            void handleSelectUnit(option.value);
                          }}
                          className="sr-only"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {unitError !== null && (
                <Alert variant="destructive">
                  <AlertDescription>{unitError}</AlertDescription>
                </Alert>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                Historical workouts convert cleanly whenever you switch because
                logged weights are stored canonically in kilograms.
              </p>
            </section>
          </Card>

          <Card asChild>
            <section className="p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <Timer className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Default rest timer
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Applied automatically to new sets when no custom rest is
                      set.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {restSaved && (
                    <Badge
                      role="status"
                      variant="success"
                      className="py-1 font-medium"
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Saved
                    </Badge>
                  )}
                  <Badge
                    variant="accent"
                    className="px-3 py-1 text-sm font-semibold tabular-nums"
                  >
                    {formatRestDuration(currentRestSeconds)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quick presets
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {REST_TIMER_PRESETS.map((preset) => {
                    const isActive =
                      !hasRestDraftChanges && currentRestSeconds === preset;
                    return (
                      <Button
                        key={preset}
                        type="button"
                        variant={isActive ? "default" : "secondary"}
                        disabled={restSaving || settings === null}
                        onClick={() => {
                          void handleSelectRestPreset(preset);
                        }}
                        className="px-3 tabular-nums"
                      >
                        {formatRestDuration(preset)}
                      </Button>
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
                <Label
                  htmlFor="custom-rest-seconds"
                  className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Custom duration (seconds)
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={restSaving || settings === null}
                    onClick={() => handleStepRest(-REST_STEP_SECONDS)}
                    aria-label={`Decrease rest timer by ${REST_STEP_SECONDS} seconds`}
                    className="gap-1 px-3"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                    <span>{REST_STEP_SECONDS}s</span>
                  </Button>

                  <Input
                    id="custom-rest-seconds"
                    type="number"
                    inputMode="numeric"
                    min={MIN_REST_SECONDS}
                    max={MAX_REST_SECONDS}
                    step={1}
                    disabled={restSaving || settings === null}
                    value={restInputValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setRestError(null);
                      setRestSaved(false);
                      setDraftRestInput(
                        nextValue.trim() === String(currentRestSeconds)
                          ? null
                          : nextValue,
                      );
                    }}
                    className="w-24 flex-1 sm:flex-none bg-secondary text-center text-base font-semibold tabular-nums focus-visible:bg-card"
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={restSaving || settings === null}
                    onClick={() => handleStepRest(REST_STEP_SECONDS)}
                    aria-label={`Increase rest timer by ${REST_STEP_SECONDS} seconds`}
                    className="gap-1 px-3"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{REST_STEP_SECONDS}s</span>
                  </Button>

                  {hasRestDraftChanges && (
                    <Button
                      type="submit"
                      disabled={restSaving || settings === null}
                    >
                      {restSaving ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Enter a whole number between {MIN_REST_SECONDS} and{" "}
                  {MAX_REST_SECONDS} seconds.
                </p>

                {restError !== null && (
                  <Alert variant="destructive">
                    <AlertDescription>{restError}</AlertDescription>
                  </Alert>
                )}
              </form>
            </section>
          </Card>
        </>
      )}

      <Card asChild>
        <section className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Account</h2>
            <p className="text-sm text-muted-foreground">
              Sign out of this device. Your workouts, routines, and preferences
              remain safely synced.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            onClick={signOut}
            className="w-full sm:w-auto border-destructive/30 bg-destructive-tint text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-destructive/30"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{signingOut ? "Signing out..." : "Sign out"}</span>
          </Button>

          {signOutError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{signOutError}</AlertDescription>
            </Alert>
          )}
        </section>
      </Card>
    </div>
  );
}
