import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type WorkoutTemplateItem = FunctionReturnType<
  typeof api.templates.list
>[number];

export type TemplateExerciseItem = WorkoutTemplateItem["exercises"][number];
