"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Dumbbell,
  ShieldAlert,
  StickyNote,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Component, type ReactNode } from "react";
import { ExerciseProgressionCharts } from "@/components/progression/ExerciseProgressionCharts";
import { NextTargetBadge } from "@/components/progression/NextTargetBadge";
import {
  type ExerciseRecordSummary,
  type ExerciseTimelinePoint,
  formatE1rmDisplay,
  formatFullDate,
  formatVolumeDisplay,
  formatWeightDisplay,
} from "@/components/progression/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/convex/lib/exercises";
import { PR_TYPE_LABELS } from "@/convex/lib/prEngine";
import type { WeightUnit } from "@/convex/lib/validators";
import { getConvexErrorCode } from "@/lib/convexError";

interface ProgressionRouteErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ProgressionRouteErrorBoundaryState {
  readonly error: unknown | null;
}

class ProgressionRouteErrorBoundary extends Component<
  ProgressionRouteErrorBoundaryProps,
  ProgressionRouteErrorBoundaryState
> {
  state: ProgressionRouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: unknown,
  ): ProgressionRouteErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      if (getConvexErrorCode(this.state.error) === "FORBIDDEN") {
        return (
          <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
            <Card>
              <CardContent className="p-6 sm:p-8 space-y-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive-tint text-destructive">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold text-foreground">
                    You do not have access to this exercise
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    This custom exercise belongs to another account or is
                    unavailable.
                  </p>
                </div>
                <div>
                  <Button asChild>
                    <Link href="/progression">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Back to Progress</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }

      throw this.state.error;
    }

    return this.props.children;
  }
}

interface RecordCardItem {
  readonly label: string;
  readonly value: string;
  readonly caption: string;
}

function buildRecordCards(
  record: ExerciseRecordSummary,
  unit: WeightUnit,
  isBodyweight: boolean,
): RecordCardItem[] {
  const cards: RecordCardItem[] = [];

  if (isBodyweight) {
    if (record.bestBodyweightReps !== undefined) {
      cards.push({
        label: "Max BW Reps",
        value: `BW × ${record.bestBodyweightReps}`,
        caption: "Best single bodyweight set",
      });
    }
    if (record.bestBodyweightSessionReps !== undefined) {
      cards.push({
        label: "Best BW Session Reps",
        value: `${record.bestBodyweightSessionReps.toLocaleString()} reps`,
        caption: "Total working bodyweight reps",
      });
    }
    if (record.bestWeightKg !== undefined) {
      cards.push({
        label: "Best Added Load",
        value: formatWeightDisplay(record.bestWeightKg, unit, true),
        caption: "Heaviest weighted set",
      });
    }
    if (record.bestE1rmKg !== undefined) {
      cards.push({
        label: "Best Est. 1RM",
        value: formatE1rmDisplay(record.bestE1rmKg, unit),
        caption: "Added load Epley e1RM",
      });
    }
    if (record.bestSessionVolumeKg !== undefined) {
      cards.push({
        label: "Best Added Volume",
        value: formatVolumeDisplay(record.bestSessionVolumeKg, unit),
        caption: "Highest added-load session",
      });
    }
    return cards;
  }

  if (record.bestWeightKg !== undefined) {
    cards.push({
      label: "Best Weight",
      value: formatWeightDisplay(record.bestWeightKg, unit),
      caption: "Heaviest working set",
    });
  }
  if (record.bestE1rmKg !== undefined) {
    cards.push({
      label: "Best Est. 1RM",
      value: formatE1rmDisplay(record.bestE1rmKg, unit),
      caption: "All-time Epley e1RM",
    });
  }
  if (record.bestSessionVolumeKg !== undefined) {
    cards.push({
      label: "Best Session Volume",
      value: formatVolumeDisplay(record.bestSessionVolumeKg, unit),
      caption: "Total working weight × reps",
    });
  }

  return cards;
}

function buildSessionMetrics(
  point: ExerciseTimelinePoint,
  unit: WeightUnit,
  isBodyweight: boolean,
): Array<{ readonly label: string; readonly value: string }> {
  const metrics: Array<{ readonly label: string; readonly value: string }> = [];

  if (point.bestWeightKg !== null) {
    metrics.push({
      label: isBodyweight ? "Top Added" : "Top Weight",
      value: formatWeightDisplay(point.bestWeightKg, unit, isBodyweight),
    });
  }
  if (point.bestE1rmKg !== null) {
    metrics.push({
      label: "Est. 1RM",
      value: formatE1rmDisplay(point.bestE1rmKg, unit),
    });
  }
  if (point.sessionVolumeKg !== null) {
    metrics.push({
      label: isBodyweight ? "Added Volume" : "Volume",
      value: formatVolumeDisplay(point.sessionVolumeKg, unit),
    });
  }
  if (point.bestBodyweightReps !== null) {
    metrics.push({
      label: "Max BW Reps",
      value: `BW × ${point.bestBodyweightReps}`,
    });
  }
  if (point.bodyweightSessionReps !== null) {
    metrics.push({
      label: "BW Session Reps",
      value: `${point.bodyweightSessionReps.toLocaleString()} reps`,
    });
  }

  return metrics;
}

