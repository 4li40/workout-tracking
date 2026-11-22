import { v, type Infer } from "convex/values";

export const weightUnitValidator = v.union(v.literal("kg"), v.literal("lb"));
export type WeightUnit = Infer<typeof weightUnitValidator>;

export const muscleGroupValidator = v.union(
  v.literal("chest"),
  v.literal("back"),
  v.literal("shoulders"),
  v.literal("biceps"),
  v.literal("triceps"),
  v.literal("forearms"),
  v.literal("quads"),
  v.literal("hamstrings"),
  v.literal("glutes"),
  v.literal("calves"),
  v.literal("core"),
  v.literal("full_body"),
  v.literal("other"),
);
export type MuscleGroup = Infer<typeof muscleGroupValidator>;

export const equipmentValidator = v.union(
  v.literal("barbell"),
  v.literal("dumbbell"),
  v.literal("machine"),
  v.literal("cable"),
  v.literal("bodyweight"),
  v.literal("kettlebell"),
  v.literal("smith_machine"),
  v.literal("ez_bar"),
  v.literal("trap_bar"),
  v.literal("band"),
  v.literal("other"),
);
export type Equipment = Infer<typeof equipmentValidator>;

export const workoutStatusValidator = v.union(
  v.literal("in_progress"),
  v.literal("completed"),
);
export type WorkoutStatus = Infer<typeof workoutStatusValidator>;

export const setTypeValidator = v.union(
  v.literal("warmup"),
  v.literal("working"),
  v.literal("drop"),
  v.literal("failure"),
);
export type SetType = Infer<typeof setTypeValidator>;
