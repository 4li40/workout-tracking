import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuthUserId, requireOwnedById } from "./lib/auth";
import { MAX_TEMPLATE_EXERCISES } from "./lib/templates";
import { equipmentValidator, muscleGroupValidator } from "./lib/validators";

const MAX_WORKOUT_TITLE_LENGTH = 80;

type ParseWorkoutTitleResult =
  | { readonly kind: "ok"; readonly title: string }
  | { readonly kind: "error"; readonly message: string };

function parseWorkoutTitle(raw: string): ParseWorkoutTitleResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      kind: "error",
      message: "Workout title is required.",
    };
  }
  if (trimmed.length > MAX_WORKOUT_TITLE_LENGTH) {
    return {
      kind: "error",
      message: `Workout title must be ${MAX_WORKOUT_TITLE_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", title: trimmed };
}

const activeWorkoutExerciseValidator = v.object({
  _id: v.id("workoutExercises"),
  exerciseId: v.id("exercises"),
  exerciseName: v.string(),
  muscleGroup: muscleGroupValidator,
  equipment: equipmentValidator,
  isBodyweight: v.boolean(),
  orderIndex: v.number(),
  restSeconds: v.number(),
});

const activeWorkoutDetailsValidator = v.object({
  _id: v.id("workouts"),
  title: v.string(),
  templateId: v.optional(v.id("workoutTemplates")),
  startedAt: v.number(),
  restTimerEndsAt: v.optional(v.number()),
  exercises: v.array(activeWorkoutExerciseValidator),
});

export const startWorkout = mutation({
  args: {
    templateId: v.optional(v.id("workoutTemplates")),
    title: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      kind: v.literal("started"),
      workoutId: v.id("workouts"),
      title: v.string(),
    }),
    v.object({
      kind: v.literal("already_active"),
      workoutId: v.id("workouts"),
      title: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const existingActive = await ctx.db
      .query("workouts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "in_progress"),
      )
      .order("desc")
      .first();

    if (existingActive !== null) {
      return {
        kind: "already_active" as const,
        workoutId: existingActive._id,
        title: existingActive.title,
      };
    }

    const startedAt = Date.now();

    if (args.templateId !== undefined) {
      const template = await requireOwnedById(
        ctx,
        "workoutTemplates",
        args.templateId,
        userId,
      );

      const templateRows = (
        await ctx.db
          .query("templateExercises")
          .withIndex("by_template_order", (q) =>
            q.eq("templateId", template._id),
          )
          .take(MAX_TEMPLATE_EXERCISES)
      ).filter((row) => row.userId === userId);

      const fetchedExercises = await Promise.all(
        templateRows.map((row) => ctx.db.get("exercises", row.exerciseId)),
      );

      const validRows = templateRows.filter((_, index) => {
        const exercise = fetchedExercises[index];
        return (
          exercise !== null &&
          (exercise.userId === undefined || exercise.userId === userId)
        );
      });

      const workoutId = await ctx.db.insert("workouts", {
        userId,
        templateId: template._id,
        title: template.title,
        status: "in_progress",
        startedAt,
      });

      for (const [orderIndex, row] of validRows.entries()) {
        await ctx.db.insert("workoutExercises", {
          userId,
          workoutId,
          exerciseId: row.exerciseId,
          orderIndex,
          restSeconds: row.restSeconds,
          workoutStatus: "in_progress",
        });
      }

      return {
        kind: "started" as const,
        workoutId,
        title: template.title,
      };
    }

    let workoutTitle = "Freestyle Workout";
    if (args.title !== undefined) {
      const parsedTitle = parseWorkoutTitle(args.title);
      if (parsedTitle.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedTitle.message,
        });
      }
      workoutTitle = parsedTitle.title;
    }

    const workoutId = await ctx.db.insert("workouts", {
      userId,
      title: workoutTitle,
      status: "in_progress",
      startedAt,
    });

    return {
      kind: "started" as const,
      workoutId,
      title: workoutTitle,
    };
  },
});

export const getActive = query({
  args: {},
  returns: v.union(activeWorkoutDetailsValidator, v.null()),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const activeWorkout = await ctx.db
      .query("workouts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "in_progress"),
      )
      .order("desc")
      .first();

    if (activeWorkout === null) {
      return null;
    }

    const workoutExercises = (
      await ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) =>
          q.eq("workoutId", activeWorkout._id),
        )
        .take(MAX_TEMPLATE_EXERCISES)
    ).filter((row) => row.userId === userId);

    const uniqueExerciseIds = Array.from(
      new Set(workoutExercises.map((row) => row.exerciseId)),
    );
    const hydratedExercises = new Map<Id<"exercises">, Doc<"exercises">>();
    const fetchedExercises = await Promise.all(
      uniqueExerciseIds.map(async (exerciseId) => ({
        exerciseId,
        doc: await ctx.db.get("exercises", exerciseId),
      })),
    );

    for (const { exerciseId, doc } of fetchedExercises) {
      if (doc !== null && (doc.userId === undefined || doc.userId === userId)) {
        hydratedExercises.set(exerciseId, doc);
      }
    }

    const exercises = [];
    for (const row of workoutExercises) {
      const exercise = hydratedExercises.get(row.exerciseId);
      if (exercise === undefined) {
        continue;
      }
      exercises.push({
        _id: row._id,
        exerciseId: row.exerciseId,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        orderIndex: row.orderIndex,
        restSeconds: row.restSeconds,
      });
    }

    return {
      _id: activeWorkout._id,
      title: activeWorkout.title,
      ...(activeWorkout.templateId !== undefined
        ? { templateId: activeWorkout.templateId }
        : {}),
      startedAt: activeWorkout.startedAt,
      ...(activeWorkout.restTimerEndsAt !== undefined
        ? { restTimerEndsAt: activeWorkout.restTimerEndsAt }
        : {}),
      exercises,
    };
  },
});

export const discardWorkout = mutation({
  args: {
    workoutId: v.id("workouts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workout = await requireOwnedById(
      ctx,
      "workouts",
      args.workoutId,
      userId,
    );

    if (workout.status !== "in_progress") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Only an in-progress workout can be discarded.",
      });
    }

    for await (const setDoc of ctx.db
      .query("sets")
      .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))) {
      if (setDoc.userId === userId) {
        await ctx.db.delete("sets", setDoc._id);
      }
    }

    for await (const workoutExercise of ctx.db
      .query("workoutExercises")
      .withIndex("by_workout_order", (q) => q.eq("workoutId", workout._id))) {
      if (workoutExercise.userId === userId) {
        await ctx.db.delete("workoutExercises", workoutExercise._id);
      }
    }

    await ctx.db.delete("workouts", workout._id);
    return null;
  },
});