function ExerciseProgressionContent({
  exerciseId,
}: {
  readonly exerciseId: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const detail = useQuery(
    api.progression.getExerciseDetail,
    isAuthenticated && exerciseId.length > 0 ? { exerciseId } : "skip",
  );

  if (detail === undefined) {
    return (
      <div
        className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6"
        aria-busy="true"
        aria-label="Loading exercise progression"
      >
        <Skeleton className="h-11 w-40 rounded-xl" />

        <Card>
          <CardContent className="p-5 sm:p-6 space-y-3">
            <Skeleton className="h-7 w-56" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="p-4 sm:p-5 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3.5 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-[240px] w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                Exercise not found
              </h1>
              <p className="text-sm text-muted-foreground">
                This exercise may have been deleted or the link is invalid.
              </p>
            </div>
            <div>
              <Button asChild>
                <Link href="/progression">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back to Progress</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const recordCards =
    detail.record !== null
      ? buildRecordCards(
          detail.record,
          detail.unit,
          detail.exercise.isBodyweight,
        )
      : [];
  const reverseTimeline = [...detail.timeline].reverse();
  const latestSession = reverseTimeline.length > 0 ? reverseTimeline[0] : null;
  const hasStickyNote =
    detail.stickyNote !== undefined && detail.stickyNote.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/progression">
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to Progress</span>
          </Link>
        </Button>

        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          Units in {detail.unit}
        </span>
      </div>

      <Card asChild>
        <header className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {detail.exercise.name}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">
                  {MUSCLE_GROUP_LABELS[detail.exercise.muscleGroup]}
                </Badge>
                <Badge variant="secondary">
                  {EQUIPMENT_LABELS[detail.exercise.equipment]}
                </Badge>
                {detail.exercise.isBodyweight && (
                  <Badge variant="accent">Bodyweight</Badge>
                )}
                {detail.exercise.isCustom && (
                  <Badge variant="outline">Custom</Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1 tabular-nums">
              <span className="font-semibold text-foreground">
                {detail.totalSessions}{" "}
                {detail.totalSessions === 1
                  ? "completed session"
                  : "completed sessions"}
              </span>
              {latestSession !== null && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  <span>Last: {formatFullDate(latestSession.completedAt)}</span>
                </span>
              )}
            </div>
          </div>

          {hasStickyNote && (
            <div className="rounded-xl border border-primary/15 bg-accent/60 px-3.5 py-2.5 text-sm">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <StickyNote className="size-3.5" aria-hidden="true" />
                <span>Private note</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {detail.stickyNote}
              </p>
            </div>
          )}
        </header>
      </Card>

      {detail.nextTarget !== null && (
        <NextTargetBadge
          target={detail.nextTarget}
          unit={detail.unit}
          variant="card"
        />
      )}

      {detail.timeline.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                No completed sessions yet
              </h2>
              <p className="text-sm text-muted-foreground">
                Log {detail.exercise.name} in a completed workout to unlock
                all-time personal records, interactive strength charts, and
                next-session targets.
              </p>
            </div>
            <Button asChild>
              <Link href="/workouts">Start a workout</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {recordCards.length > 0 && (
            <section
              aria-label="All-time personal records"
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-warning" aria-hidden="true" />
                <h2 className="text-base font-semibold text-foreground">
                  All-Time Personal Records
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recordCards.map((card) => (
                  <Card key={card.label}>
                    <CardContent className="p-4 sm:p-5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {card.label}
                        </p>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-warning-tint text-warning">
                          <Trophy className="size-3.5" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
                        {card.value}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {card.caption}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <ExerciseProgressionCharts
            timeline={detail.timeline}
            unit={detail.unit}
            isBodyweight={detail.exercise.isBodyweight}
          />

          <section aria-label="Session history" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Session History
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {reverseTimeline.length}{" "}
                {reverseTimeline.length === 1 ? "session" : "sessions"}
              </span>
            </div>

            <div className="space-y-2.5">
              {reverseTimeline.map((point) => {
                const metrics = buildSessionMetrics(
                  point,
                  detail.unit,
                  detail.exercise.isBodyweight,
                );

                return (
                  <Card asChild key={point.workoutId}>
                    <article className="p-4 sm:p-5 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/workouts/${point.workoutId}`}
                              className="inline-flex min-h-11 items-center gap-1 -my-2 py-2 text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                            >
                              <span>{point.workoutTitle}</span>
                              <ArrowUpRight
                                className="size-3.5 text-muted-foreground"
                                aria-hidden="true"
                              />
                            </Link>
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatFullDate(point.completedAt)} &middot;{" "}
                            {point.workingSetCount}{" "}
                            {point.workingSetCount === 1
                              ? "working set"
                              : "working sets"}
                          </p>
                        </div>

                        {point.achievedPrs.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {point.achievedPrs.map((prType) => (
                              <Badge key={prType} variant="warning">
                                <Trophy className="size-3" aria-hidden="true" />
                                <span>{PR_TYPE_LABELS[prType]}</span>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {metrics.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                          {metrics.map((metric) => (
                            <div
                              key={metric.label}
                              className="rounded-xl bg-secondary/50 px-3 py-2"
                            >
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {metric.label}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                                {metric.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function ExerciseProgressionPage() {
  const params = useParams<{ exerciseId?: string | string[] }>();
  const rawExerciseId = params.exerciseId;
  const exerciseId = Array.isArray(rawExerciseId)
    ? (rawExerciseId[0] ?? "")
    : (rawExerciseId ?? "");

  return (
    <ProgressionRouteErrorBoundary key={exerciseId}>
      <ExerciseProgressionContent exerciseId={exerciseId} />
    </ProgressionRouteErrorBoundary>
  );
}
