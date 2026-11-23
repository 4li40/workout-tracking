import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Equipment, MuscleGroup, SetType } from "@/convex/lib/validators";

export type HistoryWorkoutSummary = FunctionReturnType<
  typeof api.history.list
>[number];

export interface DraftWorkoutSet {
  readonly clientKey: string;
  readonly setType: SetType;
  readonly weightInput: string;
  readonly repsInput: string;
}

export interface DraftWorkoutExercise {
  readonly clientKey: string;
  readonly exerciseId: Id<"exercises">;
  readonly exerciseName: string;
  readonly muscleGroup: MuscleGroup;
  readonly equipment: Equipment;
  readonly isBodyweight: boolean;
  readonly restSecondsInput: string;
  readonly sets: readonly DraftWorkoutSet[];
}

export type ExercisePickerTarget =
  | { readonly kind: "add" }
  | { readonly kind: "swap"; readonly exerciseKey: string };
