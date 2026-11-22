import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  requireAuthUserId,
  requireOwnedById,
  requireReadableExercise,
  requireUserOwnedDoc,
} from "./lib/auth";
import { DEFAULT_REST_SECONDS, parseRestSeconds } from "./lib/settings";
import {
  buildDuplicateTemplateTitle,
  DEFAULT_TARGET_REPS,
  DEFAULT_TARGET_SETS,
  MAX_TEMPLATE_EXERCISES,
  MAX_TEMPLATES_PER_USER,
  parseTargetReps,
  parseTargetSets,
  parseTemplateTitle,
  validatePermutation,
} from "./lib/templates";
import { equipmentValidator, muscleGroupValidator } from "./lib/validators";

const templateExerciseListItemValidator = v.object({
  _id: v.id("templateExercises"),
  exerciseId: v.id("exercises"),
  exerciseName: v.string(),
  muscleGroup: muscleGroupValidator,
  equipment: equipmentValidator,
  isBodyweight: v.boolean(),
  orderIndex: v.number(),
  targetSets: v.number(),
  targetReps: v.optional(v.string()),
  restSeconds: v.number(),
});

const workoutTemplateListItemValidator = v.object({
  _id: v.id("workoutTemplates"),
  title: v.string(),
  sortOrder: v.number(),
  lastPerformedAt: v.optional(v.number()),
  exercises: v.array(templateExerciseListItemValidator),
});

const templateExerciseInputValidator = v.object({
  exerciseId: v.id("exercises"),
  targetSets: v.number(),
  targetReps: v.optional(v.string()),
  restSeconds: v.number(),
});

async function hydrateTemplates(
  ctx: QueryCtx,
  userId: Id<"users">,
  templates: readonly Doc<"workoutTemplates">[],
) {
  const templateExerciseGroups = await Promise.all(
    templates.map((template) =>
      ctx.db
        .query("templateExercises")
        .withIndex("by_template_order", (q) => q.eq("templateId", template._id))
        .take(MAX_TEMPLATE_EXERCISES),
    ),
  );

  const uniqueExerciseIds = new Set<Id<"exercises">>();
  for (const group of templateExerciseGroups) {
    for (const templateExercise of group) {
      if (templateExercise.userId === userId) {
        uniqueExerciseIds.add(templateExercise.exerciseId);
      }
    }
  }

  const hydratedExercises = new Map<Id<"exercises">, Doc<"exercises">>();
  const fetchedExercises = await Promise.all(
    Array.from(uniqueExerciseIds, async (exerciseId) => ({
      exerciseId,
      doc: await ctx.db.get("exercises", exerciseId),
    })),
  );

  for (const { exerciseId, doc } of fetchedExercises) {
    if (doc !== null && (doc.userId === undefined || doc.userId === userId)) {
      hydratedExercises.set(exerciseId, doc);
    }
  }

  return templates.map((template, index) => {
    const exercises = [];
    for (const templateExercise of templateExerciseGroups[index]) {
      if (templateExercise.userId !== userId) {
        continue;
      }
      const exercise = hydratedExercises.get(templateExercise.exerciseId);
      if (exercise === undefined) {
        continue;
      }
      exercises.push({
        _id: templateExercise._id,
        exerciseId: templateExercise.exerciseId,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        orderIndex: templateExercise.orderIndex,
        targetSets: templateExercise.targetSets,
        ...(templateExercise.targetReps !== undefined
          ? { targetReps: templateExercise.targetReps }
          : {}),
        restSeconds: templateExercise.restSeconds,
      });
    }

    return {
      _id: template._id,
      title: template.title,
      sortOrder: template.sortOrder,
      ...(template.lastPerformedAt !== undefined
        ? { lastPerformedAt: template.lastPerformedAt }
        : {}),
      exercises,
    };
  });
}

