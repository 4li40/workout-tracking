"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  Copy,
  Dumbbell,
  ListChecks,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { DeleteTemplateDialog } from "@/components/templates/DeleteTemplateDialog";
import { ExercisePickerDialog } from "@/components/templates/ExercisePickerDialog";
import { TemplateExerciseRow } from "@/components/templates/TemplateExerciseRow";
import { TemplateRouteErrorBoundary } from "@/components/templates/TemplateRouteErrorBoundary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_TEMPLATE_TITLE_LENGTH,
  parseTemplateTitle,
  reorderByIndex,
} from "@/convex/lib/templates";
import { getConvexErrorMessage } from "@/lib/convexError";

const SAVED_BADGE_MS = 2500;

function TemplateDetailContent({
  templateId,
}: {
  readonly templateId: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const template = useQuery(
    api.templates.get,
    isAuthenticated && templateId.length > 0 ? { templateId } : "skip",
  );

  const updateTitle = useMutation(api.templates.updateTitle);
  const duplicateTemplate = useMutation(api.templates.duplicate);
  const reorderExercises = useMutation(api.templates.reorderExercises);
  const removeExercise = useMutation(api.templates.removeExercise);
  const startWorkout = useMutation(api.workouts.startWorkout);

  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedRedirecting, setDeletedRedirecting] = useState(false);

  const [reordering, setReordering] = useState(false);
  const [removingExerciseId, setRemovingExerciseId] =
    useState<Id<"templateExercises"> | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeConflictTitle, setActiveConflictTitle] = useState<string | null>(
    null,
  );

  const titleSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputId = useId();

  useEffect(() => {
    return () => {
      if (titleSavedTimerRef.current !== null) {
        clearTimeout(titleSavedTimerRef.current);
      }
    };
  }, []);

  if (deletedRedirecting) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Routine deleted. Returning to routines...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (template === undefined) {
    return (
      <div
        className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6"
        aria-busy="true"
        aria-label="Loading routine"
      >
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                Routine not found
              </h1>
              <p className="text-sm text-muted-foreground">
                This routine may have been deleted or the link is invalid.
              </p>
            </div>
            <div>
              <Button asChild>
                <Link href="/templates">
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  <span>Back to Routines</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loadedTemplate = template;
  const currentTitle = draftTitle ?? loadedTemplate.title;
  const hasTitleChanges =
    draftTitle !== null && draftTitle.trim() !== loadedTemplate.title;
  const totalTargetSets = loadedTemplate.exercises.reduce(
    (sum, item) => sum + item.targetSets,
    0,
  );
  const existingExerciseIds = new Set(
    loadedTemplate.exercises.map((item) => item.exerciseId),
  );
  const headerBusy = duplicating || starting;

  function showTitleSaved() {
    setTitleSaved(true);
    if (titleSavedTimerRef.current !== null) {
      clearTimeout(titleSavedTimerRef.current);
    }
    titleSavedTimerRef.current = setTimeout(() => {
      setTitleSaved(false);
    }, SAVED_BADGE_MS);
  }

  async function handleSaveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (titleSaving) {
      return;
    }

    const parsed = parseTemplateTitle(currentTitle);
    if (parsed.kind === "error") {
      setTitleError(parsed.message);
      setTitleSaved(false);
      return;
    }

    if (parsed.title === loadedTemplate.title) {
      setDraftTitle(null);
      setTitleError(null);
      return;
    }

    setTitleSaving(true);
    setTitleError(null);
    setTitleSaved(false);
    try {
      await updateTitle({
        templateId: loadedTemplate._id,
        title: parsed.title,
      });
      setDraftTitle(null);
      showTitleSaved();
    } catch (err) {
      setTitleError(
        getConvexErrorMessage(
          err,
          "Could not rename routine. Please try again.",
        ),
      );
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleDuplicate() {
    if (headerBusy) {
      return;
    }

    setDuplicating(true);
    setActionError(null);
    try {
      const copyId = await duplicateTemplate({
        templateId: loadedTemplate._id,
      });
      router.push(`/templates/${copyId}`);
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not duplicate routine. Please try again.",
        ),
      );
      setDuplicating(false);
    }
  }

  async function handleStartWorkout() {
    if (headerBusy) {
      return;
    }

    setStarting(true);
    setActionError(null);
    setActiveConflictTitle(null);
    try {
      const result = await startWorkout({ templateId: loadedTemplate._id });
      if (result.kind === "started") {
        router.push("/workouts/active");
        return;
      }
      setActiveConflictTitle(result.title);
      setStarting(false);
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not start workout. Please try again.",
        ),
      );
      setStarting(false);
    }
  }

  async function handleReorderExercise(fromIndex: number, toIndex: number) {
    if (reordering || removingExerciseId !== null) {
      return;
    }

    const nextList = reorderByIndex(
      loadedTemplate.exercises,
      fromIndex,
      toIndex,
    );
    setReordering(true);
    setActionError(null);
    try {
      await reorderExercises({
        templateId: loadedTemplate._id,
        orderedTemplateExerciseIds: nextList.map((item) => item._id),
      });
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not reorder exercises. Please try again.",
        ),
      );
    } finally {
      setReordering(false);
    }
  }

  async function handleRemoveExercise(
    templateExerciseId: Id<"templateExercises">,
  ) {
    if (reordering || removingExerciseId !== null) {
      return;
    }

    setRemovingExerciseId(templateExerciseId);
    setActionError(null);
    try {
      await removeExercise({ templateExerciseId });
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not remove exercise from routine. Please try again.",
        ),
      );
    } finally {
      setRemovingExerciseId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline" className="self-start">
          <Link href="/templates">
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Routines</span>
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={headerBusy}
            onClick={() => {
              void handleDuplicate();
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            <span>{duplicating ? "Duplicating..." : "Duplicate"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={headerBusy}
            onClick={() => setDeleteOpen(true)}
            className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span>Delete</span>
          </Button>

          <Button
            type="button"
            disabled={headerBusy}
            onClick={() => {
              void handleStartWorkout();
            }}
          >
            <Play className="size-4" aria-hidden="true" />
            <span>{starting ? "Starting..." : "Start workout"}</span>
          </Button>
        </div>
      </div>

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

      <Card asChild>
        <section className="p-5 space-y-3">
          <form
            noValidate
            onSubmit={(event) => {
              void handleSaveTitle(event);
            }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={titleInputId}
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Routine title
              </Label>
              {titleSaved && (
                <Badge role="status" variant="success">
                  <Check className="size-3" aria-hidden="true" />
                  Saved
                </Badge>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id={titleInputId}
                value={currentTitle}
                maxLength={MAX_TEMPLATE_TITLE_LENGTH}
                disabled={titleSaving}
                onChange={(event) => {
                  const next = event.target.value;
                  setTitleError(null);
                  setTitleSaved(false);
                  setDraftTitle(
                    next.trim() === loadedTemplate.title ? null : next,
                  );
                }}
                className="text-base font-semibold"
              />

              {hasTitleChanges && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="submit" disabled={titleSaving}>
                    {titleSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={titleSaving}
                    onClick={() => {
                      setDraftTitle(null);
                      setTitleError(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>

            {titleError !== null && (
              <Alert variant="destructive">
                <AlertDescription>{titleError}</AlertDescription>
              </Alert>
            )}
          </form>
        </section>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Exercises</h1>
            <Badge variant="accent" className="tabular-nums">
              {loadedTemplate.exercises.length}
            </Badge>
            <Badge variant="secondary" className="tabular-nums">
              <ListChecks className="size-3" aria-hidden="true" />
              {totalTargetSets}{" "}
              {totalTargetSets === 1 ? "target set" : "target sets"}
            </Badge>
          </div>

          <Button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="self-start sm:self-auto"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Add exercise</span>
          </Button>
        </div>

        {loadedTemplate.exercises.length === 0 ? (
          <Card>
            <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
                <Dumbbell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  No exercises in this routine yet
                </h2>
                <p className="text-sm text-muted-foreground">
                  Add lifts from the shared library or create your own custom
                  movements.
                </p>
              </div>
              <Button type="button" onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                <span>Add exercise</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {loadedTemplate.exercises.map((item, index) => (
              <TemplateExerciseRow
                key={item._id}
                item={item}
                index={index}
                totalCount={loadedTemplate.exercises.length}
                reordering={reordering}
                removing={removingExerciseId === item._id}
                onMoveUp={() => {
                  void handleReorderExercise(index, index - 1);
                }}
                onMoveDown={() => {
                  void handleReorderExercise(index, index + 1);
                }}
                onRemove={() => {
                  void handleRemoveExercise(item._id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templateId={loadedTemplate._id}
        existingExerciseIds={existingExerciseIds}
      />

      <DeleteTemplateDialog
        template={
          deleteOpen
            ? { _id: loadedTemplate._id, title: loadedTemplate.title }
            : null
        }
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          setDeletedRedirecting(true);
          router.replace("/templates");
        }}
      />
    </div>
  );
}

export default function TemplateDetailPage() {
  const params = useParams<{ templateId?: string | string[] }>();
  const rawTemplateId = params.templateId;
  const templateId = Array.isArray(rawTemplateId)
    ? (rawTemplateId[0] ?? "")
    : (rawTemplateId ?? "");

  return (
    <TemplateRouteErrorBoundary key={templateId}>
      <TemplateDetailContent templateId={templateId} />
    </TemplateRouteErrorBoundary>
  );
}
