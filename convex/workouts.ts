import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import {
  requireAuthUserId,
  requireOwnedById,
  requireReadableExercise,
  requireUserOwnedDoc,
} from "./lib/auth";
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_UNIT,
  MAX_REST_SECONDS,
  parseRestSeconds,
} from "./lib/settings";
import { MAX_TEMPLATE_EXERCISES, validatePermutation } from "./lib/templates";
import {
  equipmentValidator,
  muscleGroupValidator,
  setTypeValidator,
  weightUnitValidator,
  workoutStatusValidator,
} from "./lib/validators";
import {
  buildPreviousSetPerformances,
  computeEffectiveTargetSets,
  diffWorkoutAgainstTemplate,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_SETS,
  parseRestAdjustDelta,
  parseSetReps,
  parseSetWeightKg,
  parseWorkoutNotes,
  parseWorkoutTitle,
  PREVIOUS_SESSION_LOOKBACK_LIMIT,
  SET_TYPE_META,
  validateCompletedSet,
} from "./lib/workouts";

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

const workoutSetDetailValidator = v.object({
  _id: v.id("sets"),
  setNumber: v.number(),
  setType: setTypeValidator,
  weightKg: v.number(),
  enteredUnit: weightUnitValidator,
  reps: v.number(),
  completed: v.boolean(),
  completedAt: v.optional(v.number()),
});

const previousSetValidator = v.object({
  setType: setTypeValidator,
  typeOrdinal: v.number(),
  weightKg: v.number(),
  enteredUnit: weightUnitValidator,
  reps: v.number(),
});

const workoutExerciseDetailValidator = v.object({
  _id: v.id("workoutExercises"),
  exerciseId: v.id("exercises"),
  exerciseName: v.string(),
  muscleGroup: muscleGroupValidator,
  equipment: equipmentValidator,
  isBodyweight: v.boolean(),
  isCustom: v.boolean(),
  stickyNote: v.optional(v.string()),
  orderIndex: v.number(),
  restSeconds: v.number(),
  sets: v.array(workoutSetDetailValidator),
  previousSets: v.array(previousSetValidator),
});

const templateDiffSummaryValidator = v.object({
  hasStructuralChanges: v.boolean(),
  exercisesAdded: v.number(),
  exercisesRemoved: v.number(),
  orderOrSelectionChanged: v.boolean(),
  targetSetsChanged: v.boolean(),
  restDurationChanged: v.boolean(),
});

const workoutSourceTemplateValidator = v.object({
  _id: v.id("workoutTemplates"),
  title: v.string(),
  diff: templateDiffSummaryValidator,
});

const workoutDetailValidator = v.object({
  _id: v.id("workouts"),
  title: v.string(),
  status: workoutStatusValidator,
  templateId: v.optional(v.id("workoutTemplates")),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
  restTimerEndsAt: v.optional(v.number()),
  exercises: v.array(workoutExerciseDetailValidator),
  sourceTemplate: v.union(workoutSourceTemplateValidator, v.null()),
});

async function requireActiveOwnedWorkout(
  ctx: MutationCtx,
  workoutId: Id<"workouts">,
  userId: Id<"users">,
): Promise<Doc<"workouts">> {
  const workout = await requireOwnedById(ctx, "workouts", workoutId, userId);
  if (workout.status !== "in_progress") {
    throw new ConvexError({
      code: "CONFLICT",
      message: "Only an in-progress workout can be modified.",
    });
  }
  return workout;
}

