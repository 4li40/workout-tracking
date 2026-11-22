"use client";

import { useMutation } from "convex/react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EQUIPMENT_OPTIONS,
  MAX_EXERCISE_NAME_LENGTH,
  MUSCLE_GROUP_OPTIONS,
  parseExerciseName,
} from "@/convex/lib/exercises";
import type { Equipment, MuscleGroup } from "@/convex/lib/validators";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { ExerciseListItem } from "./types";

export type ExerciseFormMode =
  | { readonly kind: "create" }
  | { readonly kind: "edit"; readonly exercise: ExerciseListItem };

interface ExerciseFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: ExerciseFormMode;
  readonly onCreated?: (exerciseId: Id<"exercises">) => void;
}

function ExerciseFormBody({
  mode,
  onClose,
  onCreated,
  onBusyChange,
}: {
  readonly mode: ExerciseFormMode;
  readonly onClose: () => void;
  readonly onCreated?: (exerciseId: Id<"exercises">) => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const createExercise = useMutation(api.exercises.create);
  const updateExercise = useMutation(api.exercises.update);

  const initialExercise = mode.kind === "edit" ? mode.exercise : null;
  const [name, setName] = useState(initialExercise?.name ?? "");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(
    initialExercise?.muscleGroup ?? "chest",
  );
  const [equipment, setEquipment] = useState<Equipment>(
    initialExercise?.equipment ?? "barbell",
  );
  const [isBodyweight, setIsBodyweight] = useState(
    initialExercise?.isBodyweight ?? false,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const muscleId = useId();
  const equipmentId = useId();
  const bodyweightId = useId();

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const parsed = parseExerciseName(name);
    if (parsed.kind === "error") {
      setError(parsed.message);
      return;
    }

    setSubmitting(true);
    onBusyChange(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        const exerciseId = await createExercise({
          name: parsed.name,
          muscleGroup,
          equipment,
          isBodyweight,
        });
        onCreated?.(exerciseId);
      } else {
        await updateExercise({
          exerciseId: mode.exercise._id,
          name: parsed.name,
          muscleGroup,
          equipment,
          isBodyweight,
        });
      }
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          mode.kind === "create"
            ? "Could not create exercise. Please try again."
            : "Could not save exercise. Please try again.",
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
      <div className="space-y-2">
        <Label htmlFor={nameId}>Exercise name</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={MAX_EXERCISE_NAME_LENGTH}
          placeholder="e.g. Weighted Ring Dip"
          disabled={submitting}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            if (error !== null) {
              setError(null);
            }
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={muscleId}>Muscle group</Label>
          <NativeSelect
            id={muscleId}
            value={muscleGroup}
            disabled={submitting}
            onChange={(event) => {
              const next = MUSCLE_GROUP_OPTIONS.find(
                (option) => option.value === event.target.value,
              );
              if (next !== undefined) {
                setMuscleGroup(next.value);
              }
            }}
          >
            {MUSCLE_GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor={equipmentId}>Equipment</Label>
          <NativeSelect
            id={equipmentId}
            value={equipment}
            disabled={submitting}
            onChange={(event) => {
              const next = EQUIPMENT_OPTIONS.find(
                (option) => option.value === event.target.value,
              );
              if (next !== undefined) {
                setEquipment(next.value);
              }
            }}
          >
            {EQUIPMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/60 px-4 py-3">
        <Label
          htmlFor={bodyweightId}
          className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal"
        >
          <span className="block text-sm font-medium text-foreground">
            Bodyweight movement
          </span>
          <span className="block text-xs text-muted-foreground">
            Allows 0 weight for bodyweight-only sets or added external load.
          </span>
        </Label>
        <Switch
          id={bodyweightId}
          checked={isBodyweight}
          disabled={submitting}
          onCheckedChange={setIsBodyweight}
        />
      </div>

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
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? mode.kind === "create"
              ? "Creating..."
              : "Saving..."
            : mode.kind === "create"
              ? "Create exercise"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ExerciseFormDialog({
  open,
  onOpenChange,
  mode,
  onCreated,
}: ExerciseFormDialogProps) {
  const [busy, setBusy] = useState(false);

  const formKey = !open
    ? "closed"
    : mode.kind === "edit"
      ? `edit-${mode.exercise._id}`
      : "create";

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
          <DialogTitle>
            {mode.kind === "create"
              ? "New custom exercise"
              : "Edit custom exercise"}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "create"
              ? "Custom exercises are private to your account and available in your routines."
              : "Changes update this custom movement across your routines."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <ExerciseFormBody
            key={formKey}
            mode={mode}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
