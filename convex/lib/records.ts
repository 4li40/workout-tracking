import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  computeExerciseRecordTimeline,
  type ExerciseSessionInput,
} from "./prEngine";
import type { PrType } from "./validators";

function prTypesEqual(
  stored: readonly PrType[] | undefined,
  expected: readonly PrType[],
): boolean {
  if (stored === undefined || stored.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < stored.length; index += 1) {
    if (stored[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

export async function recomputeExerciseRecords(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseIds: Iterable<Id<"exercises">>,
): Promise<Map<Id<"exercises">, Map<Id<"workouts">, readonly PrType[]>>> {
  const uniqueExerciseIds = Array.from(new Set(exerciseIds));
  const result = new Map<
    Id<"exercises">,
    Map<Id<"workouts">, readonly PrType[]>
  >();
  const now = Date.now();

  for (const exerciseId of uniqueExerciseIds) {
    const [exercise, existingRecord] = await Promise.all([
      ctx.db.get("exercises", exerciseId),
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", exerciseId),
        )
        .unique(),
    ]);

    const workoutEntries = new Map<
      Id<"workouts">,
      { completedAt: number; rows: Doc<"workoutExercises">[] }
    >();

    for await (const row of ctx.db
      .query("workoutExercises")
      .withIndex("by_user_exercise_completedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("exerciseId", exerciseId)
          .gt("completedAt", 0),
      )) {
      if (row.workoutStatus !== "completed" || row.completedAt === undefined) {
        continue;
      }
      const existing = workoutEntries.get(row.workoutId);
      if (existing !== undefined) {
        existing.rows.push(row);
        if (row.completedAt > existing.completedAt) {
          existing.completedAt = row.completedAt;
        }
      } else {
        workoutEntries.set(row.workoutId, {
          completedAt: row.completedAt,
          rows: [row],
        });
      }
    }

    const exercisePrMap = new Map<Id<"workouts">, readonly PrType[]>();
    result.set(exerciseId, exercisePrMap);

    if (
      exercise === null ||
      (exercise.userId !== undefined && exercise.userId !== userId) ||
      workoutEntries.size === 0
    ) {
      if (existingRecord !== null) {
        await ctx.db.delete("exerciseRecords", existingRecord._id);
      }
      for (const entry of workoutEntries.values()) {
        for (const row of entry.rows) {
          if (!prTypesEqual(row.prTypes, [])) {
            await ctx.db.patch("workoutExercises", row._id, { prTypes: [] });
          }
        }
      }
      continue;
    }

    const setsByWorkoutId = new Map<Id<"workouts">, Doc<"sets">[]>();
    for await (const setDoc of ctx.db
      .query("sets")
      .withIndex("by_user_exercise_completedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("exerciseId", exerciseId)
          .gt("completedAt", 0),
      )) {
      if (!setDoc.completed || !workoutEntries.has(setDoc.workoutId)) {
        continue;
      }
      const list = setsByWorkoutId.get(setDoc.workoutId);
      if (list !== undefined) {
        list.push(setDoc);
      } else {
        setsByWorkoutId.set(setDoc.workoutId, [setDoc]);
      }
    }

    const sessions: ExerciseSessionInput[] = [];
    for (const [workoutId, entry] of workoutEntries) {
      sessions.push({
        workoutId,
        completedAt: entry.completedAt,
        sets: setsByWorkoutId.get(workoutId) ?? [],
      });
    }

    const { record, prTypesByWorkoutId } = computeExerciseRecordTimeline(
      sessions,
      exercise.isBodyweight,
    );

    if (record === null) {
      if (existingRecord !== null) {
        await ctx.db.delete("exerciseRecords", existingRecord._id);
      }
    } else {
      const nextRecord = {
        userId,
        exerciseId,
        ...(record.bestWeightKg !== undefined
          ? { bestWeightKg: record.bestWeightKg }
          : {}),
        ...(record.bestE1rmKg !== undefined
          ? { bestE1rmKg: record.bestE1rmKg }
          : {}),
        ...(record.bestSessionVolumeKg !== undefined
          ? { bestSessionVolumeKg: record.bestSessionVolumeKg }
          : {}),
        ...(record.bestBodyweightReps !== undefined
          ? { bestBodyweightReps: record.bestBodyweightReps }
          : {}),
        ...(record.bestBodyweightSessionReps !== undefined
          ? { bestBodyweightSessionReps: record.bestBodyweightSessionReps }
          : {}),
        updatedAt: now,
      };

      if (existingRecord !== null) {
        await ctx.db.replace("exerciseRecords", existingRecord._id, nextRecord);
      } else {
        await ctx.db.insert("exerciseRecords", nextRecord);
      }
    }

    for (const [workoutId, entry] of workoutEntries) {
      const computedPrTypes = prTypesByWorkoutId.get(workoutId) ?? [];
      exercisePrMap.set(workoutId, computedPrTypes);

      entry.rows.sort(
        (a, b) =>
          a.orderIndex - b.orderIndex || a._creationTime - b._creationTime,
      );

      for (const [index, row] of entry.rows.entries()) {
        const expected: readonly PrType[] = index === 0 ? computedPrTypes : [];
        if (!prTypesEqual(row.prTypes, expected)) {
          await ctx.db.patch("workoutExercises", row._id, {
            prTypes: [...expected],
          });
        }
      }
    }
  }

  return result;
}