async function resolveUserDefaults(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  const unit = settings?.unit ?? DEFAULT_WEIGHT_UNIT;
  const defaultRestSeconds =
    settings !== null &&
    parseRestSeconds(settings.defaultRestSeconds).kind === "ok"
      ? settings.defaultRestSeconds
      : DEFAULT_REST_SECONDS;

  return { unit, defaultRestSeconds };
}

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
      const [template, defaults] = await Promise.all([
        requireOwnedById(ctx, "workoutTemplates", args.templateId, userId),
        resolveUserDefaults(ctx, userId),
      ]);

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

      const totalStarterSets = validRows.reduce(
        (sum, row) => sum + row.targetSets,
        0,
      );
      if (totalStarterSets > MAX_WORKOUT_SETS) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `A workout can contain up to ${MAX_WORKOUT_SETS} sets.`,
        });
      }

      const workoutId = await ctx.db.insert("workouts", {
        userId,
        templateId: template._id,
        title: template.title,
        status: "in_progress",
        startedAt,
      });

      for (const [orderIndex, row] of validRows.entries()) {
        const workoutExerciseId = await ctx.db.insert("workoutExercises", {
          userId,
          workoutId,
          exerciseId: row.exerciseId,
          orderIndex,
          restSeconds: row.restSeconds,
          workoutStatus: "in_progress",
        });

        for (let setNumber = 1; setNumber <= row.targetSets; setNumber += 1) {
          await ctx.db.insert("sets", {
            userId,
            workoutId,
            workoutExerciseId,
            exerciseId: row.exerciseId,
            setNumber,
            setType: "working",
            weightKg: 0,
            enteredUnit: defaults.unit,
            reps: 0,
            completed: false,
          });
        }
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

export const get = query({
  args: {
    workoutId: v.string(),
  },
  returns: v.union(workoutDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const normalizedId = ctx.db.normalizeId("workouts", args.workoutId);
    if (normalizedId === null) {
      return null;
    }

    const workout = await ctx.db.get("workouts", normalizedId);
    if (workout === null) {
      return null;
    }

    requireUserOwnedDoc(workout, userId, "workouts");

    const [workoutExerciseRows, workoutSetRows] = await Promise.all([
      ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) => q.eq("workoutId", workout._id))
        .take(MAX_WORKOUT_EXERCISES),
      ctx.db
        .query("sets")
        .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))
        .take(MAX_WORKOUT_SETS),
    ]);

    const ownedExercises = workoutExerciseRows.filter(
      (row) => row.userId === userId,
    );

    const setsByWorkoutExercise = new Map<
      Id<"workoutExercises">,
      Doc<"sets">[]
    >();
    for (const setDoc of workoutSetRows) {
      if (setDoc.userId !== userId) {
        continue;
      }
      const list = setsByWorkoutExercise.get(setDoc.workoutExerciseId);
      if (list !== undefined) {
        list.push(setDoc);
      } else {
        setsByWorkoutExercise.set(setDoc.workoutExerciseId, [setDoc]);
      }
    }
    for (const list of setsByWorkoutExercise.values()) {
      list.sort((a, b) => a.setNumber - b.setNumber);
    }

    const uniqueExerciseIds = Array.from(
      new Set(ownedExercises.map((row) => row.exerciseId)),
    );

    const [fetchedExercises, fetchedNotes, fetchedPrevious] = await Promise.all(
      [
        Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => ({
            exerciseId,
            doc: await ctx.db.get("exercises", exerciseId),
          })),
        ),
        Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => ({
            exerciseId,
            doc: await ctx.db
              .query("userExerciseNotes")
              .withIndex("by_user_exercise", (q) =>
                q.eq("userId", userId).eq("exerciseId", exerciseId),
              )
              .unique(),
          })),
        ),
        Promise.all(
          uniqueExerciseIds.map(async (exerciseId) => {
            const candidates = await ctx.db
              .query("workoutExercises")
              .withIndex("by_user_exercise_completedAt", (q) => {
                const scoped = q
                  .eq("userId", userId)
                  .eq("exerciseId", exerciseId)
                  .gt("completedAt", 0);
                return workout.status === "completed" &&
                  workout.finishedAt !== undefined
                  ? scoped.lt("completedAt", workout.finishedAt)
                  : scoped;
              })
              .order("desc")
              .take(PREVIOUS_SESSION_LOOKBACK_LIMIT);

            for (const candidate of candidates) {
              if (
                candidate.workoutStatus !== "completed" ||
                candidate.workoutId === workout._id
              ) {
                continue;
              }
              const candidateSets = (
                await ctx.db
                  .query("sets")
                  .withIndex("by_workoutExercise_number", (q) =>
                    q.eq("workoutExerciseId", candidate._id),
                  )
                  .take(MAX_SETS_PER_EXERCISE)
              ).filter(
                (setDoc) => setDoc.userId === userId && setDoc.completed,
              );

              if (candidateSets.length > 0) {
                return {
                  exerciseId,
                  previousSets: buildPreviousSetPerformances(candidateSets),
                };
              }
            }

            return {
              exerciseId,
              previousSets: [],
            };
          }),
        ),
      ],
    );

    const exerciseMap = new Map<Id<"exercises">, Doc<"exercises">>();
    for (const { exerciseId, doc } of fetchedExercises) {
      if (doc !== null && (doc.userId === undefined || doc.userId === userId)) {
        exerciseMap.set(exerciseId, doc);
      }
    }

    const stickyNoteMap = new Map<Id<"exercises">, string>();
    for (const { exerciseId, doc } of fetchedNotes) {
      if (doc !== null) {
        stickyNoteMap.set(exerciseId, doc.notes);
      }
    }

    const previousSetsMap = new Map(
      fetchedPrevious.map((entry) => [entry.exerciseId, entry.previousSets]),
    );

    const exercises = [];
    for (const row of ownedExercises) {
      const exercise = exerciseMap.get(row.exerciseId);
      if (exercise === undefined) {
        continue;
      }
      const rowSets = setsByWorkoutExercise.get(row._id) ?? [];
      const stickyNote = stickyNoteMap.get(row.exerciseId);

      exercises.push({
        _id: row._id,
        exerciseId: row.exerciseId,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        isCustom: exercise.userId !== undefined,
        ...(stickyNote !== undefined ? { stickyNote } : {}),
        orderIndex: row.orderIndex,
        restSeconds: row.restSeconds,
        sets: rowSets.map((setDoc) => ({
          _id: setDoc._id,
          setNumber: setDoc.setNumber,
          setType: setDoc.setType,
          weightKg: setDoc.weightKg,
          enteredUnit: setDoc.enteredUnit,
          reps: setDoc.reps,
          completed: setDoc.completed,
          ...(setDoc.completedAt !== undefined
            ? { completedAt: setDoc.completedAt }
            : {}),
        })),
        previousSets: previousSetsMap.get(row.exerciseId) ?? [],
      });
    }

    let sourceTemplate = null;
    if (workout.status === "in_progress" && workout.templateId !== undefined) {
      const template = await ctx.db.get("workoutTemplates", workout.templateId);
      if (template !== null && template.userId === userId) {
        const templateRows = (
          await ctx.db
            .query("templateExercises")
            .withIndex("by_template_order", (q) =>
              q.eq("templateId", template._id),
            )
            .take(MAX_TEMPLATE_EXERCISES)
        ).filter((row) => row.userId === userId);

        const currentStructure = exercises.map((item) => ({
          exerciseId: item.exerciseId,
          targetSets: computeEffectiveTargetSets(item.sets),
          restSeconds: item.restSeconds,
        }));
        const templateStructure = templateRows.map((item) => ({
          exerciseId: item.exerciseId,
          targetSets: item.targetSets,
          restSeconds: item.restSeconds,
        }));

        sourceTemplate = {
          _id: template._id,
          title: template.title,
          diff: diffWorkoutAgainstTemplate(currentStructure, templateStructure),
        };
      }
    }

    return {
      _id: workout._id,
      title: workout.title,
      status: workout.status,
      ...(workout.templateId !== undefined
        ? { templateId: workout.templateId }
        : {}),
      startedAt: workout.startedAt,
      ...(workout.finishedAt !== undefined
        ? { finishedAt: workout.finishedAt }
        : {}),
      ...(workout.notes !== undefined ? { notes: workout.notes } : {}),
      ...(workout.restTimerEndsAt !== undefined
        ? { restTimerEndsAt: workout.restTimerEndsAt }
        : {}),
      exercises,
      sourceTemplate,
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
        .take(MAX_WORKOUT_EXERCISES)
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

export const updateWorkoutDetails = mutation({
  args: {
    workoutId: v.id("workouts"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireActiveOwnedWorkout(ctx, args.workoutId, userId);

    const patch: { title?: string; notes?: string | undefined } = {};

    if (args.title !== undefined) {
      const parsedTitle = parseWorkoutTitle(args.title);
      if (parsedTitle.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedTitle.message,
        });
      }
      patch.title = parsedTitle.title;
    }

    if (args.notes !== undefined) {
      const parsedNotes = parseWorkoutNotes(args.notes);
      if (parsedNotes.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedNotes.message,
        });
      }
      patch.notes = parsedNotes.notes;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("workouts", args.workoutId, patch);
    }

    return null;
  },
});

