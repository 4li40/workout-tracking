"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  CalendarCheck,
  ChevronRight,
  Dumbbell,
  RotateCcw,
  Search,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NextTargetBadge } from "@/components/progression/NextTargetBadge";
import {
  formatE1rmDisplay,
  formatFullDate,
  formatVolumeDisplay,
  formatWeightDisplay,
  type ProgressionOverviewExercise,
} from "@/components/progression/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  EQUIPMENT_LABELS,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
} from "@/convex/lib/exercises";
import type { MuscleGroup, WeightUnit } from "@/convex/lib/validators";

type ActivityFilter = "trained" | "all";

interface HighlightStat {
  readonly label: string;
  readonly value: string;
}

function buildRecordHighlights(
  exercise: ProgressionOverviewExercise,
  unit: WeightUnit,
): HighlightStat[] {
  const { record, isBodyweight } = exercise;
  if (record === null) {
    return [];
  }

  const highlights: HighlightStat[] = [];

  if (isBodyweight) {
    if (record.bestBodyweightReps !== undefined) {
      highlights.push({
        label: "Best BW Reps",
        value: `BW × ${record.bestBodyweightReps}`,
      });
    }
    if (record.bestBodyweightSessionReps !== undefined) {
      highlights.push({
        label: "Best Session Reps",
        value: `${record.bestBodyweightSessionReps.toLocaleString()} reps`,
      });
    }
    if (record.bestWeightKg !== undefined) {
      highlights.push({
        label: "Best Added Load",
        value: formatWeightDisplay(record.bestWeightKg, unit, true),
      });
    }
    if (record.bestE1rmKg !== undefined) {
      highlights.push({
        label: "Best Est. 1RM",
        value: formatE1rmDisplay(record.bestE1rmKg, unit),
      });
    }
    return highlights;
  }

  if (record.bestWeightKg !== undefined) {
    highlights.push({
      label: "Best Weight",
      value: formatWeightDisplay(record.bestWeightKg, unit),
    });
  }
  if (record.bestE1rmKg !== undefined) {
    highlights.push({
      label: "Best Est. 1RM",
      value: formatE1rmDisplay(record.bestE1rmKg, unit),
    });
  }
  if (record.bestSessionVolumeKg !== undefined) {
    highlights.push({
      label: "Best Volume",
      value: formatVolumeDisplay(record.bestSessionVolumeKg, unit),
    });
  }

  return highlights;
}

