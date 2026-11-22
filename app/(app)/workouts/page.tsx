"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Activity,
  Dumbbell,
  ListChecks,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreateTemplateDialog } from "@/components/templates/CreateTemplateDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRestDuration } from "@/convex/lib/settings";
import { getConvexErrorMessage } from "@/lib/convexError";

export default function WorkoutsPage() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const templates = useQuery(api.templates.list, isAuthenticated ? {} : "skip");
  const appShellState = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );

  const startWorkout = useMutation(api.workouts.startWorkout);

  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [launchingTarget, setLaunchingTarget] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [activeConflictTitle, setActiveConflictTitle] = useState<string | null>(
    null,
  );

  const settings = appShellState?.settings ?? null;
  const activeWorkout = appShellState?.activeWorkout ?? null;
  const launching = launchingTarget !== null;

  async function handleStartFreestyle() {
    if (launching) {
      return;
    }

    setLaunchingTarget("freestyle");
    setLaunchError(null);
    setActiveConflictTitle(null);
    try {
      const result = await startWorkout({});
      if (result.kind === "started") {
        router.push("/workouts/active");
        return;
      }
      setActiveConflictTitle(result.title);
      setLaunchingTarget(null);
    } catch (err) {
      setLaunchError(
        getConvexErrorMessage(
          err,
          "Could not start freestyle workout. Please try again.",
        ),
      );
      setLaunchingTarget(null);
    }
  }

  async function handleStartFromTemplate(templateId: Id<"workoutTemplates">) {
    if (launching) {
      return;
    }

    setLaunchingTarget(templateId);
    setLaunchError(null);
    setActiveConflictTitle(null);
    try {
      const result = await startWorkout({ templateId });
      if (result.kind === "started") {
        setTemplatePickerOpen(false);
        router.push("/workouts/active");
        return;
      }
      setTemplatePickerOpen(false);
      setActiveConflictTitle(result.title);
      setLaunchingTarget(null);
    } catch (err) {
      setLaunchError(
        getConvexErrorMessage(
          err,
          "Could not start template workout. Please try again.",
        ),
      );
      setLaunchingTarget(null);
    }
  }

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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="rounded-full font-medium"
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

          <Button asChild variant="outline">
            <Link href="/templates">Manage routines</Link>
          </Button>
        </div>
      </header>

      {activeWorkout !== null && (
        <Card asChild>
          <section className="border-primary/25 bg-accent/60 p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Activity className="size-5" aria-hidden="true" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Session in progress
                </p>
                <p className="text-base font-semibold text-foreground">
                  {activeWorkout.title}
                </p>
              </div>
            </div>

            <Button asChild className="self-start sm:self-auto">
              <Link href="/workouts/active">Resume workout</Link>
            </Button>
          </section>
        </Card>
      )}

      {activeConflictTitle !== null && (
        <Alert>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              You already have an active workout ({activeConflictTitle}). Resume
              or discard it before starting a new session.
            </span>
            <Button asChild size="sm" className="self-start sm:self-auto">
              <Link href="/workouts/active">Resume workout</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {launchError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{launchError}</AlertDescription>
        </Alert>
      )}

      <section
        aria-label="Start a workout"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Card asChild>
          <article className="p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Start freestyle workout
                </h2>
                <p className="text-sm text-muted-foreground">
                  Start an empty session and add exercises as you train.
                </p>
              </div>
            </div>

            <Button
              type="button"
              disabled={launching}
              onClick={() => {
                void handleStartFreestyle();
              }}
              className="w-full"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>
                {launchingTarget === "freestyle"
                  ? "Starting freestyle..."
                  : "Start freestyle workout"}
              </span>
            </Button>
          </article>
        </Card>

        <Card asChild>
          <article className="p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <ListChecks className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Start from template
                </h2>
                <p className="text-sm text-muted-foreground">
                  Launch a saved routine with preloaded lifts and rest timers.
                </p>
              </div>
            </div>

            <Button
              type="button"
              disabled={launching || templates === undefined}
              onClick={() => {
                setLaunchError(null);
                setActiveConflictTitle(null);
                setTemplatePickerOpen(true);
              }}
              className="w-full"
            >
              <Play className="size-4" aria-hidden="true" />
              <span>Start from template</span>
            </Button>
          </article>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/templates">Manage all</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateTemplateOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>New routine</span>
            </Button>
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
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Dumbbell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  No routines yet
                </h3>
                <p className="text-sm text-muted-foreground">
                  Create a template to launch structured workouts in one tap.
                </p>
              </div>
              <Button type="button" onClick={() => setCreateTemplateOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                <span>New routine</span>
              </Button>
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
              const isStartingThis = launchingTarget === template._id;

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

                    {template.exercises.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No exercises yet. Edit this routine to add movements.
                      </p>
                    ) : (
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
                    )}

                    <footer className="mt-auto space-y-3 border-t border-border pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                        <ListChecks
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                        <span>
                          {totalTargetSets} target{" "}
                          {totalTargetSets === 1 ? "set" : "sets"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/templates/${template._id}`}>
                            <Pencil className="size-3.5" aria-hidden="true" />
                            <span>Edit</span>
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={launching}
                          onClick={() => {
                            void handleStartFromTemplate(template._id);
                          }}
                        >
                          <Play className="size-3.5" aria-hidden="true" />
                          <span>
                            {isStartingThis ? "Starting..." : "Start"}
                          </span>
                        </Button>
                      </div>
                    </footer>
                  </article>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a routine</DialogTitle>
            <DialogDescription>
              Pick one of your saved templates to begin training.
            </DialogDescription>
          </DialogHeader>

          {templates === undefined ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                You do not have any saved routines yet. Create one first to
                start from a template.
              </p>
              <Button asChild className="w-full">
                <Link href="/templates">Create a routine</Link>
              </Button>
            </div>
          ) : (
            <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
              {templates.map((template) => {
                const totalSets = template.exercises.reduce(
                  (sum, item) => sum + item.targetSets,
                  0,
                );
                const previewNames = template.exercises
                  .slice(0, 3)
                  .map((item) => item.exerciseName)
                  .join(", ");
                const isStartingThis = launchingTarget === template._id;

                return (
                  <div
                    key={template._id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {template.title}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {template.exercises.length}{" "}
                        {template.exercises.length === 1
                          ? "exercise"
                          : "exercises"}{" "}
                        · {totalSets} {totalSets === 1 ? "set" : "sets"}
                      </p>
                      {previewNames.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">
                          {previewNames}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      disabled={launching}
                      onClick={() => {
                        void handleStartFromTemplate(template._id);
                      }}
                      className="shrink-0"
                    >
                      <Play className="size-3.5" aria-hidden="true" />
                      <span>{isStartingThis ? "Starting..." : "Start"}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateTemplateDialog
        open={createTemplateOpen}
        onOpenChange={setCreateTemplateOpen}
      />
    </div>
  );
}
