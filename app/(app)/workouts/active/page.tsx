"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Activity, ArrowLeft, Clock, Dumbbell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { formatElapsedDuration } from "@/convex/lib/settings";

function ElapsedWorkoutTimer({
  startedAt,
}: Readonly<{
  startedAt: number;
}>) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return <>{formatElapsedDuration(nowMs - startedAt)}</>;
}

export default function ActiveWorkoutPage() {
  const { isAuthenticated } = useConvexAuth();
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );

  const activeWorkout = appShellState?.activeWorkout ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Active Workout
        </h1>
        <p className="text-sm text-muted-foreground">
          Track your in-progress training session.
        </p>
      </header>

      {appShellState === undefined ? (
        <Card aria-busy="true" aria-label="Loading active workout">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 w-40 rounded-xl" />
          </CardContent>
        </Card>
      ) : activeWorkout !== null ? (
        <Card asChild>
          <section className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="success" className="gap-1.5 px-3 py-1">
                <Activity className="size-3.5" aria-hidden="true" />
                In progress
              </Badge>
              <Badge
                variant="accent"
                className="gap-1.5 px-3 py-1 text-sm tabular-nums"
              >
                <Clock className="size-4" aria-hidden="true" />
                <ElapsedWorkoutTimer
                  key={activeWorkout._id}
                  startedAt={activeWorkout.startedAt}
                />
              </Badge>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-foreground">
                {activeWorkout.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                Your session is active and synced. The interactive set logger,
                inline previous numbers, and live rest timer arrive in MVP 4.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <Button asChild variant="secondary">
                <Link href="/workouts">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Workouts</span>
                </Link>
              </Button>
            </div>
          </section>
        </Card>
      ) : (
        <Card asChild>
          <section className="p-6 sm:p-8 space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                No active workout
              </h2>
              <p className="text-sm text-muted-foreground">
                You do not have an in-progress session right now. Head back to
                Workouts to view your saved routines.
              </p>
            </div>
            <div>
              <Button asChild>
                <Link href="/workouts">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Workouts</span>
                </Link>
              </Button>
            </div>
          </section>
        </Card>
      )}
    </div>
  );
}
