"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowRight,
  Calendar,
  Clock,
  Dumbbell,
  History,
  Pencil,
  Search,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DeleteCompletedWorkoutDialog } from "@/components/history/DeleteCompletedWorkoutDialog";
import { EditCompletedWorkoutDialog } from "@/components/history/EditCompletedWorkoutDialog";
import type { HistoryWorkoutSummary } from "@/components/history/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_UNIT,
  formatElapsedDuration,
} from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";
import { formatWeightFromKg, WEIGHT_EPSILON_KG } from "@/convex/lib/workouts";

const INITIAL_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const MAX_PREVIEW_EXERCISES = 6;

interface DialogWorkoutTarget {
  readonly workoutId: Id<"workouts">;
  readonly title: string;
}

function formatHistoryDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHistoryVolume(
  workingVolumeKg: number,
  bodyweightWorkingReps: number,
  unit: WeightUnit,
): string {
  const hasWeighted = workingVolumeKg > WEIGHT_EPSILON_KG;
  const hasBodyweight = bodyweightWorkingReps > 0;
  const bwLabel = `${bodyweightWorkingReps} BW ${bodyweightWorkingReps === 1 ? "rep" : "reps"}`;

  if (hasWeighted && hasBodyweight) {
    return `${formatWeightFromKg(workingVolumeKg, unit)} ${unit} + ${bwLabel}`;
  }
  if (hasWeighted) {
    return `${formatWeightFromKg(workingVolumeKg, unit)} ${unit}`;
  }
  if (hasBodyweight) {
    return bwLabel;
  }
  return `0 ${unit}`;
}