function parseTemplateExerciseFields(input: {
  targetSets: number;
  targetReps: string | undefined;
  restSeconds: number;
}) {
  const parsedSets = parseTargetSets(input.targetSets);
  if (parsedSets.kind === "error") {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: parsedSets.message,
    });
  }

  const parsedReps = parseTargetReps(input.targetReps);
  if (parsedReps.kind === "error") {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: parsedReps.message,
    });
  }

  const parsedRest = parseRestSeconds(input.restSeconds);
  if (parsedRest.kind === "error") {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: parsedRest.message,
    });
  }

  return {
    targetSets: parsedSets.targetSets,
    targetReps: parsedReps.targetReps,
    restSeconds: parsedRest.seconds,
  };
}

export const list = query({
  args: {},
  returns: v.array(workoutTemplateListItemValidator),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const templates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(MAX_TEMPLATES_PER_USER);

    return await hydrateTemplates(ctx, userId, templates);
  },
});

export const get = query({
  args: {
    templateId: v.string(),
  },
  returns: v.union(workoutTemplateListItemValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const normalizedId = ctx.db.normalizeId(
      "workoutTemplates",
      args.templateId,
    );
    if (normalizedId === null) {
      return null;
    }

    const template = await ctx.db.get("workoutTemplates", normalizedId);
    if (template === null) {
      return null;
    }

    requireUserOwnedDoc(template, userId, "workoutTemplates");
    const hydrated = await hydrateTemplates(ctx, userId, [template]);
    return hydrated[0] ?? null;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    exercises: v.optional(v.array(templateExerciseInputValidator)),
  },
  returns: v.id("workoutTemplates"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const parsedTitle = parseTemplateTitle(args.title);
    if (parsedTitle.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedTitle.message,
      });
    }

    const existingTemplates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(MAX_TEMPLATES_PER_USER);

    if (existingTemplates.length >= MAX_TEMPLATES_PER_USER) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `You can create up to ${MAX_TEMPLATES_PER_USER} routines.`,
      });
    }

    const exerciseInputs = args.exercises ?? [];
    if (exerciseInputs.length > MAX_TEMPLATE_EXERCISES) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: `A routine can contain up to ${MAX_TEMPLATE_EXERCISES} exercises.`,
      });
    }

    const validatedExercises = [];
    for (const item of exerciseInputs) {
      await requireReadableExercise(ctx, item.exerciseId, userId);
      const parsedFields = parseTemplateExerciseFields({
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restSeconds: item.restSeconds,
      });
      validatedExercises.push({
        exerciseId: item.exerciseId,
        ...parsedFields,
      });
    }

    const sortOrder =
      existingTemplates.length === 0
        ? 0
        : existingTemplates[existingTemplates.length - 1].sortOrder + 1;

    const templateId = await ctx.db.insert("workoutTemplates", {
      userId,
      title: parsedTitle.title,
      sortOrder,
    });

    for (const [orderIndex, item] of validatedExercises.entries()) {
      await ctx.db.insert("templateExercises", {
        userId,
        templateId,
        exerciseId: item.exerciseId,
        orderIndex,
        targetSets: item.targetSets,
        ...(item.targetReps !== undefined
          ? { targetReps: item.targetReps }
          : {}),
        restSeconds: item.restSeconds,
      });
    }

    return templateId;
  },
});

export const updateTitle = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireOwnedById(ctx, "workoutTemplates", args.templateId, userId);

    const parsedTitle = parseTemplateTitle(args.title);
    if (parsedTitle.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedTitle.message,
      });
    }

    await ctx.db.patch("workoutTemplates", args.templateId, {
      title: parsedTitle.title,
    });

    return null;
  },
});

