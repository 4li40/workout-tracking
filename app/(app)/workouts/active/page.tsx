"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Activity, ArrowLeft, Clock, Dumbbell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { formatElapsedDuration } from "@/convex/lib/settings";

export default function ActiveWorkoutPage() {
  const { isAuthenticated } = useConvexAuth();
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeWorkout = appShellState?.activeWorkout ?? null;
  const hasActiveWorkout = activeWorkout !== null;

  useEffect(() => {
    if (!hasActiveWorkout) {
      return;
    }

    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [hasActiveWorkout]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Active Workout
        </h1>
        <p className="text-sm text-ink-muted">
          Track your in-progress training session.
        </p>
      </header>

      {appShellState === undefined ? (
        <div
          className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-4 animate-pulse"
          aria-busy="true"
          aria-label="Loading active workout"
        >
          <div className="h-6 w-28 rounded-full bg-surface-subtle" />
          <div className="h-7 w-48 rounded-md bg-surface-subtle" />
          <div className="h-5 w-32 rounded-md bg-surface-subtle" />
          <div className="h-11 w-40 rounded-xl bg-surface-subtle" />
        </div>
      ) : activeWorkout !== null ? (
        <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-3 py-1 text-xs font-semibold text-success">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              In progress
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand tabular-nums">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatElapsedDuration(nowMs - activeWorkout.startedAt)}
            </span>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-ink">
              {activeWorkout.title}
            </h2>
            <p className="text-sm text-ink-muted">
              Your session is active and synced. The interactive set logger,
              inline previous numbers, and live rest timer arrive in MVP 4.
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <Link
              href="/workouts"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Workouts</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xs space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Dumbbell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              No active workout
            </h2>
            <p className="text-sm text-ink-muted">
              You do not have an in-progress session right now. Head back to
              Workouts to view your saved routines.
            </p>
          </div>
          <div>
            <Link
              href="/workouts"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Workouts</span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
