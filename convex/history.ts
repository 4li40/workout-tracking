import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import {
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_SETS,
  SET_TYPE_META,
  WEIGHT_EPSILON_KG,
} from "./lib/workouts";

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;

const historyWorkoutSummaryValidator = v.object({
  _id: v.id("workouts"),
  title: v.string(),
  templateId: v.optional(v.id("workoutTemplates")),
  startedAt: v.number(),
  finishedAt: v.number(),
  durationMs: v.number(),
  notes: v.optional(v.string()),
  exerciseCount: v.number(),
  workingSetCount: v.number(),
  totalCompletedSetCount: v.number(),
  workingVolumeKg: v.number(),
  bodyweightWorkingReps: v.number(),
  prCount: v.number(),
  exerciseNames: v.array(v.string()),
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(historyWorkoutSummaryValidator),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const rawLimit = args.limit ?? DEFAULT_HISTORY_LIMIT;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.trunc(rawLimit)))
      : DEFAULT_HISTORY_LIMIT;

    const workouts = (
      await ctx.db
        .query("workouts")
        .withIndex("by_user_finishedAt", (q) =>
          q.eq("userId", userId).gt("finishedAt", 0),
        )
        .order("desc")
        .take(limit)
    ).filter(
      (workout): workout is Doc<"workouts"> & { finishedAt: number } =>
        workout.status === "completed" && workout.finishedAt !== undefined,
    );

    if (workouts.length === 0) {
      return [];
    }

    const workoutDetails = await Promise.all(
      workouts.map(async (workout) => {
        const [exerciseRows, setRows] = await Promise.all([
          ctx.db
            .query("workoutExercises")
            .withIndex("by_workout_order", (q) =>
              q.eq("workoutId", workout._id),
            )
            .take(MAX_WORKOUT_EXERCISES),
          ctx.db
            .query("sets")
            .withIndex("by_workout", (q) => q.eq("workoutId", workout._id))
            .take(MAX_WORKOUT_SETS),
        ]);

        return {
          workout,
          exerciseRows: exerciseRows.filter((row) => row.userId === userId),
          setRows: setRows.filter(
            (row) => row.userId === userId && row.completed,
          ),
        };
      }),
    );

    const uniqueExerciseIds = new Set<Id<"exercises">>();
    for (const detail of workoutDetails) {
      for (const row of detail.exerciseRows) {
        uniqueExerciseIds.add(row.exerciseId);
      }
      for (const setDoc of detail.setRows) {
        uniqueExerciseIds.add(setDoc.exerciseId);
      }
    }

    const exerciseMap = new Map<Id<"exercises">, Doc<"exercises">>();
    const fetchedExercises = await Promise.all(
      Array.from(uniqueExerciseIds).map(async (exerciseId) => ({
        exerciseId,
        doc: await ctx.db.get("exercises", exerciseId),
      })),
    );
    for (const { exerciseId, doc } of fetchedExercises) {
      if (doc !== null && (doc.userId === undefined || doc.userId === userId)) {
        exerciseMap.set(exerciseId, doc);
      }
    }

    return workoutDetails.map(({ workout, exerciseRows, setRows }) => {
      const exerciseNames: string[] = [];
      let prCount = 0;

      for (const row of exerciseRows) {
        const exercise = exerciseMap.get(row.exerciseId);
        if (exercise !== undefined) {
          exerciseNames.push(exercise.name);
        }
        prCount += row.prTypes?.length ?? 0;
      }

      let workingSetCount = 0;
      let workingVolumeKg = 0;
      let bodyweightWorkingReps = 0;

      for (const setDoc of setRows) {
        if (!SET_TYPE_META[setDoc.setType].countsTowardVolumeAndProgression) {
          continue;
        }
        workingSetCount += 1;
        if (setDoc.weightKg > WEIGHT_EPSILON_KG) {
          workingVolumeKg += setDoc.weightKg * setDoc.reps;
        } else {
          const exercise = exerciseMap.get(setDoc.exerciseId);
          if (exercise?.isBodyweight === true) {
            bodyweightWorkingReps += setDoc.reps;
          }
        }
      }

      return {
        _id: workout._id,
        title: workout.title,
        ...(workout.templateId !== undefined
          ? { templateId: workout.templateId }
          : {}),
        startedAt: workout.startedAt,
        finishedAt: workout.finishedAt,
        durationMs: Math.max(0, workout.finishedAt - workout.startedAt),
        ...(workout.notes !== undefined ? { notes: workout.notes } : {}),
        exerciseCount: exerciseNames.length,
        workingSetCount,
        totalCompletedSetCount: setRows.length,
        workingVolumeKg,
        bodyweightWorkingReps,
        prCount,
        exerciseNames,
      };
    });
  },
});
