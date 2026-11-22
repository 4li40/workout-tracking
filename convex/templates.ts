import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { equipmentValidator, muscleGroupValidator } from "./lib/validators";

const TEMPLATES_LIST_LIMIT = 100;
const TEMPLATE_EXERCISES_LIMIT = 50;

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

export const list = query({
  args: {},
  returns: v.array(workoutTemplateListItemValidator),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const templates = await ctx.db
      .query("workoutTemplates")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .take(TEMPLATES_LIST_LIMIT);

    const templateExerciseGroups = await Promise.all(
      templates.map((template) =>
        ctx.db
          .query("templateExercises")
          .withIndex("by_template_order", (q) =>
            q.eq("templateId", template._id),
          )
          .take(TEMPLATE_EXERCISES_LIMIT),
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
  },
});
