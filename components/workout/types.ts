import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type WorkoutDetail = NonNullable<
  FunctionReturnType<typeof api.workouts.get>
>;
export type WorkoutExerciseDetail = WorkoutDetail["exercises"][number];
export type WorkoutSetDetail = WorkoutExerciseDetail["sets"][number];
export type WorkoutSourceTemplate = NonNullable<
  WorkoutDetail["sourceTemplate"]
>;
