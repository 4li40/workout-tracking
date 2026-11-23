"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
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

interface DiscardWorkoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workoutId: Id<"workouts">;
  readonly workoutTitle: string;
  readonly onDiscarded: () => void;
}

function DiscardWorkoutBody({
  workoutId,
  onClose,
  onDiscarded,
  onBusyChange,
}: {
  readonly workoutId: Id<"workouts">;
  readonly onClose: () => void;
  readonly onDiscarded: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const discardWorkout = useMutation(api.workouts.discardWorkout);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function handleConfirmDiscard() {
    if (discarding) {
      return;
    }

    setDiscarding(true);
    onBusyChange(true);
    setError(null);
    try {
      await discardWorkout({ workoutId });
      onDiscarded();
      onBusyChange(false);
      onClose();
      router.replace("/workouts");
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not discard workout. Please try again.",
        ),
      );
      setDiscarding(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This permanently deletes this active session and every set logged in it.
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
          disabled={discarding}
          onClick={onClose}
        >
          Keep training
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={discarding}
          onClick={() => {
            void handleConfirmDiscard();
          }}
        >
          {discarding ? "Discarding..." : "Discard workout"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function DiscardWorkoutDialog({
  open,
  onOpenChange,
  workoutId,
  workoutTitle,
  onDiscarded,
}: DiscardWorkoutDialogProps) {
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
          <DialogTitle>Discard active workout</DialogTitle>
          <DialogDescription>{workoutTitle}</DialogDescription>
        </DialogHeader>

        {open && (
          <DiscardWorkoutBody
            key={workoutId}
            workoutId={workoutId}
            onClose={() => onOpenChange(false)}
            onDiscarded={onDiscarded}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
