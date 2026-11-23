"use client";

import { Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatElapsedDuration } from "@/convex/lib/settings";
import type { ActiveWorkoutSummary } from "./appShellState";

function formatRestClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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
  const restRemainingMs =
    activeWorkout.restTimerEndsAt !== undefined
      ? activeWorkout.restTimerEndsAt - now
      : 0;

  return (
    <aside
      aria-label="Active workout"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-lg md:sticky md:top-0 md:inset-x-auto md:bottom-auto md:z-20 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:bg-card/95 md:px-6 md:py-3 md:shadow-none md:backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Active workout</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-semibold text-primary tabular-nums">
                {elapsed}
              </span>
              {restRemainingMs > 0 && (
                <Badge variant="accent" className="gap-1 py-0 tabular-nums">
                  <Timer className="size-3" aria-hidden="true" />
                  <span>{formatRestClock(restRemainingMs)}</span>
                </Badge>
              )}
            </div>
            <p className="truncate text-sm font-semibold text-foreground">
              {activeWorkout.title}
            </p>
          </div>
        </div>

        <Button asChild className="shrink-0">
          <Link href={`/workouts/${activeWorkout._id}`}>Resume</Link>
        </Button>
      </div>
    </aside>
  );
}
