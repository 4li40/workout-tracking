"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExercisePickerDialog } from "@/components/exercises/ExercisePickerDialog";
import type {
  DraftWorkoutExercise,
  DraftWorkoutSet,
  ExercisePickerTarget,
} from "@/components/history/types";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { WorkoutDetail } from "@/components/workout/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/convex/lib/exercises";
import {
  formatRestDuration,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  parseRestSeconds,
} from "@/convex/lib/settings";
import type { SetType, WeightUnit } from "@/convex/lib/validators";
import {
  formatWeightNumber,
  kgToDisplayWeight,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_NOTES_LENGTH,
  MAX_WORKOUT_SETS,
  MAX_WORKOUT_TITLE_LENGTH,
  parseRepsInputString,
  parseWeightInputString,
  parseWorkoutNotes,
  parseWorkoutTitle,
  SET_TYPE_META,
  SET_TYPE_ORDER,
  validateCompletedSet,
} from "@/convex/lib/workouts";
import { getConvexErrorMessage } from "@/lib/convexError";

const MAX_EDIT_DURATION_MINUTES = 1440;

export interface EditCompletedWorkoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly workout?: WorkoutDetail;
  readonly workoutId?: Id<"workouts">;
  readonly workoutTitle?: string;
  readonly unit: WeightUnit;
  readonly defaultRestSeconds: number;
  readonly onSaved?: () => void;
}

function toDateTimeLocalValue(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }
  const timestamp = new Date(trimmed).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return timestamp;
}

function buildInitialDraftExercises(
  workout: WorkoutDetail,
  unit: WeightUnit,
): DraftWorkoutExercise[] {
  return workout.exercises.map((exercise) => ({
    clientKey: `ex-${exercise._id}`,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    isBodyweight: exercise.isBodyweight,
    restSecondsInput: String(exercise.restSeconds),
    sets: exercise.sets.map((set) => ({
      clientKey: `set-${set._id}`,
      setType: set.setType,
      weightInput: formatWeightNumber(kgToDisplayWeight(set.weightKg, unit)),
      repsInput: String(set.reps),
    })),
  }));
}

