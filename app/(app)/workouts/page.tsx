"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  Dumbbell,
  ListChecks,
  Plus,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { formatRestDuration } from "@/convex/lib/settings";

export default function WorkoutsPage() {
  const { isAuthenticated } = useConvexAuth();
  const templates = useQuery(api.templates.list, isAuthenticated ? {} : "skip");
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );

  const settings = appShellState?.settings ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Workouts
          </h1>
          <p className="text-sm text-ink-muted">
            Start a freestyle session or train from your saved routines.
          </p>
        </div>

        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-xs transition-colors hover:border-brand/40 hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <SlidersHorizontal
            className="h-4 w-4 text-brand"
            aria-hidden="true"
          />
          {settings !== null ? (
            <span className="tabular-nums">
              {settings.unit} ·{" "}
              {formatRestDuration(settings.defaultRestSeconds)} rest
            </span>
          ) : (
            <span>Preferences</span>
          )}
        </Link>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              Freestyle Workout
            </h2>
            <p className="text-sm text-ink-muted">
              Start an empty session and add exercises as you train.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-subtle px-4 py-2 text-sm font-semibold text-ink-muted cursor-not-allowed"
        >
          Logger coming next
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">My Routines</h2>
            {templates !== undefined && templates.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-0.5 text-xs font-semibold text-ink-muted tabular-nums">
                {templates.length}
              </span>
            )}
          </div>
        </div>

        {templates === undefined ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            aria-busy="true"
            aria-label="Loading routines"
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-4 animate-pulse"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="h-5 w-20 rounded-md bg-surface-subtle" />
                  <div className="h-6 w-24 rounded-full bg-surface-subtle" />
                </div>
                <div className="space-y-2.5">
                  <div className="h-4 w-full rounded bg-surface-subtle" />
                  <div className="h-4 w-5/6 rounded bg-surface-subtle" />
                  <div className="h-4 w-4/5 rounded bg-surface-subtle" />
                  <div className="h-4 w-3/4 rounded bg-surface-subtle" />
                </div>
                <div className="mt-auto border-t border-border pt-3">
                  <div className="h-4 w-28 rounded bg-surface-subtle" />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-ink">
                No routines yet
              </h3>
              <p className="text-sm text-ink-muted">
                Your saved workout templates will appear here once created.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const totalTargetSets = template.exercises.reduce(
                (sum, exercise) => sum + exercise.targetSets,
                0,
              );
              const exerciseCount = template.exercises.length;

              return (
                <article
                  key={template._id}
                  className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-ink">
                      {template.title}
                    </h3>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand tabular-nums">
                      {exerciseCount}{" "}
                      {exerciseCount === 1 ? "exercise" : "exercises"}
                    </span>
                  </div>

                  <ol className="space-y-2.5">
                    {template.exercises.map((exercise) => {
                      const targetSummary =
                        exercise.targetReps !== undefined
                          ? `${exercise.targetSets} × ${exercise.targetReps}`
                          : `${exercise.targetSets} ${exercise.targetSets === 1 ? "set" : "sets"}`;

                      return (
                        <li
                          key={exercise._id}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {exercise.exerciseName}
                            </p>
                            <p className="text-xs text-ink-muted tabular-nums">
                              {targetSummary}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 text-xs font-medium text-ink-muted tabular-nums">
                            <Timer className="h-3 w-3" aria-hidden="true" />
                            {formatRestDuration(exercise.restSeconds)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  <footer className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-xs font-medium text-ink-muted tabular-nums">
                    <ListChecks
                      className="h-3.5 w-3.5 text-brand"
                      aria-hidden="true"
                    />
                    <span>
                      {totalTargetSets} target{" "}
                      {totalTargetSets === 1 ? "set" : "sets"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
