import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  requireAuthUserId,
  requireEditableExercise,
  requireReadableExercise,
} from "./lib/auth";
import {
  GLOBAL_EXERCISES_LIST_LIMIT,
  MAX_CUSTOM_EXERCISES_PER_USER,
  normalizeExerciseNameKey,
  parseExerciseName,
  parseExerciseNote,
  USER_NOTES_LIST_LIMIT,
} from "./lib/exercises";
import { equipmentValidator, muscleGroupValidator } from "./lib/validators";

const exerciseListItemValidator = v.object({
  _id: v.id("exercises"),
  name: v.string(),
  muscleGroup: muscleGroupValidator,
  equipment: equipmentValidator,
  isBodyweight: v.boolean(),
  isCustom: v.boolean(),
  notes: v.optional(v.string()),
});

export const list = query({
  args: {},
  returns: v.array(exerciseListItemValidator),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const [globalExercises, customExercises, userNotes] = await Promise.all([
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", undefined))
        .take(GLOBAL_EXERCISES_LIST_LIMIT),
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(MAX_CUSTOM_EXERCISES_PER_USER),
      ctx.db
        .query("userExerciseNotes")
        .withIndex("by_user_exercise", (q) => q.eq("userId", userId))
        .take(USER_NOTES_LIST_LIMIT),
    ]);

    const notesByExerciseId = new Map<Id<"exercises">, string>();
    for (const noteDoc of userNotes) {
      notesByExerciseId.set(noteDoc.exerciseId, noteDoc.notes);
    }

    const combined: Doc<"exercises">[] = [
      ...globalExercises,
      ...customExercises,
    ];
    combined.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    return combined.map((exercise) => {
      const note = notesByExerciseId.get(exercise._id);
      return {
        _id: exercise._id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        isCustom: exercise.userId !== undefined,
        ...(note !== undefined ? { notes: note } : {}),
      };
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    muscleGroup: muscleGroupValidator,
    equipment: equipmentValidator,
    isBodyweight: v.boolean(),
  },
  returns: v.id("exercises"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const parsedName = parseExerciseName(args.name);
    if (parsedName.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedName.message,
      });
    }

    const existingCustom = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_CUSTOM_EXERCISES_PER_USER);

    if (existingCustom.length >= MAX_CUSTOM_EXERCISES_PER_USER) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `You can create up to ${MAX_CUSTOM_EXERCISES_PER_USER} custom exercises.`,
      });
    }

    const nameKey = normalizeExerciseNameKey(parsedName.name);
    if (
      existingCustom.some(
        (exercise) => normalizeExerciseNameKey(exercise.name) === nameKey,
      )
    ) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "You already have a custom exercise with that name.",
      });
    }

    return await ctx.db.insert("exercises", {
      userId,
      name: parsedName.name,
      muscleGroup: args.muscleGroup,
      equipment: args.equipment,
      isBodyweight: args.isBodyweight,
    });
  },
});

export const update = mutation({
  args: {
    exerciseId: v.id("exercises"),
    name: v.string(),
    muscleGroup: muscleGroupValidator,
    equipment: equipmentValidator,
    isBodyweight: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireEditableExercise(ctx, args.exerciseId, userId);

    const parsedName = parseExerciseName(args.name);
    if (parsedName.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedName.message,
      });
    }

    const existingCustom = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_CUSTOM_EXERCISES_PER_USER);

    const nameKey = normalizeExerciseNameKey(parsedName.name);
    if (
      existingCustom.some(
        (exercise) =>
          exercise._id !== args.exerciseId &&
          normalizeExerciseNameKey(exercise.name) === nameKey,
      )
    ) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "You already have a custom exercise with that name.",
      });
    }

    await ctx.db.patch("exercises", args.exerciseId, {
      name: parsedName.name,
      muscleGroup: args.muscleGroup,
      equipment: args.equipment,
      isBodyweight: args.isBodyweight,
    });

    return null;
  },
});

export const remove = mutation({
  args: {
    exerciseId: v.id("exercises"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireEditableExercise(ctx, args.exerciseId, userId);

    const [usedInWorkoutExercises, usedInSets] = await Promise.all([
      ctx.db
        .query("workoutExercises")
        .withIndex("by_user_exercise_completedAt", (q) =>
          q.eq("userId", userId).eq("exerciseId", args.exerciseId),
        )
        .take(1),
      ctx.db
        .query("sets")
        .withIndex("by_user_exercise_completedAt", (q) =>
          q.eq("userId", userId).eq("exerciseId", args.exerciseId),
        )
        .take(1),
    ]);

    if (usedInWorkoutExercises.length > 0 || usedInSets.length > 0) {
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "This exercise has been logged in a workout and cannot be deleted.",
      });
    }

    const affectedTemplateIds = new Set<Id<"workoutTemplates">>();
    for await (const row of ctx.db
      .query("templateExercises")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", args.exerciseId),
      )) {
      affectedTemplateIds.add(row.templateId);
      await ctx.db.delete("templateExercises", row._id);
    }

    for (const templateId of affectedTemplateIds) {
      let index = 0;
      for await (const row of ctx.db
        .query("templateExercises")
        .withIndex("by_template_order", (q) =>
          q.eq("templateId", templateId),
        )) {
        if (row.userId !== userId) {
          continue;
        }
        if (row.orderIndex !== index) {
          await ctx.db.patch("templateExercises", row._id, {
            orderIndex: index,
          });
        }
        index += 1;
      }
    }

    const [noteDoc, recordDoc] = await Promise.all([
      ctx.db
        .query("userExerciseNotes")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", args.exerciseId),
        )
        .unique(),
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", args.exerciseId),
        )
        .unique(),
    ]);

    if (noteDoc !== null) {
      await ctx.db.delete("userExerciseNotes", noteDoc._id);
    }
    if (recordDoc !== null) {
      await ctx.db.delete("exerciseRecords", recordDoc._id);
    }

    await ctx.db.delete("exercises", args.exerciseId);
    return null;
  },
});

export const upsertNote = mutation({
  args: {
    exerciseId: v.id("exercises"),
    notes: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireReadableExercise(ctx, args.exerciseId, userId);

    const parsedNote = parseExerciseNote(args.notes);
    if (parsedNote.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedNote.message,
      });
    }

    const existing = await ctx.db
      .query("userExerciseNotes")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", args.exerciseId),
      )
      .unique();

    if (parsedNote.notes === "") {
      if (existing !== null) {
        await ctx.db.delete("userExerciseNotes", existing._id);
      }
      return null;
    }

    if (existing !== null) {
      await ctx.db.patch("userExerciseNotes", existing._id, {
        notes: parsedNote.notes,
      });
    } else {
      await ctx.db.insert("userExerciseNotes", {
        userId,
        exerciseId: args.exerciseId,
        notes: parsedNote.notes,
      });
    }

    return parsedNote.notes;
  },
});
