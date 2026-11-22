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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Workouts
          </h1>
          <p className="text-sm text-muted-foreground">
            Start a freestyle session or train from your saved routines.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="self-start rounded-full font-medium"
        >
          <Link href="/settings">
            <SlidersHorizontal
              className="h-4 w-4 text-primary"
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
        </Button>
      </header>

      <Card asChild>
        <section className="p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Plus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Freestyle Workout
              </h2>
              <p className="text-sm text-muted-foreground">
                Start an empty session and add exercises as you train.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            disabled
            aria-disabled="true"
            className="shrink-0 text-muted-foreground"
          >
            Logger coming next
          </Button>
        </section>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              My Routines
            </h2>
            {templates !== undefined && templates.length > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {templates.length}
              </Badge>
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
              <Card key={index}>
                <CardContent className="p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-4 w-full rounded" />
                    <Skeleton className="h-4 w-5/6 rounded" />
                    <Skeleton className="h-4 w-4/5 rounded" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </div>
                  <div className="mt-auto border-t border-border pt-3">
                    <Skeleton className="h-4 w-28 rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Dumbbell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  No routines yet
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your saved workout templates will appear here once created.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const totalTargetSets = template.exercises.reduce(
                (sum, exercise) => sum + exercise.targetSets,
                0,
              );
              const exerciseCount = template.exercises.length;

              return (
                <Card asChild key={template._id}>
                  <article className="p-5 gap-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {template.title}
                      </h3>
                      <Badge variant="accent" className="shrink-0 tabular-nums">
                        {exerciseCount}{" "}
                        {exerciseCount === 1 ? "exercise" : "exercises"}
                      </Badge>
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
                              <p className="truncate font-medium text-foreground">
                                {exercise.exerciseName}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {targetSummary}
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className="shrink-0 rounded-md px-2 font-medium tabular-nums"
                            >
                              <Timer className="size-3" aria-hidden="true" />
                              {formatRestDuration(exercise.restSeconds)}
                            </Badge>
                          </li>
                        );
                      })}
                    </ol>

                    <footer className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-xs font-medium text-muted-foreground tabular-nums">
                      <ListChecks
                        className="h-3.5 w-3.5 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        {totalTargetSets} target{" "}
                        {totalTargetSets === 1 ? "set" : "sets"}
                      </span>
                    </footer>
                  </article>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