export default function ProgressionPage() {
  const { isAuthenticated } = useConvexAuth();
  const overview = useQuery(
    api.progression.listOverview,
    isAuthenticated ? {} : "skip",
  );

  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter | null>(
    null,
  );
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | "all">("all");

  const defaultActivityFilter: ActivityFilter =
    overview !== undefined && overview.summary.trainedExerciseCount > 0
      ? "trained"
      : "all";
  const effectiveActivityFilter: ActivityFilter =
    activityFilter ?? defaultActivityFilter;

  const hasSecondaryFilters = search.trim().length > 0 || muscleGroup !== "all";
  const hasActiveFilters =
    hasSecondaryFilters || effectiveActivityFilter !== defaultActivityFilter;

  const filteredExercises = useMemo(() => {
    if (overview === undefined) {
      return [];
    }
    const query = search.trim().toLowerCase();

    return overview.exercises.filter((exercise) => {
      if (
        effectiveActivityFilter === "trained" &&
        exercise.sessionCount === 0
      ) {
        return false;
      }
      if (muscleGroup !== "all" && exercise.muscleGroup !== muscleGroup) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }

      const haystack = [
        exercise.name,
        MUSCLE_GROUP_LABELS[exercise.muscleGroup],
        EQUIPMENT_LABELS[exercise.equipment],
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [overview, search, effectiveActivityFilter, muscleGroup]);

  function resetFilters() {
    setSearch("");
    setMuscleGroup("all");
    setActivityFilter(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Progress
          </h1>
          <p className="text-sm text-muted-foreground">
            Track strength trends, all-time personal records, and next-session
            targets across every lift.
          </p>
        </div>

        <Button asChild variant="outline" className="self-start sm:self-auto">
          <Link href="/workouts">
            <Dumbbell className="size-4 text-primary" aria-hidden="true" />
            <span>Start workout</span>
          </Link>
        </Button>
      </header>

      {overview === undefined ? (
        <div
          className="space-y-6"
          aria-busy="true"
          aria-label="Loading progression overview"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Card key={index}>
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-40 rounded-xl" />
              </div>
              <Skeleton className="h-11 w-full rounded-xl" />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {[0, 1, 2, 3].map((index) => (
              <Card key={index}>
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          <section
            aria-label="Progress summary"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <Card>
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Dumbbell className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Exercises Trained
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {overview.summary.trainedExerciseCount}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-tint text-warning">
                  <Trophy className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Total PRs
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {overview.summary.totalPrCount}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-tint text-success">
                  <CalendarCheck className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Completed Workouts
                  </p>
                  <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {overview.summary.totalCompletedWorkouts}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {overview.summary.trainedExerciseCount === 0 && (
            <Card asChild>
              <section className="border-primary/20 bg-accent/45 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <TrendingUp className="size-5" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold text-foreground">
                        Complete your first workout to track progression
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Personal records, e1RM trends, volume charts, and
                        next-session targets appear automatically after you
                        finish a workout.
                      </p>
                    </div>
                  </div>
                  <Button asChild className="self-start sm:self-auto shrink-0">
                    <Link href="/workouts">Log a workout</Link>
                  </Button>
                </div>
              </section>
            </Card>
          )}

          <Card asChild>
            <section
              className="p-4 sm:p-5 space-y-4"
              aria-label="Filter exercise progression"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search exercises..."
                    aria-label="Search exercises"
                    className="pl-10 pr-11"
                  />
                  {search.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                      className="absolute top-1/2 right-0.5 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div
                  role="group"
                  aria-label="Exercise activity filter"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
                >
                  {(
                    [
                      { value: "trained", label: "Trained" },
                      { value: "all", label: "All" },
                    ] as const
                  ).map((option) => {
                    const active = effectiveActivityFilter === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "ghost"}
                        aria-pressed={active}
                        onClick={() => setActivityFilter(option.value)}
                        className={
                          active
                            ? "rounded-lg px-4 shadow-xs"
                            : "rounded-lg px-4 hover:bg-card/70"
                        }
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <NativeSelect
                aria-label="Filter by muscle group"
                value={muscleGroup}
                onChange={(event) => {
                  if (event.target.value === "all") {
                    setMuscleGroup("all");
                    return;
                  }
                  const match = MUSCLE_GROUP_OPTIONS.find(
                    (option) => option.value === event.target.value,
                  );
                  if (match !== undefined) {
                    setMuscleGroup(match.value);
                  }
                }}
              >
                <option value="all">All muscles</option>
                {MUSCLE_GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  Showing {filteredExercises.length} of{" "}
                  {overview.exercises.length}{" "}
                  {overview.exercises.length === 1 ? "exercise" : "exercises"}{" "}
                  &middot; Units in {overview.unit}
                </span>

                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="min-h-11 px-3 text-xs font-semibold text-primary hover:bg-accent hover:text-primary"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    <span>Reset filters</span>
                  </Button>
                )}
              </div>
            </section>
          </Card>

          {filteredExercises.length === 0 ? (
            <Card>
              <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    {effectiveActivityFilter === "trained" &&
                    !hasSecondaryFilters
                      ? "No trained exercises yet"
                      : "No matching exercises"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {effectiveActivityFilter === "trained" &&
                    !hasSecondaryFilters
                      ? "Log and finish a workout to start building progression history, or switch to All exercises."
                      : "Try clearing one of your filters to see more exercises."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {effectiveActivityFilter === "trained" &&
                    !hasSecondaryFilters && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActivityFilter("all")}
                      >
                        View all exercises
                      </Button>
                    )}
                  {hasSecondaryFilters && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetFilters}
                    >
                      Reset filters
                    </Button>
                  )}
                  <Button asChild>
                    <Link href="/workouts">Start workout</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredExercises.map((exercise) => {
                const highlights = buildRecordHighlights(
                  exercise,
                  overview.unit,
                );

                return (
                  <Card
                    asChild
                    key={exercise._id}
                    className="transition-colors hover:border-primary/40 hover:shadow-sm"
                  >
                    <Link
                      href={`/progression/${exercise._id}`}
                      className="block p-4 sm:p-5 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <h2 className="text-base font-semibold text-foreground leading-snug">
                            {exercise.name}
                          </h2>
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
                            {exercise.isCustom && (
                              <Badge variant="outline">Custom</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-right">
                          <div className="hidden sm:block space-y-0.5">
                            <p className="text-xs font-semibold text-foreground tabular-nums">
                              {exercise.sessionCount === 0
                                ? "Not logged yet"
                                : `${exercise.sessionCount} ${exercise.sessionCount === 1 ? "session" : "sessions"}`}
                            </p>
                            {exercise.lastPerformedAt !== null && (
                              <p className="text-xs text-muted-foreground tabular-nums">
                                Last: {formatFullDate(exercise.lastPerformedAt)}
                              </p>
                            )}
                          </div>
                          <ChevronRight
                            className="size-5 text-muted-foreground shrink-0"
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden tabular-nums">
                        <span className="font-medium text-foreground">
                          {exercise.sessionCount === 0
                            ? "Not logged yet"
                            : `${exercise.sessionCount} ${exercise.sessionCount === 1 ? "session" : "sessions"}`}
                        </span>
                        {exercise.lastPerformedAt !== null && (
                          <span>
                            Last: {formatFullDate(exercise.lastPerformedAt)}
                          </span>
                        )}
                      </div>

                      {highlights.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {highlights.map((stat) => (
                            <div
                              key={stat.label}
                              className="rounded-xl border border-border/80 bg-secondary/45 px-3 py-2"
                            >
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {stat.label}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                                {stat.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {exercise.nextTarget !== null && (
                        <NextTargetBadge
                          target={exercise.nextTarget}
                          unit={overview.unit}
                          variant="compact"
                        />
                      )}
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