export const addWorkoutExercise = mutation({
  args: {
    workoutId: v.id("workouts"),
    exerciseId: v.id("exercises"),
    restSeconds: v.optional(v.number()),
  },
  returns: v.object({
    workoutExerciseId: v.id("workoutExercises"),
    setId: v.id("sets"),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireActiveOwnedWorkout(ctx, args.workoutId, userId);
    await requireReadableExercise(ctx, args.exerciseId, userId);

    const [existingRows, workoutSets, defaults] = await Promise.all([
      ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) => q.eq("workoutId", args.workoutId))
        .take(MAX_WORKOUT_EXERCISES),
      ctx.db
        .query("sets")
        .withIndex("by_workout", (q) => q.eq("workoutId", args.workoutId))
        .take(MAX_WORKOUT_SETS),
      resolveUserDefaults(ctx, userId),
    ]);

    const ownedRows = existingRows.filter((row) => row.userId === userId);
    if (ownedRows.length >= MAX_WORKOUT_EXERCISES) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A workout can contain up to ${MAX_WORKOUT_EXERCISES} exercises.`,
      });
    }

    const ownedSetCount = workoutSets.filter(
      (row) => row.userId === userId,
    ).length;
    if (ownedSetCount >= MAX_WORKOUT_SETS) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A workout can contain up to ${MAX_WORKOUT_SETS} sets.`,
      });
    }

    let restSeconds = defaults.defaultRestSeconds;
    if (args.restSeconds !== undefined) {
      const parsedRest = parseRestSeconds(args.restSeconds);
      if (parsedRest.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedRest.message,
        });
      }
      restSeconds = parsedRest.seconds;
    }

    const orderIndex =
      ownedRows.length === 0
        ? 0
        : ownedRows[ownedRows.length - 1].orderIndex + 1;

    const workoutExerciseId = await ctx.db.insert("workoutExercises", {
      userId,
      workoutId: args.workoutId,
      exerciseId: args.exerciseId,
      orderIndex,
      restSeconds,
      workoutStatus: "in_progress",
    });

    const setId = await ctx.db.insert("sets", {
      userId,
      workoutId: args.workoutId,
      workoutExerciseId,
      exerciseId: args.exerciseId,
      setNumber: 1,
      setType: "working",
      weightKg: 0,
      enteredUnit: defaults.unit,
      reps: 0,
      completed: false,
    });

    return { workoutExerciseId, setId };
  },
});

