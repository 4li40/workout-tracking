import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { ensureGlobalExercisesSeeded } from "./lib/globalExercises";

export const seedGlobalExercises = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    skipped: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    return await ensureGlobalExercisesSeeded(ctx);
  },
});
