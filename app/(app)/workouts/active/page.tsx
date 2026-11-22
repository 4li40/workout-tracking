"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Activity,
  ArrowLeft,
  Clock,
  Dumbbell,
  Timer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/convex/lib/exercises";
import {
  formatElapsedDuration,
  formatRestDuration,
} from "@/convex/lib/settings";
import { getConvexErrorMessage } from "@/lib/convexError";

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
  const router = useRouter();
  const activeWorkout = useQuery(
    api.workouts.getActive,
    isAuthenticated ? {} : "skip",
  );
  const discardWorkout = useMutation(api.workouts.discardWorkout);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  async function handleConfirmDiscard() {
    if (activeWorkout === undefined || activeWorkout === null || discarding) {
      return;
    }

    setDiscarding(true);
    setDiscardError(null);
    try {
      await discardWorkout({ workoutId: activeWorkout._id });
      setDiscardOpen(false);
      router.replace("/workouts");
    } catch (err) {
      setDiscardError(
        getConvexErrorMessage(
          err,
          "Could not discard workout. Please try again.",
        ),
      );
      setDiscarding(false);
    }
  }

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

      {activeWorkout === undefined ? (
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" className="gap-1.5 px-3 py-1">
                  <Activity className="size-3.5" aria-hidden="true" />
                  In progress
                </Badge>
                <Badge variant="secondary">
                  {activeWorkout.templateId !== undefined
                    ? "From routine"
                    : "Freestyle"}
                </Badge>
              </div>
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

            {activeWorkout.exercises.length > 0 && (
              <div className="space-y-2.5 border-t border-border pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Planned exercises ({activeWorkout.exercises.length})
                </h3>
                <ol className="space-y-2">
                  {activeWorkout.exercises.map((exercise, index) => (
                    <li
                      key={exercise._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          <span className="mr-2 text-primary tabular-nums">
                            {index + 1}.
                          </span>
                          {exercise.exerciseName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">
                            {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
                          </Badge>
                          <Badge variant="secondary">
                            {EQUIPMENT_LABELS[exercise.equipment]}
                          </Badge>
                          {exercise.isBodyweight && (
                            <Badge variant="accent">Bodyweight</Badge>
                          )}
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className="shrink-0 tabular-nums"
                      >
                        <Timer className="size-3" aria-hidden="true" />
                        {formatRestDuration(exercise.restSeconds)}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button asChild variant="secondary">
                <Link href="/workouts">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Workouts</span>
                </Link>
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={discarding}
                onClick={() => {
                  setDiscardError(null);
                  setDiscardOpen(true);
                }}
                className="border-destructive/30 bg-destructive-tint text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Discard workout</span>
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
                Workouts to launch a freestyle session or start from a routine.
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

      <Dialog
        open={discardOpen}
        onOpenChange={(nextOpen) => {
          if (!discarding) {
            setDiscardOpen(nextOpen);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard active workout</DialogTitle>
            <DialogDescription>{activeWorkout?.title}</DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            This permanently removes the active workout session and any planned
            sets inside it.
          </p>

          {discardError !== null && (
            <Alert variant="destructive">
              <AlertDescription>{discardError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={discarding}
              onClick={() => setDiscardOpen(false)}
            >
              Keep training
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={discarding}
              onClick={() => {
                void handleConfirmDiscard();
              }}
            >
              {discarding ? "Discarding..." : "Discard workout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
