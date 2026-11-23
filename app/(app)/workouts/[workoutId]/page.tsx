"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Dumbbell,
  History,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ActiveWorkoutLogger } from "@/components/workout/ActiveWorkoutLogger";
import type { WorkoutDetail } from "@/components/workout/types";
import { WorkoutRouteErrorBoundary } from "@/components/workout/WorkoutRouteErrorBoundary";
import { api } from "@/convex/_generated/api";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/convex/lib/exercises";
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_UNIT,
  formatElapsedDuration,
} from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";
import {
  computeWorkoutVolumeSummary,
  evaluateSetProgression,
  formatWeightFromKg,
  matchPreviousSetsForExercise,
  SET_TYPE_META,
  WEIGHT_EPSILON_KG,
} from "@/convex/lib/workouts";

function CompletedWorkoutSummary({
  workout,
  unit,
}: {
  readonly workout: WorkoutDetail;
  readonly unit: WeightUnit;
}) {
  const summary = computeWorkoutVolumeSummary(workout.exercises);
  const finishedAt = workout.finishedAt ?? workout.startedAt;
  const durationLabel = formatElapsedDuration(finishedAt - workout.startedAt);
  const volumeLabel =
    summary.workingVolumeKg > 0
      ? `${formatWeightFromKg(summary.workingVolumeKg, unit)} ${unit}`
      : summary.bodyweightWorkingReps > 0
        ? `${summary.bodyweightWorkingReps} BW reps`
        : `0 ${unit}`;

  const finishedDateLabel = new Date(finishedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/workouts">
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to Workouts</span>
          </Link>
        </Button>

        <Button asChild variant="outline" size="sm">
          <Link href="/history">
            <History className="size-4 text-primary" aria-hidden="true" />
            <span>View History</span>
          </Link>
        </Button>
      </div>

      <Card asChild>
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" className="gap-1 px-3 py-1">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>Workout complete</span>
              </Badge>
              <Badge variant="secondary">
                {workout.templateId !== undefined ? "Routine" : "Freestyle"}
              </Badge>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5" aria-hidden="true" />
              <span>{finishedDateLabel}</span>
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {workout.title}
          </h1>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-center">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Duration
              </p>
              <p className="inline-flex items-center gap-1 text-sm font-semibold text-foreground tabular-nums">
                <Clock className="size-3.5 text-primary" aria-hidden="true" />
                <span>{durationLabel}</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sets
              </p>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {summary.completedSets}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Volume
              </p>
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {volumeLabel}
              </p>
            </div>
          </div>

          {workout.notes !== undefined && workout.notes.length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3.5 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Session notes
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {workout.notes}
              </p>
            </div>
          )}
        </section>
      </Card>

      <div className="space-y-4">
        {workout.exercises.map((exercise, index) => {
          const matchedSets = matchPreviousSetsForExercise(
            exercise.sets,
            exercise.previousSets,
          );

          return (
            <Card asChild key={exercise._id}>
              <article className="p-4 sm:p-5 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge variant="accent" className="tabular-nums">
                      #{index + 1}
                    </Badge>
                    <h2 className="text-base font-semibold text-foreground">
                      {exercise.exerciseName}
                    </h2>
                  </div>
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

                <div className="space-y-1.5 border-t border-border pt-3">
                  {matchedSets.map(
                    ({ set, workingDisplayNumber, previous }) => {
                      const setLabel =
                        set.setType === "working"
                          ? `Set ${workingDisplayNumber ?? set.setNumber}`
                          : SET_TYPE_META[set.setType].label;

                      const weightDisplay =
                        exercise.isBodyweight &&
                        set.weightKg <= WEIGHT_EPSILON_KG
                          ? "BW"
                          : `${exercise.isBodyweight ? "BW+" : ""}${formatWeightFromKg(set.weightKg, unit)} ${unit}`;

                      const progression = evaluateSetProgression({
                        setType: set.setType,
                        weightKg: set.weightKg,
                        reps: set.reps,
                        completed: set.completed,
                        isBodyweight: exercise.isBodyweight,
                        previous,
                      });

                      return (
                        <div
                          key={set._id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2.5">
                            <Badge
                              variant={
                                set.setType === "warmup"
                                  ? "warning"
                                  : set.setType === "drop"
                                    ? "accent"
                                    : set.setType === "failure"
                                      ? "destructive"
                                      : "secondary"
                              }
                              className="tabular-nums"
                            >
                              {setLabel}
                            </Badge>
                            <span className="font-semibold text-foreground tabular-nums">
                              {weightDisplay} &times; {set.reps}
                            </span>
                          </div>

                          {progression.kind === "improved" && (
                            <Badge variant="success" className="gap-1">
                              <TrendingUp
                                className="size-3"
                                aria-hidden="true"
                              />
                              <span>Improved</span>
                            </Badge>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </article>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function WorkoutDetailContent({ workoutId }: { readonly workoutId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const [discardInFlight, setDiscardInFlight] = useState(false);
  const [discardedRedirecting, setDiscardedRedirecting] = useState(false);
  const workout = useQuery(
    api.workouts.get,
    isAuthenticated && workoutId.length > 0 ? { workoutId } : "skip",
  );
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );

  if (discardedRedirecting || (discardInFlight && workout === null)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Workout discarded. Returning to workouts...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workout === undefined || appShellState === undefined) {
    return (
      <div
        className="max-w-2xl mx-auto px-4 py-6 sm:px-6 space-y-4"
        aria-busy="true"
        aria-label="Loading workout"
      >
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-11 w-24 rounded-xl" />
            <Skeleton className="h-11 w-24 rounded-xl" />
          </div>
        </div>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workout === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                Workout not found
              </h1>
              <p className="text-sm text-muted-foreground">
                This workout may have been discarded or the link is invalid.
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
          </CardContent>
        </Card>
      </div>
    );
  }

  const unit = appShellState.settings?.unit ?? DEFAULT_WEIGHT_UNIT;
  const defaultRestSeconds =
    appShellState.settings?.defaultRestSeconds ?? DEFAULT_REST_SECONDS;

  if (workout.status === "completed") {
    return <CompletedWorkoutSummary workout={workout} unit={unit} />;
  }

  const draftScopeId = appShellState.settings?._id ?? "default";

  return (
    <ActiveWorkoutLogger
      key={workout._id}
      workout={workout}
      draftScopeId={draftScopeId}
      unit={unit}
      defaultRestSeconds={defaultRestSeconds}
      onDiscardingChange={setDiscardInFlight}
      onDiscardedRedirecting={() => setDiscardedRedirecting(true)}
    />
  );
}

export default function WorkoutDetailPage() {
  const params = useParams<{ workoutId?: string | string[] }>();
  const rawWorkoutId = params.workoutId;
  const workoutId = Array.isArray(rawWorkoutId)
    ? (rawWorkoutId[0] ?? "")
    : (rawWorkoutId ?? "");

  return (
    <WorkoutRouteErrorBoundary key={workoutId}>
      <WorkoutDetailContent workoutId={workoutId} />
    </WorkoutRouteErrorBoundary>
  );
}