export const duplicate = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
  },
  returns: v.id("workoutTemplates"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const source = await requireOwnedById(
      ctx,
      "workoutTemplates",
      args.templateId,
      userId,
    );

    const existingTemplates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(MAX_TEMPLATES_PER_USER);

    if (existingTemplates.length >= MAX_TEMPLATES_PER_USER) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `You can create up to ${MAX_TEMPLATES_PER_USER} routines.`,
      });
    }

    const sourceExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template_order", (q) => q.eq("templateId", source._id))
      .take(MAX_TEMPLATE_EXERCISES);

    const ownedExercises = sourceExercises.filter(
      (row) => row.userId === userId,
    );
    const fetchedExercises = await Promise.all(
      ownedExercises.map((row) => ctx.db.get("exercises", row.exerciseId)),
    );

    const readableSourceExercises = ownedExercises.filter((_, index) => {
      const exercise = fetchedExercises[index];
      return (
        exercise !== null &&
        (exercise.userId === undefined || exercise.userId === userId)
      );
    });

    const sourceIndex = existingTemplates.findIndex(
      (template) => template._id === source._id,
    );
    const insertOrder =
      sourceIndex >= 0 ? sourceIndex + 1 : existingTemplates.length;

    const newTemplateId = await ctx.db.insert("workoutTemplates", {
      userId,
      title: buildDuplicateTemplateTitle(source.title),
      sortOrder: insertOrder,
    });

    for (const [index, template] of existingTemplates.entries()) {
      const expectedSortOrder = index < insertOrder ? index : index + 1;
      if (template.sortOrder !== expectedSortOrder) {
        await ctx.db.patch("workoutTemplates", template._id, {
          sortOrder: expectedSortOrder,
        });
      }
    }

    for (const [orderIndex, row] of readableSourceExercises.entries()) {
      await ctx.db.insert("templateExercises", {
        userId,
        templateId: newTemplateId,
        exerciseId: row.exerciseId,
        orderIndex,
        targetSets: row.targetSets,
        ...(row.targetReps !== undefined ? { targetReps: row.targetReps } : {}),
        restSeconds: row.restSeconds,
      });
    }

    return newTemplateId;
  },
});

export const reorder = mutation({
  args: {
    orderedTemplateIds: v.array(v.id("workoutTemplates")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const existingTemplates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(MAX_TEMPLATES_PER_USER);

    const validation = validatePermutation(
      existingTemplates.map((template) => template._id),
      args.orderedTemplateIds,
    );
    if (validation.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: validation.message,
      });
    }

    const existingById = new Map(
      existingTemplates.map((template) => [template._id, template]),
    );

    for (const [newIndex, templateId] of args.orderedTemplateIds.entries()) {
      const existing = existingById.get(templateId);
      if (existing !== undefined && existing.sortOrder !== newIndex) {
        await ctx.db.patch("workoutTemplates", templateId, {
          sortOrder: newIndex,
        });
      }
    }

    return null;
  },
});

export const remove = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireOwnedById(ctx, "workoutTemplates", args.templateId, userId);

    for await (const row of ctx.db
      .query("templateExercises")
      .withIndex("by_template_order", (q) =>
        q.eq("templateId", args.templateId),
      )) {
      if (row.userId === userId) {
        await ctx.db.delete("templateExercises", row._id);
      }
    }

    await ctx.db.delete("workoutTemplates", args.templateId);

    const remainingTemplates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(MAX_TEMPLATES_PER_USER);

    for (const [index, template] of remainingTemplates.entries()) {
      if (template.sortOrder !== index) {
        await ctx.db.patch("workoutTemplates", template._id, {
          sortOrder: index,
        });
      }
    }

    return null;
  },
});