export const removeWorkoutExercise = mutation({
  args: {
    workoutExerciseId: v.id("workoutExercises"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workoutExercise = await requireOwnedById(
      ctx,
      "workoutExercises",
      args.workoutExerciseId,
      userId,
    );
    await requireActiveOwnedWorkout(ctx, workoutExercise.workoutId, userId);

    for await (const setDoc of ctx.db
      .query("sets")
      .withIndex("by_workoutExercise_number", (q) =>
        q.eq("workoutExerciseId", workoutExercise._id),
      )) {
      if (setDoc.userId === userId) {
        await ctx.db.delete("sets", setDoc._id);
      }
    }

    await ctx.db.delete("workoutExercises", workoutExercise._id);

    const remainingRows = (
      await ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) =>
          q.eq("workoutId", workoutExercise.workoutId),
        )
        .take(MAX_WORKOUT_EXERCISES)
    ).filter((row) => row.userId === userId);

    for (const [index, row] of remainingRows.entries()) {
      if (row.orderIndex !== index) {
        await ctx.db.patch("workoutExercises", row._id, {
          orderIndex: index,
        });
      }
    }

    return null;
  },
});

export const swapWorkoutExercise = mutation({
  args: {
    workoutExerciseId: v.id("workoutExercises"),
    newExerciseId: v.id("exercises"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workoutExercise = await requireOwnedById(
      ctx,
      "workoutExercises",
      args.workoutExerciseId,
      userId,
    );
    await requireActiveOwnedWorkout(ctx, workoutExercise.workoutId, userId);
    await requireReadableExercise(ctx, args.newExerciseId, userId);

    if (workoutExercise.exerciseId === args.newExerciseId) {
      return null;
    }

    await ctx.db.patch("workoutExercises", workoutExercise._id, {
      exerciseId: args.newExerciseId,
    });

    const existingSets = (
      await ctx.db
        .query("sets")
        .withIndex("by_workoutExercise_number", (q) =>
          q.eq("workoutExerciseId", workoutExercise._id),
        )
        .take(MAX_SETS_PER_EXERCISE)
    ).filter((row) => row.userId === userId);

    if (existingSets.length === 0) {
      const defaults = await resolveUserDefaults(ctx, userId);
      await ctx.db.insert("sets", {
        userId,
        workoutId: workoutExercise.workoutId,
        workoutExerciseId: workoutExercise._id,
        exerciseId: args.newExerciseId,
        setNumber: 1,
        setType: "working",
        weightKg: 0,
        enteredUnit: defaults.unit,
        reps: 0,
        completed: false,
      });
      return null;
    }

    for (const setDoc of existingSets) {
      await ctx.db.patch("sets", setDoc._id, {
        exerciseId: args.newExerciseId,
        weightKg: 0,
        reps: 0,
        completed: false,
        completedAt: undefined,
      });
    }

    return null;
  },
});

export const reorderWorkoutExercises = mutation({
  args: {
    workoutId: v.id("workouts"),
    orderedWorkoutExerciseIds: v.array(v.id("workoutExercises")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireActiveOwnedWorkout(ctx, args.workoutId, userId);

    const existingRows = (
      await ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) => q.eq("workoutId", args.workoutId))
        .take(MAX_WORKOUT_EXERCISES)
    ).filter((row) => row.userId === userId);

    const validation = validatePermutation(
      existingRows.map((row) => row._id),
      args.orderedWorkoutExerciseIds,
    );
    if (validation.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: validation.message,
      });
    }

    const existingById = new Map(existingRows.map((row) => [row._id, row]));

    for (const [
      newIndex,
      workoutExerciseId,
    ] of args.orderedWorkoutExerciseIds.entries()) {
      const existing = existingById.get(workoutExerciseId);
      if (existing !== undefined && existing.orderIndex !== newIndex) {
        await ctx.db.patch("workoutExercises", workoutExerciseId, {
          orderIndex: newIndex,
        });
      }
    }

    return null;
  },
});

