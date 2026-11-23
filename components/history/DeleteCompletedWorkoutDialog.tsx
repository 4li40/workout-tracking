"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
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
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexErrorMessage } from "@/lib/convexError";

export interface DeleteCompletedWorkoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workoutId: Id<"workouts">;
  readonly workoutTitle: string;
  readonly onDeletingChange?: (deleting: boolean) => void;
  readonly onDeleted?: () => void;
}

function DeleteCompletedWorkoutBody({
  workoutId,
  onClose,
  onDeletingChange,
  onDeleted,
  onBusyChange,
}: {
  readonly workoutId: Id<"workouts">;
  readonly onClose: () => void;
  readonly onDeletingChange?: (deleting: boolean) => void;
  readonly onDeleted?: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const deleteCompletedWorkout = useMutation(
    api.workouts.deleteCompletedWorkout,
  );
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function handleConfirmDelete() {
    if (deleting) {
      return;
    }

    setDeleting(true);
    onBusyChange(true);
    onDeletingChange?.(true);
    setError(null);
    try {
      await deleteCompletedWorkout({ workoutId });
      onDeleted?.();
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not delete workout. Please try again.",
        ),
      );
      setDeleting(false);
      onBusyChange(false);
      onDeletingChange?.(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes this completed session and all of its logged
        sets. Personal records for affected exercises will be recalculated
        automatically.
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
            void handleConfirmDelete();
          }}
        >
          {deleting ? "Deleting..." : "Delete workout"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function DeleteCompletedWorkoutDialog({
  open,
  onOpenChange,
  workoutId,
  workoutTitle,
  onDeletingChange,
  onDeleted,
}: DeleteCompletedWorkoutDialogProps) {
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
          <DialogTitle>Delete completed workout</DialogTitle>
          <DialogDescription>{workoutTitle}</DialogDescription>
        </DialogHeader>

        {open && (
          <DeleteCompletedWorkoutBody
            key={workoutId}
            workoutId={workoutId}
            onClose={() => onOpenChange(false)}
            onDeletingChange={onDeletingChange}
            onDeleted={onDeleted}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