function HistoryWorkoutCard({
  workout,
  unit,
  onEdit,
  onDelete,
}: {
  readonly workout: HistoryWorkoutSummary;
  readonly unit: WeightUnit;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  const volumeLabel = formatHistoryVolume(
    workout.workingVolumeKg,
    workout.bodyweightWorkingReps,
    unit,
  );
  const previewExercises = workout.exerciseNames.slice(
    0,
    MAX_PREVIEW_EXERCISES,
  );
  const hiddenExerciseCount = Math.max(
    0,
    workout.exerciseNames.length - previewExercises.length,
  );
  const hasWarmups = workout.totalCompletedSetCount > workout.workingSetCount;

  return (
    <Card asChild>
      <article className="p-4 sm:p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar className="size-3.5" aria-hidden="true" />
                <span>{formatHistoryDate(workout.finishedAt)}</span>
              </span>
              <Badge variant="secondary">
                {workout.templateId !== undefined ? "Routine" : "Freestyle"}
              </Badge>
              {workout.prCount > 0 && (
                <Badge variant="warning" className="gap-1 tabular-nums">
                  <Trophy className="size-3" aria-hidden="true" />
                  <span>
                    {workout.prCount} {workout.prCount === 1 ? "PR" : "PRs"}
                  </span>
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              <Link
                href={`/workouts/${workout._id}`}
                className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
              >
                {workout.title}
              </Link>
            </h2>
            {workout.notes !== undefined && workout.notes.length > 0 && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {workout.notes}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-center">
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Duration
            </p>
            <p className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-foreground tabular-nums">
              <Clock className="size-3.5 text-primary" aria-hidden="true" />
              <span>{formatElapsedDuration(workout.durationMs)}</span>
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Working sets
            </p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {workout.workingSetCount}
              {hasWarmups && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {workout.totalCompletedSetCount}
                </span>
              )}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total volume
            </p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {volumeLabel}
            </p>
          </div>
        </div>

        {previewExercises.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {previewExercises.map((exerciseName, index) => (
              <Badge
                key={`${workout._id}-${index}-${exerciseName}`}
                variant="secondary"
                className="font-medium text-foreground/85"
              >
                {exerciseName}
              </Badge>
            ))}
            {hiddenExerciseCount > 0 && (
              <Badge variant="outline" className="tabular-nums">
                +{hiddenExerciseCount} more
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/workouts/${workout._id}`}>
              <span>View session</span>
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
          </Button>

          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="size-4 text-primary" aria-hidden="true" />
              <span>Edit</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-muted-foreground hover:bg-destructive-tint hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      </article>
    </Card>
  );
}

export default function HistoryPage() {
  const { isAuthenticated } = useConvexAuth();
  const [limit, setLimit] = useState(INITIAL_HISTORY_LIMIT);
  const [search, setSearch] = useState("");
  const [prsOnly, setPrsOnly] = useState(false);
  const [editingTarget, setEditingTarget] =
    useState<DialogWorkoutTarget | null>(null);
  const [deletingTarget, setDeletingTarget] =
    useState<DialogWorkoutTarget | null>(null);

  const workouts = useQuery(
    api.history.list,
    isAuthenticated ? { limit } : "skip",
  );
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );

  const unit = appShellState?.settings?.unit ?? DEFAULT_WEIGHT_UNIT;
  const defaultRestSeconds =
    appShellState?.settings?.defaultRestSeconds ?? DEFAULT_REST_SECONDS;

  const filteredWorkouts = useMemo(() => {
    if (workouts === undefined) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return workouts.filter((workout) => {
      if (prsOnly && workout.prCount === 0) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      if (workout.title.toLowerCase().includes(query)) {
        return true;
      }
      return workout.exerciseNames.some((name) =>
        name.toLowerCase().includes(query),
      );
    });
  }, [workouts, search, prsOnly]);

  const hasFilters = search.trim().length > 0 || prsOnly;
  const canLoadMore =
    workouts !== undefined &&
    workouts.length === limit &&
    limit < MAX_HISTORY_LIMIT;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            History
          </h1>
          <p className="text-sm text-muted-foreground">
            Review completed workouts, session volume, and personal records.
          </p>
        </div>

        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/workouts">
            <Dumbbell className="size-4 text-primary" aria-hidden="true" />
            <span>Start workout</span>
          </Link>
        </Button>
      </header>

      {workouts === undefined || appShellState === undefined ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading workout history"
        >
          <Skeleton className="h-11 w-full rounded-xl" />
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : workouts.length === 0 ? (
        <Card asChild>
          <section className="p-6 sm:p-8 space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                No completed workouts yet
              </h2>
              <p className="text-sm text-muted-foreground">
                Finish a session to see it here with duration, working sets,
                total volume, and automatic PR highlights.
              </p>
            </div>
            <div>
              <Button asChild>
                <Link href="/workouts">
                  <Dumbbell className="size-4" aria-hidden="true" />
                  <span>Go to Workouts</span>
                </Link>
              </Button>
            </div>
          </section>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by workout title or exercise..."
                aria-label="Search workout history"
                className="pl-10 pr-11"
              />
              {search.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear history search"
                  className="absolute top-1/2 right-0.5 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <Button
              type="button"
              variant={prsOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={prsOnly}
              onClick={() => setPrsOnly((previous) => !previous)}
              className="w-full sm:w-auto"
            >
              <Trophy
                className={prsOnly ? "size-4" : "size-4 text-warning"}
                aria-hidden="true"
              />
              <span>PRs only</span>
            </Button>
          </div>

          {filteredWorkouts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    No matching workouts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search or filter to see more completed
                    sessions.
                  </p>
                </div>
                {hasFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setPrsOnly(false);
                    }}
                  >
                    Reset filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3.5">
              {filteredWorkouts.map((workout) => (
                <HistoryWorkoutCard
                  key={workout._id}
                  workout={workout}
                  unit={unit}
                  onEdit={() =>
                    setEditingTarget({
                      workoutId: workout._id,
                      title: workout.title,
                    })
                  }
                  onDelete={() =>
                    setDeletingTarget({
                      workoutId: workout._id,
                      title: workout.title,
                    })
                  }
                />
              ))}
            </div>
          )}

          {canLoadMore && (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLimit(MAX_HISTORY_LIMIT)}
              >
                Load more workouts
              </Button>
            </div>
          )}
        </div>
      )}

      {editingTarget !== null && (
        <EditCompletedWorkoutDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setEditingTarget(null);
            }
          }}
          workoutId={editingTarget.workoutId}
          workoutTitle={editingTarget.title}
          unit={unit}
          defaultRestSeconds={defaultRestSeconds}
        />
      )}

      {deletingTarget !== null && (
        <DeleteCompletedWorkoutDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setDeletingTarget(null);
            }
          }}
          workoutId={deletingTarget.workoutId}
          workoutTitle={deletingTarget.title}
        />
      )}
    </div>
  );
}