export const updateWorkoutExerciseRest = mutation({
  args: {
    workoutExerciseId: v.id("workoutExercises"),
    restSeconds: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workoutExercise = await requireOwnedById(
      ctx,
      "workoutExercises",
      args.workoutExerciseId,
      userId,
    );
    await requireActiveOwnedWorkout(ctx, workoutExercise.workoutId, userId);

    const parsedRest = parseRestSeconds(args.restSeconds);
    if (parsedRest.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedRest.message,
      });
    }

    await ctx.db.patch("workoutExercises", workoutExercise._id, {
      restSeconds: parsedRest.seconds,
    });

    return null;
  },
});

export const upsertSet = mutation({
  args: {
    workoutExerciseId: v.id("workoutExercises"),
    setId: v.optional(v.id("sets")),
    setType: setTypeValidator,
    weightKg: v.number(),
    enteredUnit: weightUnitValidator,
    reps: v.number(),
    completed: v.boolean(),
    autoStartRestTimer: v.optional(v.boolean()),
  },
  returns: v.object({
    setId: v.id("sets"),
    restTimerEndsAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workoutExercise = await requireOwnedById(
      ctx,
      "workoutExercises",
      args.workoutExerciseId,
      userId,
    );
    const workout = await requireActiveOwnedWorkout(
      ctx,
      workoutExercise.workoutId,
      userId,
    );

    const parsedWeight = parseSetWeightKg(args.weightKg);
    if (parsedWeight.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedWeight.message,
      });
    }

    const parsedReps = parseSetReps(args.reps);
    if (parsedReps.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedReps.message,
      });
    }

    if (args.completed) {
      const exercise = await requireReadableExercise(
        ctx,
        workoutExercise.exerciseId,
        userId,
      );
      const completedCheck = validateCompletedSet({
        weightKg: parsedWeight.weightKg,
        reps: parsedReps.reps,
        isBodyweight: exercise.isBodyweight,
      });
      if (completedCheck.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: completedCheck.message,
        });
      }
    }

    const now = Date.now();
    let setId: Id<"sets">;
    let wasCompleted = false;

    if (args.setId !== undefined) {
      const existingSet = await requireOwnedById(
        ctx,
        "sets",
        args.setId,
        userId,
      );
      if (
        existingSet.workoutExerciseId !== workoutExercise._id ||
        existingSet.workoutId !== workout._id
      ) {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: "Set does not belong to this exercise.",
        });
      }

      wasCompleted = existingSet.completed;
      setId = existingSet._id;

      await ctx.db.patch("sets", existingSet._id, {
        setType: args.setType,
        weightKg: parsedWeight.weightKg,
        enteredUnit: args.enteredUnit,
        reps: parsedReps.reps,
        completed: args.completed,
        completedAt: args.completed
          ? wasCompleted
            ? (existingSet.completedAt ?? now)
            : now
          : undefined,
      });
    } else {
      const [existingSets, workoutSets] = await Promise.all([
        ctx.db
          .query("sets")
          .withIndex("by_workoutExercise_number", (q) =>
            q.eq("workoutExerciseId", workoutExercise._id),
          )
          .take(MAX_SETS_PER_EXERCISE),
        ctx.db
          .query("sets")
          .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))
          .take(MAX_WORKOUT_SETS),
      ]);

      const ownedExerciseSets = existingSets.filter(
        (row) => row.userId === userId,
      );
      if (ownedExerciseSets.length >= MAX_SETS_PER_EXERCISE) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `An exercise can have up to ${MAX_SETS_PER_EXERCISE} sets.`,
        });
      }

      const ownedWorkoutSetCount = workoutSets.filter(
        (row) => row.userId === userId,
      ).length;
      if (ownedWorkoutSetCount >= MAX_WORKOUT_SETS) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `A workout can contain up to ${MAX_WORKOUT_SETS} sets.`,
        });
      }

      const maxSetNumber = ownedExerciseSets.reduce(
        (max, row) => Math.max(max, row.setNumber),
        0,
      );

      setId = await ctx.db.insert("sets", {
        userId,
        workoutId: workout._id,
        workoutExerciseId: workoutExercise._id,
        exerciseId: workoutExercise.exerciseId,
        setNumber: maxSetNumber + 1,
        setType: args.setType,
        weightKg: parsedWeight.weightKg,
        enteredUnit: args.enteredUnit,
        reps: parsedReps.reps,
        completed: args.completed,
        ...(args.completed ? { completedAt: now } : {}),
      });
    }

    if (
      !wasCompleted &&
      args.completed &&
      SET_TYPE_META[args.setType].autoStartsRestTimer &&
      args.autoStartRestTimer !== false
    ) {
      const nextRestTimerEndsAt = now + workoutExercise.restSeconds * 1000;
      await ctx.db.patch("workouts", workout._id, {
        restTimerEndsAt: nextRestTimerEndsAt,
      });
      return {
        setId,
        restTimerEndsAt: nextRestTimerEndsAt,
      };
    }

    return {
      setId,
      ...(workout.restTimerEndsAt !== undefined
        ? { restTimerEndsAt: workout.restTimerEndsAt }
        : {}),
    };
  },
});