function EditCompletedWorkoutForm({
  workout,
  unit,
  defaultRestSeconds,
  onClose,
  onSaved,
  onBusyChange,
}: {
  readonly workout: WorkoutDetail;
  readonly unit: WeightUnit;
  readonly defaultRestSeconds: number;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const updateCompletedWorkout = useMutation(
    api.workouts.updateCompletedWorkout,
  );
  const catalogExercises = useQuery(
    api.exercises.list,
    isAuthenticated ? {} : "skip",
  );

  const initialFinishedAt = Math.max(
    workout.startedAt,
    workout.finishedAt ?? workout.startedAt,
  );
  const initialStartedAtInput = toDateTimeLocalValue(workout.startedAt);
  const initialDurationMinutesInput = String(
    Math.round(Math.max(0, initialFinishedAt - workout.startedAt) / 60_000),
  );

  const nextKeyRef = useRef(0);
  const [title, setTitle] = useState(workout.title);
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [startedAtInput, setStartedAtInput] = useState(initialStartedAtInput);
  const [durationMinutesInput, setDurationMinutesInput] = useState(
    initialDurationMinutesInput,
  );
  const [exercises, setExercises] = useState<DraftWorkoutExercise[]>(() =>
    buildInitialDraftExercises(workout, unit),
  );
  const [pickerTarget, setPickerTarget] = useState<ExercisePickerTarget | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      onBusyChange(false);
    };
  }, [onBusyChange]);

  const exerciseById = useMemo(() => {
    const map = new Map<
      Id<"exercises">,
      NonNullable<typeof catalogExercises>[number]
    >();
    if (catalogExercises !== undefined) {
      for (const item of catalogExercises) {
        map.set(item._id, item);
      }
    }
    return map;
  }, [catalogExercises]);

  const existingExerciseIds = useMemo(
    () => new Set(exercises.map((item) => item.exerciseId)),
    [exercises],
  );

  const totalSetCount = useMemo(
    () => exercises.reduce((sum, item) => sum + item.sets.length, 0),
    [exercises],
  );

  const swappingExercise =
    pickerTarget?.kind === "swap"
      ? exercises.find((item) => item.clientKey === pickerTarget.exerciseKey)
      : undefined;

  function createClientKey(prefix: string): string {
    nextKeyRef.current += 1;
    return `${prefix}-draft-${nextKeyRef.current}`;
  }

  function handleMoveExercise(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= exercises.length) {
      return;
    }
    setExercises((previous) => {
      const next = [...previous];
      const current = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = current;
      return next;
    });
    setError(null);
  }

  function handleRemoveExercise(exerciseKey: string) {
    setExercises((previous) =>
      previous.filter((item) => item.clientKey !== exerciseKey),
    );
    setError(null);
  }

  function handleRestSecondsChange(exerciseKey: string, value: string) {
    setExercises((previous) =>
      previous.map((item) =>
        item.clientKey === exerciseKey
          ? { ...item, restSecondsInput: value }
          : item,
      ),
    );
    setError(null);
  }

  function handleAddSet(exerciseKey: string) {
    if (totalSetCount >= MAX_WORKOUT_SETS) {
      setError(`A workout can contain up to ${MAX_WORKOUT_SETS} sets.`);
      return;
    }
    setExercises((previous) =>
      previous.map((item) => {
        if (item.clientKey !== exerciseKey) {
          return item;
        }
        if (item.sets.length >= MAX_SETS_PER_EXERCISE) {
          return item;
        }
        const lastSet = item.sets[item.sets.length - 1];
        const nextSet: DraftWorkoutSet = {
          clientKey: createClientKey("set"),
          setType: lastSet?.setType ?? "working",
          weightInput: lastSet?.weightInput ?? (item.isBodyweight ? "0" : ""),
          repsInput: lastSet?.repsInput ?? "",
        };
        return {
          ...item,
          sets: [...item.sets, nextSet],
        };
      }),
    );
    setError(null);
  }

  function handleUpdateSet(
    exerciseKey: string,
    setKey: string,
    patch: Partial<
      Pick<DraftWorkoutSet, "setType" | "weightInput" | "repsInput">
    >,
  ) {
    setExercises((previous) =>
      previous.map((item) => {
        if (item.clientKey !== exerciseKey) {
          return item;
        }
        return {
          ...item,
          sets: item.sets.map((set) =>
            set.clientKey === setKey ? { ...set, ...patch } : set,
          ),
        };
      }),
    );
    setError(null);
  }

  function handleDeleteSet(exerciseKey: string, setKey: string) {
    setExercises((previous) =>
      previous.map((item) => {
        if (item.clientKey !== exerciseKey || item.sets.length <= 1) {
          return item;
        }
        return {
          ...item,
          sets: item.sets.filter((set) => set.clientKey !== setKey),
        };
      }),
    );
    setError(null);
  }

  async function handlePickerSelect(exerciseId: Id<"exercises">) {
    const selected = exerciseById.get(exerciseId);
    if (selected === undefined) {
      throw new Error("Could not load selected exercise. Please try again.");
    }

    if (pickerTarget?.kind === "swap") {
      const targetKey = pickerTarget.exerciseKey;
      setExercises((previous) =>
        previous.map((item) => {
          if (item.clientKey !== targetKey) {
            return item;
          }
          return {
            ...item,
            exerciseId: selected._id,
            exerciseName: selected.name,
            muscleGroup: selected.muscleGroup,
            equipment: selected.equipment,
            isBodyweight: selected.isBodyweight,
            sets: item.sets.map((set) => ({
              ...set,
              weightInput:
                selected.isBodyweight && set.weightInput.trim() === ""
                  ? "0"
                  : set.weightInput,
            })),
          };
        }),
      );
      setError(null);
      return;
    }

    if (exercises.length >= MAX_WORKOUT_EXERCISES) {
      throw new Error(
        `A workout can contain up to ${MAX_WORKOUT_EXERCISES} exercises.`,
      );
    }
    if (totalSetCount + 1 > MAX_WORKOUT_SETS) {
      throw new Error(`A workout can contain up to ${MAX_WORKOUT_SETS} sets.`);
    }

    const newExercise: DraftWorkoutExercise = {
      clientKey: createClientKey("ex"),
      exerciseId: selected._id,
      exerciseName: selected.name,
      muscleGroup: selected.muscleGroup,
      equipment: selected.equipment,
      isBodyweight: selected.isBodyweight,
      restSecondsInput: String(defaultRestSeconds),
      sets: [
        {
          clientKey: createClientKey("set"),
          setType: "working",
          weightInput: selected.isBodyweight ? "0" : "",
          repsInput: "",
        },
      ],
    };

    setExercises((previous) => [...previous, newExercise]);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
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

    let resolvedStartedAt = workout.startedAt;
    let resolvedFinishedAt = initialFinishedAt;

    if (
      startedAtInput !== initialStartedAtInput ||
      durationMinutesInput !== initialDurationMinutesInput
    ) {
      const parsedStart = parseDateTimeLocalValue(startedAtInput);
      if (parsedStart === null) {
        setError("Enter a valid workout start date and time.");
        return;
      }

      const trimmedDuration = durationMinutesInput.trim();
      if (!/^\d+$/.test(trimmedDuration)) {
        setError("Duration must be a whole number of minutes.");
        return;
      }

      const durationMinutes = Number(trimmedDuration);
      if (
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes < 0 ||
        durationMinutes > MAX_EDIT_DURATION_MINUTES
      ) {
        setError(
          `Duration must be between 0 and ${MAX_EDIT_DURATION_MINUTES} minutes.`,
        );
        return;
      }

      resolvedStartedAt = parsedStart;
      resolvedFinishedAt = parsedStart + durationMinutes * 60_000;
    }

    if (exercises.length === 0) {
      setError("A completed workout must include at least one exercise.");
      return;
    }

    if (exercises.length > MAX_WORKOUT_EXERCISES) {
      setError(
        `A workout can contain up to ${MAX_WORKOUT_EXERCISES} exercises.`,
      );
      return;
    }

    let runningSetCount = 0;
    const payloadExercises: Array<{
      exerciseId: Id<"exercises">;
      restSeconds: number;
      sets: Array<{
        setType: SetType;
        weightKg: number;
        enteredUnit: WeightUnit;
        reps: number;
      }>;
    }> = [];

    for (const exercise of exercises) {
      if (exercise.sets.length === 0) {
        setError(`${exercise.exerciseName}: Add at least one set.`);
        return;
      }

      if (exercise.sets.length > MAX_SETS_PER_EXERCISE) {
        setError(
          `${exercise.exerciseName}: An exercise can have up to ${MAX_SETS_PER_EXERCISE} sets.`,
        );
        return;
      }

      runningSetCount += exercise.sets.length;
      if (runningSetCount > MAX_WORKOUT_SETS) {
        setError(`A workout can contain up to ${MAX_WORKOUT_SETS} sets.`);
        return;
      }

      const restTrimmed = exercise.restSecondsInput.trim();
      if (!/^\d+$/.test(restTrimmed)) {
        setError(
          `${exercise.exerciseName}: Rest timer must be a whole number of seconds.`,
        );
        return;
      }

      const parsedRest = parseRestSeconds(Number(restTrimmed));
      if (parsedRest.kind === "error") {
        setError(`${exercise.exerciseName}: ${parsedRest.message}`);
        return;
      }

      const validatedSets: Array<{
        setType: SetType;
        weightKg: number;
        enteredUnit: WeightUnit;
        reps: number;
      }> = [];

      for (const [setIndex, set] of exercise.sets.entries()) {
        const setLabel = `${exercise.exerciseName}, Set ${setIndex + 1}`;
        const parsedWeight = parseWeightInputString(set.weightInput, unit);
        if (parsedWeight.kind === "error") {
          setError(`${setLabel}: ${parsedWeight.message}`);
          return;
        }

        const parsedReps = parseRepsInputString(set.repsInput);
        if (parsedReps.kind === "error") {
          setError(`${setLabel}: ${parsedReps.message}`);
          return;
        }

        const completedCheck = validateCompletedSet({
          weightKg: parsedWeight.weightKg,
          reps: parsedReps.reps,
          isBodyweight: exercise.isBodyweight,
        });
        if (completedCheck.kind === "error") {
          const message =
            parsedReps.reps < 1
              ? "Enter at least 1 rep."
              : `Enter a weight above 0 ${unit}.`;
          setError(`${setLabel}: ${message}`);
          return;
        }

        validatedSets.push({
          setType: set.setType,
          weightKg: parsedWeight.weightKg,
          enteredUnit: unit,
          reps: parsedReps.reps,
        });
      }

      payloadExercises.push({
        exerciseId: exercise.exerciseId,
        restSeconds: parsedRest.seconds,
        sets: validatedSets,
      });
    }

    setSaving(true);
    onBusyChange(true);
    setError(null);
    try {
      await updateCompletedWorkout({
        workoutId: workout._id,
        title: parsedTitle.title,
        ...(parsedNotes.notes !== undefined
          ? { notes: parsedNotes.notes }
          : {}),
        startedAt: resolvedStartedAt,
        finishedAt: resolvedFinishedAt,
        exercises: payloadExercises,
      });
      onSaved?.();
      onBusyChange(false);
      onClose();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not save workout changes. Please try again.",
        ),
      );
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-5"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-workout-title">Workout title</Label>
            <Input
              id="edit-workout-title"
              value={title}
              maxLength={MAX_WORKOUT_TITLE_LENGTH}
              disabled={saving}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder="e.g. Upper Body Push"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-workout-started-at">
                Date &amp; start time
              </Label>
              <Input
                id="edit-workout-started-at"
                type="datetime-local"
                value={startedAtInput}
                disabled={saving}
                onChange={(event) => {
                  setStartedAtInput(event.target.value);
                  setError(null);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-workout-duration">Duration (minutes)</Label>
              <Input
                id="edit-workout-duration"
                type="number"
                min={0}
                max={MAX_EDIT_DURATION_MINUTES}
                step={1}
                inputMode="numeric"
                value={durationMinutesInput}
                disabled={saving}
                className="tabular-nums"
                onChange={(event) => {
                  setDurationMinutesInput(event.target.value);
                  setError(null);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-workout-notes">Session notes</Label>
            <Textarea
              id="edit-workout-notes"
              value={notes}
              maxLength={MAX_WORKOUT_NOTES_LENGTH}
              disabled={saving}
              onChange={(event) => {
                setNotes(event.target.value);
                setError(null);
              }}
              placeholder="Optional notes about how the session felt..."
              className="min-h-20"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">
                Exercises{" "}
                <span className="text-muted-foreground tabular-nums">
                  ({exercises.length})
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Add, swap, reorder, or adjust logged sets.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || exercises.length >= MAX_WORKOUT_EXERCISES}
              onClick={() => setPickerTarget({ kind: "add" })}
            >
              <Plus className="size-4 text-primary" aria-hidden="true" />
              <span>Add exercise</span>
            </Button>
          </div>

          {exercises.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">
                No exercises in this workout
              </p>
              <p className="text-xs text-muted-foreground">
                Add at least one exercise with a completed set to save changes.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {exercises.map((exercise, exerciseIndex) => {
                const parsedRestPreview = /^\d+$/.test(
                  exercise.restSecondsInput.trim(),
                )
                  ? parseRestSeconds(Number(exercise.restSecondsInput.trim()))
                  : null;

                return (
                  <div
                    key={exercise.clientKey}
                    className="rounded-xl border border-border bg-secondary/25 p-3.5 sm:p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="accent" className="tabular-nums">
                            #{exerciseIndex + 1}
                          </Badge>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {exercise.exerciseName}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">
                            {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
                          </Badge>
                          <Badge variant="secondary">
                            {EQUIPMENT_LABELS[exercise.equipment]}
                          </Badge>
                          {exercise.isBodyweight && (
                            <Badge variant="accent">Bodyweight</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={saving || exerciseIndex === 0}
                          aria-label={`Move ${exercise.exerciseName} up`}
                          onClick={() => handleMoveExercise(exerciseIndex, -1)}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            saving || exerciseIndex === exercises.length - 1
                          }
                          aria-label={`Move ${exercise.exerciseName} down`}
                          onClick={() => handleMoveExercise(exerciseIndex, 1)}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          aria-label={`Swap ${exercise.exerciseName}`}
                          onClick={() =>
                            setPickerTarget({
                              kind: "swap",
                              exerciseKey: exercise.clientKey,
                            })
                          }
                        >
                          <ArrowLeftRight
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          aria-label={`Remove ${exercise.exerciseName}`}
                          className="text-muted-foreground hover:bg-destructive-tint hover:text-destructive"
                          onClick={() =>
                            handleRemoveExercise(exercise.clientKey)
                          }
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <Label
                        htmlFor={`rest-${exercise.clientKey}`}
                        className="text-xs text-muted-foreground"
                      >
                        Rest timer (sec)
                      </Label>
                      <Input
                        id={`rest-${exercise.clientKey}`}
                        type="number"
                        min={MIN_REST_SECONDS}
                        max={MAX_REST_SECONDS}
                        step={15}
                        inputMode="numeric"
                        value={exercise.restSecondsInput}
                        disabled={saving}
                        className="w-24 tabular-nums"
                        onChange={(event) =>
                          handleRestSecondsChange(
                            exercise.clientKey,
                            event.target.value,
                          )
                        }
                      />
                      {parsedRestPreview?.kind === "ok" && (
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {formatRestDuration(parsedRestPreview.seconds)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="hidden sm:grid sm:grid-cols-[2.25rem_8.5rem_1fr_1fr_2.75rem] sm:items-center sm:gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Set</span>
                        <span>Type</span>
                        <span>
                          {exercise.isBodyweight
                            ? `Added (${unit})`
                            : `Weight (${unit})`}
                        </span>
                        <span>Reps</span>
                        <span className="sr-only">Delete</span>
                      </div>

                      {exercise.sets.map((set, setIndex) => (
                        <div
                          key={set.clientKey}
                          className="grid grid-cols-2 gap-2 rounded-xl border border-border/80 bg-card p-2.5 sm:grid-cols-[2.25rem_8.5rem_1fr_1fr_2.75rem] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
                        >
                          <div className="flex items-center justify-between col-span-2 sm:col-span-1">
                            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                              #{setIndex + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={saving || exercise.sets.length <= 1}
                              aria-label={`Delete set ${setIndex + 1} of ${exercise.exerciseName}`}
                              className="sm:hidden text-muted-foreground hover:bg-destructive-tint hover:text-destructive"
                              onClick={() =>
                                handleDeleteSet(
                                  exercise.clientKey,
                                  set.clientKey,
                                )
                              }
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>

                          <div className="col-span-2 sm:col-span-1">
                            <NativeSelect
                              aria-label={`Set ${setIndex + 1} type for ${exercise.exerciseName}`}
                              value={set.setType}
                              disabled={saving}
                              onChange={(event) => {
                                const nextType = SET_TYPE_ORDER.find(
                                  (option) => option === event.target.value,
                                );
                                if (nextType !== undefined) {
                                  handleUpdateSet(
                                    exercise.clientKey,
                                    set.clientKey,
                                    { setType: nextType },
                                  );
                                }
                              }}
                            >
                              {SET_TYPE_ORDER.map((typeOption) => (
                                <option key={typeOption} value={typeOption}>
                                  {SET_TYPE_META[typeOption].label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>

                          <div className="space-y-1 sm:space-y-0">
                            <span className="block text-[11px] font-medium text-muted-foreground sm:hidden">
                              {exercise.isBodyweight
                                ? `Added (${unit})`
                                : `Weight (${unit})`}
                            </span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Set ${setIndex + 1} ${exercise.isBodyweight ? "added weight" : "weight"} in ${unit} for ${exercise.exerciseName}`}
                              value={set.weightInput}
                              disabled={saving}
                              placeholder={exercise.isBodyweight ? "0" : unit}
                              className="tabular-nums"
                              onChange={(event) =>
                                handleUpdateSet(
                                  exercise.clientKey,
                                  set.clientKey,
                                  { weightInput: event.target.value },
                                )
                              }
                            />
                          </div>

                          <div className="space-y-1 sm:space-y-0">
                            <span className="block text-[11px] font-medium text-muted-foreground sm:hidden">
                              Reps
                            </span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Set ${setIndex + 1} reps for ${exercise.exerciseName}`}
                              value={set.repsInput}
                              disabled={saving}
                              placeholder="Reps"
                              className="tabular-nums"
                              onChange={(event) =>
                                handleUpdateSet(
                                  exercise.clientKey,
                                  set.clientKey,
                                  { repsInput: event.target.value },
                                )
                              }
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={saving || exercise.sets.length <= 1}
                            aria-label={`Delete set ${setIndex + 1} of ${exercise.exerciseName}`}
                            className="hidden sm:inline-flex text-muted-foreground hover:bg-destructive-tint hover:text-destructive"
                            onClick={() =>
                              handleDeleteSet(exercise.clientKey, set.clientKey)
                            }
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          saving ||
                          exercise.sets.length >= MAX_SETS_PER_EXERCISE ||
                          totalSetCount >= MAX_WORKOUT_SETS
                        }
                        onClick={() => handleAddSet(exercise.clientKey)}
                        className="w-full sm:w-auto"
                      >
                        <Plus
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        <span>Add set</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-tint/60 px-3.5 py-2.5 text-xs text-foreground">
          <Trophy
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p>
            Saving changes automatically recalculates personal records for all
            affected exercises.
          </p>
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
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving changes..." : "Save changes"}
          </Button>
        </DialogFooter>
      </form>

      <ExercisePickerDialog
        open={pickerTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPickerTarget(null);
          }
        }}
        mode={pickerTarget?.kind === "swap" ? "single" : "multi"}
        resetKey={
          pickerTarget === null
            ? "closed"
            : pickerTarget.kind === "swap"
              ? `swap-${pickerTarget.exerciseKey}`
              : "add"
        }
        title={
          pickerTarget?.kind === "swap"
            ? "Swap exercise"
            : "Add exercise to workout"
        }
        description={
          pickerTarget?.kind === "swap"
            ? `Choose a replacement for ${swappingExercise?.exerciseName ?? "this exercise"}.`
            : "Select one or more exercises to include in this completed session."
        }
        actionLabel={pickerTarget?.kind === "swap" ? "Swap" : "Add"}
        busyActionLabel={
          pickerTarget?.kind === "swap" ? "Swapping..." : "Adding..."
        }
        existingLabel="In workout"
        existingExerciseIds={existingExerciseIds}
        excludeExerciseId={swappingExercise?.exerciseId}
        onSelectExercise={handlePickerSelect}
        errorFallback={
          pickerTarget?.kind === "swap"
            ? "Could not swap exercise."
            : "Could not add exercise."
        }
      />
    </>
  );
}

function EditCompletedWorkoutLoader({
  workout,
  workoutId,
  unit,
  defaultRestSeconds,
  onClose,
  onSaved,
  onBusyChange,
}: {
  readonly workout?: WorkoutDetail;
  readonly workoutId?: Id<"workouts">;
  readonly unit: WeightUnit;
  readonly defaultRestSeconds: number;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const queriedWorkout = useQuery(
    api.workouts.get,
    workout === undefined && workoutId !== undefined && isAuthenticated
      ? { workoutId }
      : "skip",
  );

  const resolvedWorkout = workout ?? queriedWorkout;

  if (resolvedWorkout === undefined) {
    return (
      <div
        className="space-y-4"
        aria-busy="true"
        aria-label="Loading workout details"
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="rounded-xl border border-border p-4 space-y-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (resolvedWorkout === null) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            This workout could not be found. It may have been deleted.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (resolvedWorkout.status !== "completed") {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Only completed workouts can be edited here.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <EditCompletedWorkoutForm
      key={resolvedWorkout._id}
      workout={resolvedWorkout}
      unit={unit}
      defaultRestSeconds={defaultRestSeconds}
      onClose={onClose}
      onSaved={onSaved}
      onBusyChange={onBusyChange}
    />
  );
}

export function EditCompletedWorkoutDialog({
  open,
  onOpenChange,
  workout,
  workoutId,
  workoutTitle,
  unit,
  defaultRestSeconds,
  onSaved,
}: EditCompletedWorkoutDialogProps) {
  const [busy, setBusy] = useState(false);
  const resolvedTitle = workout?.title ?? workoutTitle ?? "Completed session";
  const loaderKey = workout?._id ?? workoutId ?? "empty";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent closeDisabled={busy} className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit completed workout</DialogTitle>
          <DialogDescription>{resolvedTitle}</DialogDescription>
        </DialogHeader>

        {open && (
          <EditCompletedWorkoutLoader
            key={loaderKey}
            workout={workout}
            workoutId={workoutId}
            unit={unit}
            defaultRestSeconds={defaultRestSeconds}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
