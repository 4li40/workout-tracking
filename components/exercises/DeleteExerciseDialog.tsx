"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
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
import { api } from "@/convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { ExerciseListItem } from "./types";

interface DeleteExerciseDialogProps {
  readonly exercise: ExerciseListItem | null;
  readonly onOpenChange: (open: boolean) => void;
}

function DeleteExerciseBody({
  exercise,
  onClose,
}: {
  readonly exercise: ExerciseListItem;
  readonly onClose: () => void;
}) {
  const removeExercise = useMutation(api.exercises.remove);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await removeExercise({ exerciseId: exercise._id });
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not delete exercise. Please try again.",
        ),
      );
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes{" "}
        <span className="font-semibold text-foreground">{exercise.name}</span>,
        removes it from your saved routines, and deletes its sticky note.
        Exercises already logged in a workout cannot be deleted.
      </p>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={deleting}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={deleting}
          onClick={() => {
            void handleDelete();
          }}
        >
          {deleting ? "Deleting..." : "Delete exercise"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function DeleteExerciseDialog({
  exercise,
  onOpenChange,
}: DeleteExerciseDialogProps) {
  return (
    <Dialog
      open={exercise !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete custom exercise</DialogTitle>
          <DialogDescription>{exercise?.name}</DialogDescription>
        </DialogHeader>

        {exercise !== null && (
          <DeleteExerciseBody
            key={exercise._id}
            exercise={exercise}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