export const deleteSet = mutation({
  args: {
    setId: v.id("sets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const setDoc = await requireOwnedById(ctx, "sets", args.setId, userId);
    await requireActiveOwnedWorkout(ctx, setDoc.workoutId, userId);

    await ctx.db.delete("sets", setDoc._id);

    const remainingSets = (
      await ctx.db
        .query("sets")
        .withIndex("by_workoutExercise_number", (q) =>
          q.eq("workoutExerciseId", setDoc.workoutExerciseId),
        )
        .take(MAX_SETS_PER_EXERCISE)
    ).filter((row) => row.userId === userId);

    for (const [index, row] of remainingSets.entries()) {
      const nextNumber = index + 1;
      if (row.setNumber !== nextNumber) {
        await ctx.db.patch("sets", row._id, { setNumber: nextNumber });
      }
    }

    return null;
  },
});

export const updateRestTimer = mutation({
  args: {
    workoutId: v.id("workouts"),
    action: v.union(
      v.object({
        kind: v.literal("start"),
        durationSeconds: v.number(),
      }),
      v.object({
        kind: v.literal("adjust"),
        deltaSeconds: v.number(),
      }),
      v.object({
        kind: v.literal("skip"),
      }),
    ),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workout = await requireActiveOwnedWorkout(
      ctx,
      args.workoutId,
      userId,
    );
    const now = Date.now();

    switch (args.action.kind) {
      case "start": {
        const parsed = parseRestSeconds(args.action.durationSeconds);
        if (parsed.kind === "error") {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: parsed.message,
          });
        }
        const nextEndsAt = now + parsed.seconds * 1000;
        await ctx.db.patch("workouts", workout._id, {
          restTimerEndsAt: nextEndsAt,
        });
        return nextEndsAt;
      }

      case "adjust": {
        const parsedDelta = parseRestAdjustDelta(args.action.deltaSeconds);
        if (parsedDelta.kind === "error") {
          throw new ConvexError({
            code: "INVALID_ARGUMENT",
            message: parsedDelta.message,
          });
        }
        const base = Math.max(now, workout.restTimerEndsAt ?? now);
        const nextEndsAt = base + parsedDelta.deltaSeconds * 1000;
        if (nextEndsAt <= now) {
          await ctx.db.patch("workouts", workout._id, {
            restTimerEndsAt: undefined,
          });
          return null;
        }
        const clampedEndsAt = Math.min(
          nextEndsAt,
          now + MAX_REST_SECONDS * 1000,
        );
        await ctx.db.patch("workouts", workout._id, {
          restTimerEndsAt: clampedEndsAt,
        });
        return clampedEndsAt;
      }

      case "skip": {
        await ctx.db.patch("workouts", workout._id, {
          restTimerEndsAt: undefined,
        });
        return null;
      }

      default: {
        const _exhaustive: never = args.action;
        return _exhaustive;
      }
    }
  },
});

