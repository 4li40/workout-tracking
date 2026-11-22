"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Dumbbell,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreateTemplateDialog } from "@/components/templates/CreateTemplateDialog";
import { DeleteTemplateDialog } from "@/components/templates/DeleteTemplateDialog";
import type { WorkoutTemplateItem } from "@/components/templates/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRestDuration } from "@/convex/lib/settings";
import { reorderByIndex } from "@/convex/lib/templates";
import { getConvexErrorMessage } from "@/lib/convexError";

export default function TemplatesPage() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const templates = useQuery(api.templates.list, isAuthenticated ? {} : "skip");

  const reorderTemplates = useMutation(api.templates.reorder);
  const duplicateTemplate = useMutation(api.templates.duplicate);
  const startWorkout = useMutation(api.workouts.startWorkout);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    readonly _id: Id<"workoutTemplates">;
    readonly title: string;
  } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [duplicatingId, setDuplicatingId] =
    useState<Id<"workoutTemplates"> | null>(null);
  const [startingId, setStartingId] = useState<Id<"workoutTemplates"> | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeConflictTitle, setActiveConflictTitle] = useState<string | null>(
    null,
  );

  const busy = reordering || duplicatingId !== null || startingId !== null;

  async function handleReorder(
    list: readonly WorkoutTemplateItem[],
    fromIndex: number,
    toIndex: number,
  ) {
    if (busy) {
      return;
    }

    const nextList = reorderByIndex(list, fromIndex, toIndex);
    setReordering(true);
    setActionError(null);
    try {
      await reorderTemplates({
        orderedTemplateIds: nextList.map((item) => item._id),
      });
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not reorder routines. Please try again.",
        ),
      );
    } finally {
      setReordering(false);
    }
  }

  async function handleDuplicate(templateId: Id<"workoutTemplates">) {
    if (busy) {
      return;
    }

    setDuplicatingId(templateId);
    setActionError(null);
    try {
      await duplicateTemplate({ templateId });
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not duplicate routine. Please try again.",
        ),
      );
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleStart(templateId: Id<"workoutTemplates">) {
    if (busy) {
      return;
    }

    setStartingId(templateId);
    setActionError(null);
    setActiveConflictTitle(null);
    try {
      const result = await startWorkout({ templateId });
      if (result.kind === "started") {
        router.push("/workouts/active");
        return;
      }
      setActiveConflictTitle(result.title);
      setStartingId(null);
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not start workout. Please try again.",
        ),
      );
      setStartingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Routines
          </h1>
          <p className="text-sm text-muted-foreground">
            Create, reorder, duplicate, and customize your workout templates.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="self-start sm:self-auto"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>New routine</span>
        </Button>
      </header>

      {activeConflictTitle !== null && (
        <Alert>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              You already have an active workout ({activeConflictTitle}). Resume
              or discard it before starting another.
            </span>
            <Button asChild size="sm" className="self-start sm:self-auto">
              <Link href="/workouts/active">Resume workout</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {actionError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {templates === undefined ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading routines"
        >
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-44" />
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
              <h2 className="text-base font-semibold text-foreground">
                No routines yet
              </h2>
              <p className="text-sm text-muted-foreground">
                Build a template with your favorite exercises, set counts, and
                rest durations.
              </p>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              <span>New routine</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {templates.map((template, index) => {
            const totalTargetSets = template.exercises.reduce(
              (sum, exercise) => sum + exercise.targetSets,
              0,
            );
            const isDuplicating = duplicatingId === template._id;
            const isStarting = startingId === template._id;

            return (
              <Card asChild key={template._id}>
                <article className="p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">
                          {template.title}
                        </h2>
                        <Badge variant="accent" className="tabular-nums">
                          {template.exercises.length}{" "}
                          {template.exercises.length === 1
                            ? "exercise"
                            : "exercises"}
                        </Badge>
                        <Badge variant="secondary" className="tabular-nums">
                          <ListChecks className="size-3" aria-hidden="true" />
                          {totalTargetSets}{" "}
                          {totalTargetSets === 1 ? "set" : "sets"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy || index === 0}
                        aria-label={`Move ${template.title} up`}
                        onClick={() => {
                          void handleReorder(templates, index, index - 1);
                        }}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy || index === templates.length - 1}
                        aria-label={`Move ${template.title} down`}
                        onClick={() => {
                          void handleReorder(templates, index, index + 1);
                        }}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy}
                        aria-label={`Duplicate ${template.title}`}
                        onClick={() => {
                          void handleDuplicate(template._id);
                        }}
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy}
                        aria-label={`Delete ${template.title}`}
                        onClick={() =>
                          setDeleteTarget({
                            _id: template._id,
                            title: template.title,
                          })
                        }
                        className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {template.exercises.length === 0 ? (
                    <p className="rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                      No exercises added yet. Edit this routine to add lifts.
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {template.exercises.map((exercise) => {
                        const targetSummary =
                          exercise.targetReps !== undefined
                            ? `${exercise.targetSets} × ${exercise.targetReps}`
                            : `${exercise.targetSets} ${exercise.targetSets === 1 ? "set" : "sets"}`;

                        return (
                          <li
                            key={exercise._id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
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
                              className="shrink-0 rounded-md px-2 tabular-nums"
                            >
                              <Timer className="size-3" aria-hidden="true" />
                              {formatRestDuration(exercise.restSeconds)}
                            </Badge>
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {isDuplicating
                        ? "Duplicating routine..."
                        : `Order #${index + 1}`}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/templates/${template._id}`}>
                          <Pencil className="size-4" aria-hidden="true" />
                          <span>Edit</span>
                        </Link>
                      </Button>

                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void handleStart(template._id);
                        }}
                      >
                        <Play className="size-4" aria-hidden="true" />
                        <span>{isStarting ? "Starting..." : "Start"}</span>
                      </Button>
                    </div>
                  </div>
                </article>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <DeleteTemplateDialog
        template={deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
