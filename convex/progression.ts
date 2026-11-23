import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAuthUserId, requireReadableExercise } from "./lib/auth";
import {
  GLOBAL_EXERCISES_LIST_LIMIT,
  MAX_CUSTOM_EXERCISES_PER_USER,
} from "./lib/exercises";
import {
  computeExerciseRecordTimeline,
  computeNextSessionTarget,
  type ExerciseSessionInput,
} from "./lib/prEngine";
import { DEFAULT_WEIGHT_UNIT } from "./lib/settings";
import {
  equipmentValidator,
  muscleGroupValidator,
  prTypeValidator,
  weightUnitValidator,
} from "./lib/validators";
import { MAX_SETS_PER_EXERCISE } from "./lib/workouts";

const exerciseRecordValidator = v.object({
  bestWeightKg: v.optional(v.number()),
  bestE1rmKg: v.optional(v.number()),
  bestSessionVolumeKg: v.optional(v.number()),
  bestBodyweightReps: v.optional(v.number()),
  bestBodyweightSessionReps: v.optional(v.number()),
  updatedAt: v.number(),
});

const nextSessionTargetValidator = v.union(
  v.object({
    kind: v.literal("weight"),
    targetWeightKg: v.number(),
    previousWeightKg: v.number(),
    previousReps: v.number(),
    incrementDisplay: v.number(),
    isAddedLoad: v.boolean(),
  }),
  v.object({
    kind: v.literal("bodyweight_reps"),
    targetReps: v.number(),
    previousReps: v.number(),
  }),
);

const overviewExerciseValidator = v.object({
  _id: v.id("exercises"),
  name: v.string(),
  muscleGroup: muscleGroupValidator,
  equipment: equipmentValidator,
  isBodyweight: v.boolean(),
  isCustom: v.boolean(),
  record: v.union(exerciseRecordValidator, v.null()),
  lastPerformedAt: v.union(v.number(), v.null()),
  sessionCount: v.number(),
  nextTarget: v.union(nextSessionTargetValidator, v.null()),
});

const timelinePointValidator = v.object({
  workoutId: v.id("workouts"),
  completedAt: v.number(),
  workoutTitle: v.string(),
  workingSetCount: v.number(),
  bestWeightKg: v.union(v.number(), v.null()),
  bestE1rmKg: v.union(v.number(), v.null()),
  sessionVolumeKg: v.union(v.number(), v.null()),
  bestBodyweightReps: v.union(v.number(), v.null()),
  bodyweightSessionReps: v.union(v.number(), v.null()),
  maxRepsPerSet: v.union(v.number(), v.null()),
  achievedPrs: v.array(prTypeValidator),
});

const exerciseDetailValidator = v.object({
  unit: weightUnitValidator,
  exercise: v.object({
    _id: v.id("exercises"),
    name: v.string(),
    muscleGroup: muscleGroupValidator,
    equipment: equipmentValidator,
    isBodyweight: v.boolean(),
    isCustom: v.boolean(),
  }),
  stickyNote: v.optional(v.string()),
  record: v.union(exerciseRecordValidator, v.null()),
  nextTarget: v.union(nextSessionTargetValidator, v.null()),
  timeline: v.array(timelinePointValidator),
  totalSessions: v.number(),
});

function formatRecordDoc(doc: Doc<"exerciseRecords">) {
  return {
    ...(doc.bestWeightKg !== undefined
      ? { bestWeightKg: doc.bestWeightKg }
      : {}),
    ...(doc.bestE1rmKg !== undefined ? { bestE1rmKg: doc.bestE1rmKg } : {}),
    ...(doc.bestSessionVolumeKg !== undefined
      ? { bestSessionVolumeKg: doc.bestSessionVolumeKg }
      : {}),
    ...(doc.bestBodyweightReps !== undefined
      ? { bestBodyweightReps: doc.bestBodyweightReps }
      : {}),
    ...(doc.bestBodyweightSessionReps !== undefined
      ? { bestBodyweightSessionReps: doc.bestBodyweightSessionReps }
      : {}),
    updatedAt: doc.updatedAt,
  };
}

