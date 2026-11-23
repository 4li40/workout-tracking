"use client";

import { useMutation } from "convex/react";
import { Check, RefreshCw } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { formatElapsedDuration } from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";
import {
  computeWorkoutVolumeSummary,
  formatTemplateDiffHighlights,
  formatWeightFromKg,
  MAX_WORKOUT_NOTES_LENGTH,
  MAX_WORKOUT_TITLE_LENGTH,
  parseWorkoutNotes,
  parseWorkoutTitle,
} from "@/convex/lib/workouts";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { LocalSetDraft } from "@/lib/workoutDraftStorage";
import type { WorkoutDetail } from "./types";

interface FinishWorkoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workout: WorkoutDetail;
  readonly recoveredSetDrafts: Readonly<Record<string, LocalSetDraft>>;
  readonly initialTitle: string;
  readonly initialNotes: string;
  readonly unit: WeightUnit;
  readonly onSyncPendingSetDrafts: () => Promise<void>;
  readonly onFinished: () => void;
}

function FinishWorkoutBody({
  workout,
  recoveredSetDrafts,
  initialTitle,
  initialNotes,
  unit,
  onSyncPendingSetDrafts,
  onClose,
  onFinished,
  onBusyChange,
}: {
  readonly workout: WorkoutDetail;
  readonly recoveredSetDrafts: Readonly<Record<string, LocalSetDraft>>;
  readonly initialTitle: string;
  readonly initialNotes: string;
  readonly unit: WeightUnit;
  readonly onSyncPendingSetDrafts: () => Promise<void>;
  readonly onClose: () => void;
  readonly onFinished: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const finishWorkout = useMutation(api.workouts.finishWorkout);
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [updateTemplate, setUpdateTemplate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const titleInputId = useId();
  const notesInputId = useId();
  const templateSyncSwitchId = useId();

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  const effectiveExercises = workout.exercises.map((exercise) => ({
    isBodyweight: exercise.isBodyweight,
    sets: exercise.sets.map((setDoc) => {
      const draft = recoveredSetDrafts[setDoc._id];
      if (draft === undefined) {
        return setDoc;
      }
      return {
        ...setDoc,
        setType: draft.setType,
        weightKg: draft.weightKg,
        enteredUnit: draft.enteredUnit,
        reps: draft.reps,
        completed: draft.completed,
      };
    }),
  }));

  const pendingSetDraftCount = Object.keys(recoveredSetDrafts).length;
  const summary = computeWorkoutVolumeSummary(effectiveExercises);
  const uncheckedCount = summary.totalSets - summary.completedSets;
  const sourceTemplate = workout.sourceTemplate;
  const showTemplateSync =
    sourceTemplate !== null && sourceTemplate.diff.hasStructuralChanges;
  const diffHighlights = showTemplateSync
    ? formatTemplateDiffHighlights(sourceTemplate.diff)
    : [];

  const volumeDisplay =
    summary.workingVolumeKg > 0
      ? `${formatWeightFromKg(summary.workingVolumeKg, unit)} ${unit}`
      : summary.bodyweightWorkingReps > 0
        ? `${summary.bodyweightWorkingReps} BW reps`
        : `0 ${unit}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || summary.completedSets === 0) {
      return;
    }

    const parsedTitle = parseWorkoutTitle(title);
    if (parsedTitle.kind === "error") {
      setError(parsedTitle.message);
      return;
    }

    const parsedNotes = parseWorkoutNotes(notes);
    if (parsedNotes.kind === "error") {
      setError(parsedNotes.message);
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    setError(null);
    try {
      if (pendingSetDraftCount > 0) {
        await onSyncPendingSetDrafts();
      }
      await finishWorkout({
        workoutId: workout._id,
        title: parsedTitle.title,
        notes: parsedNotes.notes ?? "",
        updateTemplate: showTemplateSync ? updateTemplate : false,
      });
      onFinished();
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not finish workout. Please try again.",
        ),
      );
      setSubmitting(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/50 p-3 text-center">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Duration
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {formatElapsedDuration(openedAt - workout.startedAt)}
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
            {volumeDisplay}
          </p>
        </div>
      </div>

      {pendingSetDraftCount > 0 && (
        <Alert>
          <AlertDescription>
            {pendingSetDraftCount} unsynced local{" "}
            {pendingSetDraftCount === 1 ? "set" : "sets"} will sync before
            saving this workout.
          </AlertDescription>
        </Alert>
      )}

      {summary.completedSets === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            Check off at least one set before finishing this workout.
          </AlertDescription>
        </Alert>
      ) : (
        uncheckedCount > 0 && (
          <Alert>
            <AlertDescription>
              {uncheckedCount} unchecked {uncheckedCount === 1 ? "set" : "sets"}{" "}
              will be removed when the session is saved.
            </AlertDescription>
          </Alert>
        )
      )}

      <div className="space-y-2">
        <Label htmlFor={titleInputId}>Workout title</Label>
        <Input
          id={titleInputId}
          value={title}
          maxLength={MAX_WORKOUT_TITLE_LENGTH}
          disabled={submitting}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={notesInputId}>Session notes (optional)</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {notes.trim().length} / {MAX_WORKOUT_NOTES_LENGTH}
          </span>
        </div>
        <Textarea
          id={notesInputId}
          rows={3}
          maxLength={MAX_WORKOUT_NOTES_LENGTH}
          value={notes}
          disabled={submitting}
          placeholder="How did the session feel? Any fatigue or equipment notes..."
          onChange={(event) => {
            setNotes(event.target.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
      </div>

      {showTemplateSync && (
        <div className="rounded-xl border border-primary/25 bg-accent/50 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <Label
              htmlFor={templateSyncSwitchId}
              className="flex flex-1 cursor-pointer flex-col items-start gap-1 font-normal"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <RefreshCw
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                Update template with today&apos;s changes
              </span>
              <span className="text-xs text-muted-foreground">
                Sync exercise order, set counts, and rest timers back to{" "}
                <span className="font-medium text-foreground">
                  {sourceTemplate.title}
                </span>
                .
              </span>
            </Label>
            <Switch
              id={templateSyncSwitchId}
              checked={updateTemplate}
              disabled={submitting}
              onCheckedChange={setUpdateTemplate}
            />
          </div>

          {diffHighlights.length > 0 && (
            <ul className="space-y-1 border-t border-primary/15 pt-2 text-xs text-foreground">
              {diffHighlights.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onClose}
        >
          Keep training
        </Button>
        <Button
          type="submit"
          disabled={submitting || summary.completedSets === 0}
        >
          <Check className="size-4" aria-hidden="true" />
          <span>{submitting ? "Saving..." : "Finish workout"}</span>
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FinishWorkoutDialog({
  open,
  onOpenChange,
  workout,
  recoveredSetDrafts,
  initialTitle,
  initialNotes,
  unit,
  onSyncPendingSetDrafts,
  onFinished,
}: FinishWorkoutDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>Finish workout</DialogTitle>
          <DialogDescription>
            Review your completed sets and save this training session.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <FinishWorkoutBody
            key={workout._id}
            workout={workout}
            recoveredSetDrafts={recoveredSetDrafts}
            initialTitle={initialTitle}
            initialNotes={initialNotes}
            unit={unit}
            onSyncPendingSetDrafts={onSyncPendingSetDrafts}
            onClose={() => onOpenChange(false)}
            onFinished={onFinished}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
