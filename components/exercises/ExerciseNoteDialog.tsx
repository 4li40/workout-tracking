"use client";

import { useMutation } from "convex/react";
import { Lock } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  EQUIPMENT_LABELS,
  MAX_EXERCISE_NOTE_LENGTH,
  MUSCLE_GROUP_LABELS,
  parseExerciseNote,
} from "@/convex/lib/exercises";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { ExerciseListItem } from "./types";

interface ExerciseNoteDialogProps {
  readonly exercise: ExerciseListItem | null;
  readonly onOpenChange: (open: boolean) => void;
}

function ExerciseNoteForm({
  exercise,
  onClose,
  onBusyChange,
}: {
  readonly exercise: ExerciseListItem;
  readonly onClose: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const upsertNote = useMutation(api.exercises.upsertNote);
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaId = useId();
  const hasExistingNote =
    exercise.notes !== undefined && exercise.notes.trim().length > 0;
  const busy = saving || clearing;

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    const parsed = parseExerciseNote(notes);
    if (parsed.kind === "error") {
      setError(parsed.message);
      return;
    }

    setSaving(true);
    onBusyChange(true);
    setError(null);
    try {
      await upsertNote({
        exerciseId: exercise._id,
        notes: parsed.notes,
      });
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not save sticky note. Please try again.",
        ),
      );
      setSaving(false);
      onBusyChange(false);
    }
  }

  async function handleClear() {
    if (busy) {
      return;
    }

    setClearing(true);
    onBusyChange(true);
    setError(null);
    try {
      await upsertNote({
        exerciseId: exercise._id,
        notes: "",
      });
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not clear sticky note. Please try again.",
        ),
      );
      setClearing(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSave(event);
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
        </Badge>
        <Badge variant="secondary">
          {EQUIPMENT_LABELS[exercise.equipment]}
        </Badge>
        {exercise.isBodyweight && <Badge variant="accent">Bodyweight</Badge>}
        {exercise.isCustom && <Badge variant="outline">Custom</Badge>}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-accent/60 px-3.5 py-2.5 text-xs text-foreground">
        <Lock
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          Private to your account. Only you can view or edit your cues for this
          movement.
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={textareaId}>Sticky note</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {notes.trim().length} / {MAX_EXERCISE_NOTE_LENGTH}
          </span>
        </div>
        <Textarea
          id={textareaId}
          rows={4}
          maxLength={MAX_EXERCISE_NOTE_LENGTH}
          value={notes}
          disabled={busy}
          autoFocus
          placeholder="e.g. Seat pin 4, pause 1 second on chest, elbows at 45 degrees."
          onChange={(event) => {
            setNotes(event.target.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter className="sm:justify-between">
        <div>
          {hasExistingNote && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void handleClear();
              }}
              className="w-full text-destructive hover:bg-destructive-tint hover:text-destructive sm:w-auto"
            >
              {clearing ? "Clearing..." : "Clear note"}
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {saving ? "Saving..." : "Save note"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

export function ExerciseNoteDialog({
  exercise,
  onOpenChange,
}: ExerciseNoteDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={exercise !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>Private sticky note</DialogTitle>
          <DialogDescription>{exercise?.name}</DialogDescription>
        </DialogHeader>

        {exercise !== null && (
          <ExerciseNoteForm
            key={exercise._id}
            exercise={exercise}
            onClose={() => onOpenChange(false)}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