export const listOverview = query({
  args: {},
  returns: v.object({
    unit: weightUnitValidator,
    summary: v.object({
      trainedExerciseCount: v.number(),
      totalPrCount: v.number(),
      totalCompletedWorkouts: v.number(),
    }),
    exercises: v.array(overviewExerciseValidator),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const [settings, globalExercises, customExercises] = await Promise.all([
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", undefined))
        .take(GLOBAL_EXERCISES_LIST_LIMIT),
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(MAX_CUSTOM_EXERCISES_PER_USER),
    ]);

    const unit = settings?.unit ?? DEFAULT_WEIGHT_UNIT;

    const recordByExerciseId = new Map<
      Id<"exercises">,
      Doc<"exerciseRecords">
    >();
    for await (const recordDoc of ctx.db
      .query("exerciseRecords")
      .withIndex("by_user_exercise", (q) => q.eq("userId", userId))) {
      recordByExerciseId.set(recordDoc.exerciseId, recordDoc);
    }

    let totalCompletedWorkouts = 0;
    for await (const workout of ctx.db
      .query("workouts")
      .withIndex("by_user_finishedAt", (q) =>
        q.eq("userId", userId).gt("finishedAt", 0),
      )) {
      if (workout.status === "completed" && workout.finishedAt !== undefined) {
        totalCompletedWorkouts += 1;
      }
    }

    let totalPrCount = 0;
    const exerciseActivity = new Map<
      Id<"exercises">,
      {
        workoutIds: Set<Id<"workouts">>;
        lastPerformedAt: number;
        latestWorkoutId: Id<"workouts">;
        latestWorkoutExerciseIds: Id<"workoutExercises">[];
      }
    >();

    for await (const row of ctx.db
      .query("workoutExercises")
      .withIndex("by_user_exercise_completedAt", (q) =>
        q.eq("userId", userId),
      )) {
      if (
        row.workoutStatus !== "completed" ||
        row.completedAt === undefined ||
        row.completedAt <= 0
      ) {
        continue;
      }

      totalPrCount += row.prTypes?.length ?? 0;

      const existing = exerciseActivity.get(row.exerciseId);
      if (existing === undefined) {
        exerciseActivity.set(row.exerciseId, {
          workoutIds: new Set([row.workoutId]),
          lastPerformedAt: row.completedAt,
          latestWorkoutId: row.workoutId,
          latestWorkoutExerciseIds: [row._id],
        });
      } else {
        existing.workoutIds.add(row.workoutId);
        if (
          row.completedAt > existing.lastPerformedAt ||
          (row.completedAt === existing.lastPerformedAt &&
            row.workoutId > existing.latestWorkoutId)
        ) {
          existing.lastPerformedAt = row.completedAt;
          existing.latestWorkoutId = row.workoutId;
          existing.latestWorkoutExerciseIds = [row._id];
        } else if (row.workoutId === existing.latestWorkoutId) {
          existing.latestWorkoutExerciseIds.push(row._id);
        }
      }
    }

    const allExercises: Doc<"exercises">[] = [
      ...globalExercises,
      ...customExercises,
    ];

    const latestSetsByExerciseId = new Map<Id<"exercises">, Doc<"sets">[]>();
    await Promise.all(
      allExercises.map(async (exercise) => {
        const activity = exerciseActivity.get(exercise._id);
        if (activity === undefined) {
          return;
        }
        const setGroups = await Promise.all(
          activity.latestWorkoutExerciseIds.map((workoutExerciseId) =>
            ctx.db
              .query("sets")
              .withIndex("by_workoutExercise_number", (q) =>
                q.eq("workoutExerciseId", workoutExerciseId),
              )
              .take(MAX_SETS_PER_EXERCISE),
          ),
        );
        const latestSets = setGroups
          .flat()
          .filter((setDoc) => setDoc.userId === userId && setDoc.completed);
        latestSetsByExerciseId.set(exercise._id, latestSets);
      }),
    );

    let trainedExerciseCount = 0;
    const exercises = allExercises.map((exercise) => {
      const activity = exerciseActivity.get(exercise._id);
      const recordDoc = recordByExerciseId.get(exercise._id);
      const sessionCount = activity?.workoutIds.size ?? 0;
      if (sessionCount > 0) {
        trainedExerciseCount += 1;
      }
      const latestSets = latestSetsByExerciseId.get(exercise._id) ?? [];
      const nextTarget =
        latestSets.length > 0
          ? computeNextSessionTarget(latestSets, unit, exercise.isBodyweight)
          : null;

      return {
        _id: exercise._id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        isCustom: exercise.userId !== undefined,
        record: recordDoc !== undefined ? formatRecordDoc(recordDoc) : null,
        lastPerformedAt: activity?.lastPerformedAt ?? null,
        sessionCount,
        nextTarget,
      };
    });

    exercises.sort((a, b) => {
      if (a.lastPerformedAt !== null && b.lastPerformedAt !== null) {
        if (b.lastPerformedAt !== a.lastPerformedAt) {
          return b.lastPerformedAt - a.lastPerformedAt;
        }
      } else if (a.lastPerformedAt !== null) {
        return -1;
      } else if (b.lastPerformedAt !== null) {
        return 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return {
      unit,
      summary: {
        trainedExerciseCount,
        totalPrCount,
        totalCompletedWorkouts,
      },
      exercises,
    };
  },
});

export const getExerciseDetail = query({
  args: {
    exerciseId: v.string(),
  },
  returns: v.union(exerciseDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const normalizedId = ctx.db.normalizeId("exercises", args.exerciseId);
    if (normalizedId === null) {
      return null;
    }

    const existing = await ctx.db.get("exercises", normalizedId);
    if (existing === null) {
      return null;
    }

    const exercise = await requireReadableExercise(ctx, normalizedId, userId);

    const [settings, stickyNoteDoc, recordDoc] = await Promise.all([
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("userExerciseNotes")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", exercise._id),
        )
        .unique(),
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", exercise._id),
        )
        .unique(),
    ]);

    const unit = settings?.unit ?? DEFAULT_WEIGHT_UNIT;

    const workoutCompletedAtById = new Map<Id<"workouts">, number>();
    for await (const row of ctx.db
      .query("workoutExercises")
      .withIndex("by_user_exercise_completedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("exerciseId", exercise._id)
          .gt("completedAt", 0),
      )) {
      if (row.workoutStatus !== "completed" || row.completedAt === undefined) {
        continue;
      }
      const existingCompletedAt = workoutCompletedAtById.get(row.workoutId);
      if (
        existingCompletedAt === undefined ||
        row.completedAt > existingCompletedAt
      ) {
        workoutCompletedAtById.set(row.workoutId, row.completedAt);
      }
    }

    const setsByWorkoutId = new Map<Id<"workouts">, Doc<"sets">[]>();
    if (workoutCompletedAtById.size > 0) {
      for await (const setDoc of ctx.db
        .query("sets")
        .withIndex("by_user_exercise_completedAt", (q) =>
          q
            .eq("userId", userId)
            .eq("exerciseId", exercise._id)
            .gt("completedAt", 0),
        )) {
        if (
          !setDoc.completed ||
          !workoutCompletedAtById.has(setDoc.workoutId)
        ) {
          continue;
        }
        const list = setsByWorkoutId.get(setDoc.workoutId);
        if (list !== undefined) {
          list.push(setDoc);
        } else {
          setsByWorkoutId.set(setDoc.workoutId, [setDoc]);
        }
      }
    }

    const workoutIds = Array.from(workoutCompletedAtById.keys());
    const workoutTitleById = new Map<Id<"workouts">, string>();
    const fetchedWorkouts = await Promise.all(
      workoutIds.map(async (workoutId) => ({
        workoutId,
        doc: await ctx.db.get("workouts", workoutId),
      })),
    );
    for (const { workoutId, doc } of fetchedWorkouts) {
      if (doc !== null && doc.userId === userId) {
        workoutTitleById.set(workoutId, doc.title);
      }
    }

    const sessions: ExerciseSessionInput[] = workoutIds.map((workoutId) => ({
      workoutId,
      completedAt: workoutCompletedAtById.get(workoutId) ?? 0,
      sets: setsByWorkoutId.get(workoutId) ?? [],
    }));

    const { timeline: rawTimeline } = computeExerciseRecordTimeline(
      sessions,
      exercise.isBodyweight,
    );

    const timeline = rawTimeline.map((point) => {
      const workoutId = point.workoutId as Id<"workouts">;
      return {
        workoutId,
        completedAt: point.completedAt,
        workoutTitle: workoutTitleById.get(workoutId) ?? "Workout",
        workingSetCount: point.workingSetCount,
        bestWeightKg: point.bestWeightKg,
        bestE1rmKg: point.bestE1rmKg,
        sessionVolumeKg: point.sessionVolumeKg,
        bestBodyweightReps: point.bestBodyweightReps,
        bodyweightSessionReps: point.bodyweightSessionReps,
        maxRepsPerSet: point.maxRepsPerSet,
        achievedPrs: [...point.achievedPrs],
      };
    });

    const latestPoint =
      timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const latestSets =
      latestPoint !== null
        ? (setsByWorkoutId.get(latestPoint.workoutId) ?? [])
        : [];
    const nextTarget =
      latestSets.length > 0
        ? computeNextSessionTarget(latestSets, unit, exercise.isBodyweight)
        : null;

    return {
      unit,
      exercise: {
        _id: exercise._id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
        isBodyweight: exercise.isBodyweight,
        isCustom: exercise.userId !== undefined,
      },
      ...(stickyNoteDoc !== null ? { stickyNote: stickyNoteDoc.notes } : {}),
      record: recordDoc !== null ? formatRecordDoc(recordDoc) : null,
      nextTarget,
      timeline,
      totalSessions: timeline.length,
    };
  },
});