export const finishWorkout = mutation({
  args: {
    workoutId: v.id("workouts"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    updateTemplate: v.optional(v.boolean()),
  },
  returns: v.object({
    workoutId: v.id("workouts"),
    finishedAt: v.number(),
    completedSetsCount: v.number(),
    templateUpdated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const workout = await requireActiveOwnedWorkout(
      ctx,
      args.workoutId,
      userId,
    );

    let validatedTitle: string | undefined;
    if (args.title !== undefined) {
      const parsedTitle = parseWorkoutTitle(args.title);
      if (parsedTitle.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedTitle.message,
        });
      }
      validatedTitle = parsedTitle.title;
    }

    let hasNotesArg = false;
    let validatedNotes: string | undefined;
    if (args.notes !== undefined) {
      const parsedNotes = parseWorkoutNotes(args.notes);
      if (parsedNotes.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedNotes.message,
        });
      }
      hasNotesArg = true;
      validatedNotes = parsedNotes.notes;
    }

    const [workoutExerciseRows, workoutSetRows] = await Promise.all([
      ctx.db
        .query("workoutExercises")
        .withIndex("by_workout_order", (q) => q.eq("workoutId", workout._id))
        .take(MAX_WORKOUT_EXERCISES),
      ctx.db
        .query("sets")
        .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))
        .take(MAX_WORKOUT_SETS),
    ]);

    const ownedExercises = workoutExerciseRows.filter(
      (row) => row.userId === userId,
    );
    const ownedSets = workoutSetRows.filter((row) => row.userId === userId);

    const allSetsByExercise = new Map<Id<"workoutExercises">, Doc<"sets">[]>();
    const completedSetsByExercise = new Map<
      Id<"workoutExercises">,
      Doc<"sets">[]
    >();
    let completedSetsCount = 0;

    for (const setDoc of ownedSets) {
      const allList = allSetsByExercise.get(setDoc.workoutExerciseId);
      if (allList !== undefined) {
        allList.push(setDoc);
      } else {
        allSetsByExercise.set(setDoc.workoutExerciseId, [setDoc]);
      }

      if (setDoc.completed) {
        completedSetsCount += 1;
        const completedList = completedSetsByExercise.get(
          setDoc.workoutExerciseId,
        );
        if (completedList !== undefined) {
          completedList.push(setDoc);
        } else {
          completedSetsByExercise.set(setDoc.workoutExerciseId, [setDoc]);
        }
      }
    }

    if (completedSetsCount < 1) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Complete at least one set before finishing the workout.",
      });
    }

    const finishedAt = Date.now();
    let templateUpdated = false;
    let ownedTemplate: Doc<"workoutTemplates"> | null = null;

    if (workout.templateId !== undefined) {
      const template = await ctx.db.get("workoutTemplates", workout.templateId);
      if (template !== null && template.userId === userId) {
        ownedTemplate = template;
      }
    }

    if (args.updateTemplate === true && ownedTemplate !== null) {
      const existingTemplateRows = (
        await ctx.db
          .query("templateExercises")
          .withIndex("by_template_order", (q) =>
            q.eq("templateId", ownedTemplate._id),
          )
          .take(MAX_TEMPLATE_EXERCISES)
      ).filter((row) => row.userId === userId);

      const targetRepsQueues = new Map<
        Id<"exercises">,
        Array<string | undefined>
      >();
      for (const templateRow of existingTemplateRows) {
        const queue = targetRepsQueues.get(templateRow.exerciseId);
        if (queue !== undefined) {
          queue.push(templateRow.targetReps);
        } else {
          targetRepsQueues.set(templateRow.exerciseId, [
            templateRow.targetReps,
          ]);
        }
      }

      for await (const row of ctx.db
        .query("templateExercises")
        .withIndex("by_template_order", (q) =>
          q.eq("templateId", ownedTemplate._id),
        )) {
        if (row.userId === userId) {
          await ctx.db.delete("templateExercises", row._id);
        }
      }

      for (const [orderIndex, row] of ownedExercises.entries()) {
        const exerciseSets = allSetsByExercise.get(row._id) ?? [];
        const targetSets = computeEffectiveTargetSets(exerciseSets);
        const repsQueue = targetRepsQueues.get(row.exerciseId);
        const preservedTargetReps =
          repsQueue !== undefined && repsQueue.length > 0
            ? repsQueue.shift()
            : undefined;

        await ctx.db.insert("templateExercises", {
          userId,
          templateId: ownedTemplate._id,
          exerciseId: row.exerciseId,
          orderIndex,
          targetSets,
          ...(preservedTargetReps !== undefined
            ? { targetReps: preservedTargetReps }
            : {}),
          restSeconds: row.restSeconds,
        });
      }

      templateUpdated = true;
    }

    for (const setDoc of ownedSets) {
      if (!setDoc.completed) {
        await ctx.db.delete("sets", setDoc._id);
      }
    }

    let keptOrderIndex = 0;
    for (const row of ownedExercises) {
      const completedList = completedSetsByExercise.get(row._id) ?? [];
      if (completedList.length === 0) {
        await ctx.db.delete("workoutExercises", row._id);
        continue;
      }

      completedList.sort((a, b) => a.setNumber - b.setNumber);
      for (const [index, setDoc] of completedList.entries()) {
        const nextSetNumber = index + 1;
        const nextCompletedAt = setDoc.completedAt ?? finishedAt;
        if (
          setDoc.setNumber !== nextSetNumber ||
          setDoc.completedAt !== nextCompletedAt
        ) {
          await ctx.db.patch("sets", setDoc._id, {
            setNumber: nextSetNumber,
            completedAt: nextCompletedAt,
          });
        }
      }

      await ctx.db.patch("workoutExercises", row._id, {
        workoutStatus: "completed",
        completedAt: finishedAt,
        orderIndex: keptOrderIndex,
      });
      keptOrderIndex += 1;
    }

    await ctx.db.patch("workouts", workout._id, {
      status: "completed",
      finishedAt,
      restTimerEndsAt: undefined,
      ...(validatedTitle !== undefined ? { title: validatedTitle } : {}),
      ...(hasNotesArg ? { notes: validatedNotes } : {}),
    });

    if (ownedTemplate !== null) {
      await ctx.db.patch("workoutTemplates", ownedTemplate._id, {
        lastPerformedAt: finishedAt,
      });
    }

    return {
      workoutId: workout._id,
      finishedAt,
      completedSetsCount,
      templateUpdated,
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
