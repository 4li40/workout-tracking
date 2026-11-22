"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatElapsedDuration } from "@/convex/lib/settings";
import type { ActiveWorkoutSummary } from "./appShellState";

export function ActiveWorkoutResumeBar({
  activeWorkout,
}: Readonly<{
  activeWorkout: ActiveWorkoutSummary;
}>) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const elapsed = formatElapsedDuration(now - activeWorkout.startedAt);

  return (
    <aside
      aria-label="Active workout"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-lg md:sticky md:top-0 md:inset-x-auto md:bottom-auto md:z-20 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:bg-surface/95 md:px-6 md:py-3 md:shadow-none md:backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand-tint"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              <span>Active workout</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-semibold text-brand tabular-nums">
                {elapsed}
              </span>
            </div>
            <p className="truncate text-sm font-semibold text-ink">
              {activeWorkout.title}
            </p>
          </div>
        </div>

        <Link
          href="/workouts/active"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Resume
        </Link>
      </div>
    </aside>
  );
}