export const addExercise = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    exerciseId: v.id("exercises"),
    targetSets: v.optional(v.number()),
    targetReps: v.optional(v.string()),
    restSeconds: v.optional(v.number()),
  },
  returns: v.id("templateExercises"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireOwnedById(ctx, "workoutTemplates", args.templateId, userId);
    await requireReadableExercise(ctx, args.exerciseId, userId);

    const existingRows = await ctx.db
      .query("templateExercises")
      .withIndex("by_template_order", (q) =>
        q.eq("templateId", args.templateId),
      )
      .take(MAX_TEMPLATE_EXERCISES);

    if (existingRows.length >= MAX_TEMPLATE_EXERCISES) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A routine can contain up to ${MAX_TEMPLATE_EXERCISES} exercises.`,
      });
    }

    let defaultRestSeconds = DEFAULT_REST_SECONDS;
    if (args.restSeconds === undefined) {
      const settings = await ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (
        settings !== null &&
        parseRestSeconds(settings.defaultRestSeconds).kind === "ok"
      ) {
        defaultRestSeconds = settings.defaultRestSeconds;
      }
    }

    const parsedFields = parseTemplateExerciseFields({
      targetSets: args.targetSets ?? DEFAULT_TARGET_SETS,
      targetReps:
        args.targetReps !== undefined ? args.targetReps : DEFAULT_TARGET_REPS,
      restSeconds: args.restSeconds ?? defaultRestSeconds,
    });

    const orderIndex =
      existingRows.length === 0
        ? 0
        : existingRows[existingRows.length - 1].orderIndex + 1;

    return await ctx.db.insert("templateExercises", {
      userId,
      templateId: args.templateId,
      exerciseId: args.exerciseId,
      orderIndex,
      targetSets: parsedFields.targetSets,
      ...(parsedFields.targetReps !== undefined
        ? { targetReps: parsedFields.targetReps }
        : {}),
      restSeconds: parsedFields.restSeconds,
    });
  },
});

export const updateExercise = mutation({
  args: {
    templateExerciseId: v.id("templateExercises"),
    targetSets: v.number(),
    targetReps: v.optional(v.string()),
    restSeconds: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await requireOwnedById(
      ctx,
      "templateExercises",
      args.templateExerciseId,
      userId,
    );
    await requireOwnedById(ctx, "workoutTemplates", row.templateId, userId);

    const parsedFields = parseTemplateExerciseFields({
      targetSets: args.targetSets,
      targetReps: args.targetReps,
      restSeconds: args.restSeconds,
    });

    await ctx.db.patch("templateExercises", args.templateExerciseId, {
      targetSets: parsedFields.targetSets,
      targetReps: parsedFields.targetReps,
      restSeconds: parsedFields.restSeconds,
    });

    return null;
  },
});

export const removeExercise = mutation({
  args: {
    templateExerciseId: v.id("templateExercises"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await requireOwnedById(
      ctx,
      "templateExercises",
      args.templateExerciseId,
      userId,
    );
    await requireOwnedById(ctx, "workoutTemplates", row.templateId, userId);

    await ctx.db.delete("templateExercises", args.templateExerciseId);

    const remainingRows = await ctx.db
      .query("templateExercises")
      .withIndex("by_template_order", (q) => q.eq("templateId", row.templateId))
      .take(MAX_TEMPLATE_EXERCISES);

    const ownedRemaining = remainingRows.filter(
      (item) => item.userId === userId,
    );
    for (const [index, item] of ownedRemaining.entries()) {
      if (item.orderIndex !== index) {
        await ctx.db.patch("templateExercises", item._id, {
          orderIndex: index,
        });
      }
    }

    return null;
  },
});

export const reorderExercises = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    orderedTemplateExerciseIds: v.array(v.id("templateExercises")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireOwnedById(ctx, "workoutTemplates", args.templateId, userId);

    const existingRows = (
      await ctx.db
        .query("templateExercises")
        .withIndex("by_template_order", (q) =>
          q.eq("templateId", args.templateId),
        )
        .take(MAX_TEMPLATE_EXERCISES)
    ).filter((row) => row.userId === userId);

    const validation = validatePermutation(
      existingRows.map((row) => row._id),
      args.orderedTemplateExerciseIds,
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
      templateExerciseId,
    ] of args.orderedTemplateExerciseIds.entries()) {
      const existing = existingById.get(templateExerciseId);
      if (existing !== undefined && existing.orderIndex !== newIndex) {
        await ctx.db.patch("templateExercises", templateExerciseId, {
          orderIndex: newIndex,
        });
      }
    }

    return null;
  },
});
