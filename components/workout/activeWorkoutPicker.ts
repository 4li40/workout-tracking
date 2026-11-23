import type { Id } from "@/convex/_generated/dataModel";

export type ActiveWorkoutPickerTarget =
  | { readonly kind: "add" }
  | {
      readonly kind: "swap";
      readonly workoutExerciseId: Id<"workoutExercises">;
      readonly currentExerciseId: Id<"exercises">;
      readonly currentExerciseName: string;
    };

export interface ActiveWorkoutPickerConfig {
  readonly mode: "multi" | "single";
  readonly resetKey: string;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly busyActionLabel: string;
  readonly excludeExerciseId: Id<"exercises"> | undefined;
  readonly errorFallback: string;
}

export function getActiveWorkoutPickerConfig(
  target: ActiveWorkoutPickerTarget,
  workoutId: Id<"workouts">,
): ActiveWorkoutPickerConfig {
  if (target.kind === "swap") {
    return {
      mode: "single",
      resetKey: `swap-${target.workoutExerciseId}`,
      title: `Swap ${target.currentExerciseName}`,
      description:
        "Choose a replacement movement. Existing sets stay ready for the new lift.",
      actionLabel: "Swap",
      busyActionLabel: "Swapping...",
      excludeExerciseId: target.currentExerciseId,
      errorFallback: "Could not swap exercise. Please try again.",
    };
  }

  return {
    mode: "single",
    resetKey: `add-${workoutId}`,
    title: "Add exercise",
    description: "Choose an exercise to add to this workout.",
    actionLabel: "Add",
    busyActionLabel: "Adding...",
    excludeExerciseId: undefined,
    errorFallback: "Could not add exercise to workout. Please try again.",
  };
}
