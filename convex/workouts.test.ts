/// <reference types="vite/client" />

import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function createTestConvex() {
  const t = convexTest(schema, modules);
  registerCore(t);
  return t;
}

async function createAuthenticatedUser(
  t: ReturnType<typeof createTestConvex>,
  username: string,
) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const tokens = await t.mutation(
    components.auth.public._internal_dangerous_signIn,
    {
      claims: { method: "usernamePassword", profile: { username } },
      componentPath: "authPassword",
      userId,
      accessTokenTtlSeconds: 60,
      refreshInactivityTimeoutSeconds: 3600,
      sessionMaxLifetimeSeconds: 3600,
    },
  );
  const authed = t.withIdentity(sessionIdentity(tokens));
  return { authed, userId };
}

async function seedGlobalExercise(
  t: ReturnType<typeof createTestConvex>,
  input: {
    slug: string;
    name: string;
    muscleGroup: "chest" | "back" | "quads";
    equipment: "barbell" | "bodyweight";
    isBodyweight: boolean;
  },
): Promise<Id<"exercises">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("exercises", {
      slug: input.slug,
      name: input.name,
      muscleGroup: input.muscleGroup,
      equipment: input.equipment,
      isBodyweight: input.isBodyweight,
    });
  });
}

async function logAndFinishWorkout(
  authed: ReturnType<ReturnType<typeof createTestConvex>["withIdentity"]>,
  input: {
    title: string;
    templateId?: Id<"workoutTemplates">;
    exercises: Array<{
      exerciseId: Id<"exercises">;
      sets: Array<{
        setType: "warmup" | "working" | "drop" | "failure";
        weightKg: number;
        reps: number;
        completed?: boolean;
      }>;
    }>;
  },
) {
  const started = await authed.mutation(
    api.workouts.startWorkout,
    input.templateId !== undefined
      ? { templateId: input.templateId }
      : { title: input.title },
  );
  if (started.kind !== "started") {
    throw new Error("Expected new workout to start.");
  }

  for (const exerciseEntry of input.exercises) {
    const added = await authed.mutation(api.workouts.addWorkoutExercise, {
      workoutId: started.workoutId,
      exerciseId: exerciseEntry.exerciseId,
    });

    for (const [index, setEntry] of exerciseEntry.sets.entries()) {
      await authed.mutation(api.workouts.upsertSet, {
        workoutExerciseId: added.workoutExerciseId,
        ...(index === 0 ? { setId: added.setId } : {}),
        setType: setEntry.setType,
        weightKg: setEntry.weightKg,
        enteredUnit: "kg",
        reps: setEntry.reps,
        completed: setEntry.completed ?? true,
        autoStartRestTimer: false,
      });
    }
  }

  return await authed.mutation(api.workouts.finishWorkout, {
    workoutId: started.workoutId,
    title: input.title,
  });
}

describe("PR engine, record recomputation, history, and progression", () => {
  it("populates exerciseRecords on finishWorkout and only flags metrics that strictly beat prior sessions", async () => {
    const t = createTestConvex();
    const { authed, userId } = await createAuthenticatedUser(t, "alice_prs");
    const benchId = await seedGlobalExercise(t, {
      slug: "barbell-bench-press",
      name: "Barbell Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    });

    const first = await logAndFinishWorkout(authed, {
      title: "Push 1",
      exercises: [
        {
          exerciseId: benchId,
          sets: [
            { setType: "warmup", weightKg: 120, reps: 10 },
            { setType: "working", weightKg: 80, reps: 8 },
            { setType: "working", weightKg: 80, reps: 8 },
          ],
        },
      ],
    });

    expect(first.prCount).toBe(3);
    expect(first.achievedPrs).toEqual([
      {
        exerciseId: benchId,
        prTypes: ["weight", "e1rm", "session_volume"],
      },
    ]);

    const firstDetail = await authed.query(api.workouts.get, {
      workoutId: first.workoutId,
    });
    expect(firstDetail?.totalPrCount).toBe(3);
    expect(firstDetail?.exercises[0]?.prTypes).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);

    const second = await logAndFinishWorkout(authed, {
      title: "Push 2",
      exercises: [
        {
          exerciseId: benchId,
          sets: [{ setType: "working", weightKg: 100, reps: 3 }],
        },
      ],
    });

    expect(second.prCount).toBe(2);
    expect(second.achievedPrs).toEqual([
      {
        exerciseId: benchId,
        prTypes: ["weight", "e1rm"],
      },
    ]);

    const third = await logAndFinishWorkout(authed, {
      title: "Push 3",
      exercises: [
        {
          exerciseId: benchId,
          sets: [
            { setType: "working", weightKg: 85, reps: 8 },
            { setType: "working", weightKg: 85, reps: 8 },
          ],
        },
      ],
    });

    expect(third.prCount).toBe(1);
    expect(third.achievedPrs).toEqual([
      {
        exerciseId: benchId,
        prTypes: ["session_volume"],
      },
    ]);

    const record = await t.run(async (ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", benchId),
        )
        .unique(),
    );
    expect(record?.bestWeightKg).toBe(100);
    expect(record?.bestE1rmKg).toBeCloseTo(100 * (1 + 3 / 30), 6);
    expect(record?.bestSessionVolumeKg).toBe(1360);

    const history = await authed.query(api.history.list, {});
    expect(history).toHaveLength(3);
    expect(history.map((item) => item.title)).toEqual([
      "Push 3",
      "Push 2",
      "Push 1",
    ]);
    expect(history.map((item) => item.prCount)).toEqual([1, 2, 3]);
    expect(history[2].workingSetCount).toBe(2);
    expect(history[2].totalCompletedSetCount).toBe(3);
    expect(history[2].workingVolumeKg).toBe(1280);

    const overview = await authed.query(api.progression.listOverview, {});
    expect(overview.summary).toEqual({
      trainedExerciseCount: 1,
      totalPrCount: 6,
      totalCompletedWorkouts: 3,
    });
    expect(overview.exercises[0]?.nextTarget).toEqual({
      kind: "weight",
      targetWeightKg: 87.5,
      previousWeightKg: 85,
      previousReps: 8,
      incrementDisplay: 2.5,
      isAddedLoad: false,
    });

    const detail = await authed.query(api.progression.getExerciseDetail, {
      exerciseId: benchId,
    });
    expect(detail?.totalSessions).toBe(3);
    expect(detail?.timeline.map((point) => point.workoutTitle)).toEqual([
      "Push 1",
      "Push 2",
      "Push 3",
    ]);
    expect(detail?.timeline.map((point) => point.achievedPrs)).toEqual([
      ["weight", "e1rm", "session_volume"],
      ["weight", "e1rm"],
      ["session_volume"],
    ]);
  });

  it("recalculates exerciseRecords and historical prTypes cleanly on updateCompletedWorkout", async () => {
    const t = createTestConvex();
    const { authed, userId } = await createAuthenticatedUser(t, "alice_edit");
    const benchId = await seedGlobalExercise(t, {
      slug: "bench",
      name: "Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    });
    const squatId = await seedGlobalExercise(t, {
      slug: "squat",
      name: "Back Squat",
      muscleGroup: "quads",
      equipment: "barbell",
      isBodyweight: false,
    });

    const w1 = await logAndFinishWorkout(authed, {
      title: "Session 1",
      exercises: [
        {
          exerciseId: benchId,
          sets: [{ setType: "working", weightKg: 120, reps: 5 }],
        },
      ],
    });
    const w2 = await logAndFinishWorkout(authed, {
      title: "Session 2",
      exercises: [
        {
          exerciseId: benchId,
          sets: [{ setType: "working", weightKg: 100, reps: 5 }],
        },
      ],
    });

    const w2Before = await authed.query(api.workouts.get, {
      workoutId: w2.workoutId,
    });
    expect(w2Before?.totalPrCount).toBe(0);

    await authed.mutation(api.workouts.updateCompletedWorkout, {
      workoutId: w1.workoutId,
      title: "Session 1 (Edited)",
      notes: "Fixed typo in weight",
      startedAt: w1.finishedAt - 1800_000,
      finishedAt: w1.finishedAt,
      exercises: [
        {
          exerciseId: benchId,
          restSeconds: 120,
          sets: [
            { setType: "working", weightKg: 90, enteredUnit: "kg", reps: 5 },
          ],
        },
      ],
    });

    const w2After = await authed.query(api.workouts.get, {
      workoutId: w2.workoutId,
    });
    expect(w2After?.totalPrCount).toBe(3);
    expect(w2After?.exercises[0]?.prTypes).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);

    const benchRecordAfterLower = await t.run(async (ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", benchId),
        )
        .unique(),
    );
    expect(benchRecordAfterLower?.bestWeightKg).toBe(100);

    await authed.mutation(api.workouts.updateCompletedWorkout, {
      workoutId: w1.workoutId,
      title: "Session 1 (Swapped)",
      startedAt: w1.finishedAt - 1800_000,
      finishedAt: w1.finishedAt,
      exercises: [
        {
          exerciseId: squatId,
          restSeconds: 150,
          sets: [
            { setType: "working", weightKg: 140, enteredUnit: "kg", reps: 5 },
          ],
        },
      ],
    });

    const [benchDetail, squatDetail] = await Promise.all([
      authed.query(api.progression.getExerciseDetail, { exerciseId: benchId }),
      authed.query(api.progression.getExerciseDetail, { exerciseId: squatId }),
    ]);

    expect(benchDetail?.totalSessions).toBe(1);
    expect(benchDetail?.record?.bestWeightKg).toBe(100);
    expect(squatDetail?.totalSessions).toBe(1);
    expect(squatDetail?.record?.bestWeightKg).toBe(140);

    await authed.mutation(api.workouts.updateCompletedWorkout, {
      workoutId: w1.workoutId,
      title: "Session 1 (Back to Bench)",
      startedAt: w1.finishedAt - 1800_000,
      finishedAt: w1.finishedAt,
      exercises: [
        {
          exerciseId: benchId,
          restSeconds: 120,
          sets: [
            { setType: "working", weightKg: 80, enteredUnit: "kg", reps: 5 },
          ],
        },
      ],
    });

    const squatRecordAfterRemoval = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", squatId),
        )
        .unique(),
    );
    expect(squatRecordAfterRemoval).toBeNull();
  });

  it("recalculates and deletes exerciseRecords and refreshes template lastPerformedAt on deleteCompletedWorkout", async () => {
    const t = createTestConvex();
    const { authed, userId } = await createAuthenticatedUser(t, "alice_delete");
    const benchId = await seedGlobalExercise(t, {
      slug: "bench-del",
      name: "Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    });

    const templateId = await authed.mutation(api.templates.create, {
      title: "Upper A",
      exercises: [{ exerciseId: benchId, targetSets: 1, restSeconds: 90 }],
    });

    const started1 = await authed.mutation(api.workouts.startWorkout, {
      templateId,
    });
    if (started1.kind !== "started") throw new Error("Expected start 1");
    const detail1 = await authed.query(api.workouts.get, {
      workoutId: started1.workoutId,
    });
    const ex1 = detail1!.exercises[0];
    await authed.mutation(api.workouts.upsertSet, {
      workoutExerciseId: ex1._id,
      setId: ex1.sets[0]._id,
      setType: "working",
      weightKg: 80,
      enteredUnit: "kg",
      reps: 8,
      completed: true,
      autoStartRestTimer: false,
    });
    const w1 = await authed.mutation(api.workouts.finishWorkout, {
      workoutId: started1.workoutId,
    });

    const started2 = await authed.mutation(api.workouts.startWorkout, {
      templateId,
    });
    if (started2.kind !== "started") throw new Error("Expected start 2");
    const detail2 = await authed.query(api.workouts.get, {
      workoutId: started2.workoutId,
    });
    const ex2 = detail2!.exercises[0];
    await authed.mutation(api.workouts.upsertSet, {
      workoutExerciseId: ex2._id,
      setId: ex2.sets[0]._id,
      setType: "working",
      weightKg: 100,
      enteredUnit: "kg",
      reps: 5,
      completed: true,
      autoStartRestTimer: false,
    });
    const w2 = await authed.mutation(api.workouts.finishWorkout, {
      workoutId: started2.workoutId,
    });

    const templateBeforeDelete = await t.run((ctx) =>
      ctx.db.get("workoutTemplates", templateId),
    );
    expect(templateBeforeDelete?.lastPerformedAt).toBe(w2.finishedAt);

    await authed.mutation(api.workouts.deleteCompletedWorkout, {
      workoutId: w2.workoutId,
    });

    const recordAfterFirstDelete = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", benchId),
        )
        .unique(),
    );
    expect(recordAfterFirstDelete?.bestWeightKg).toBe(80);

    const templateAfterFirstDelete = await t.run((ctx) =>
      ctx.db.get("workoutTemplates", templateId),
    );
    expect(templateAfterFirstDelete?.lastPerformedAt).toBe(w1.finishedAt);

    await authed.mutation(api.workouts.deleteCompletedWorkout, {
      workoutId: w1.workoutId,
    });

    const recordAfterFinalDelete = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", benchId),
        )
        .unique(),
    );
    expect(recordAfterFinalDelete).toBeNull();

    const templateAfterFinalDelete = await t.run((ctx) =>
      ctx.db.get("workoutTemplates", templateId),
    );
    expect(templateAfterFinalDelete?.lastPerformedAt).toBeUndefined();
  });

  it("tracks bodyweight rep PRs, excludes warmups, and recomputes on isBodyweight toggle", async () => {
    const t = createTestConvex();
    const { authed, userId } = await createAuthenticatedUser(t, "alice_bw");

    const pullupId = await authed.mutation(api.exercises.create, {
      name: "Ring Pull-Up",
      muscleGroup: "back",
      equipment: "bodyweight",
      isBodyweight: true,
    });

    const finishResult = await logAndFinishWorkout(authed, {
      title: "Pull Day",
      exercises: [
        {
          exerciseId: pullupId,
          sets: [
            { setType: "warmup", weightKg: 0, reps: 20 },
            { setType: "working", weightKg: 0, reps: 10 },
            { setType: "working", weightKg: 0, reps: 12 },
          ],
        },
      ],
    });

    expect(finishResult.prCount).toBe(2);
    expect(finishResult.achievedPrs).toEqual([
      {
        exerciseId: pullupId,
        prTypes: ["bodyweight_reps", "bodyweight_session_reps"],
      },
    ]);

    const bwRecord = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", pullupId),
        )
        .unique(),
    );
    expect(bwRecord?.bestBodyweightReps).toBe(12);
    expect(bwRecord?.bestBodyweightSessionReps).toBe(22);
    expect(bwRecord?.bestWeightKg).toBeUndefined();

    const detail = await authed.query(api.progression.getExerciseDetail, {
      exerciseId: pullupId,
    });
    expect(detail?.nextTarget).toEqual({
      kind: "bodyweight_reps",
      targetReps: 13,
      previousReps: 12,
    });

    await authed.mutation(api.exercises.update, {
      exerciseId: pullupId,
      name: "Ring Pull-Up",
      muscleGroup: "back",
      equipment: "bodyweight",
      isBodyweight: false,
    });

    const recordWhenNotBodyweight = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", pullupId),
        )
        .unique(),
    );
    expect(recordWhenNotBodyweight).toBeNull();

    const workoutAfterToggle = await authed.query(api.workouts.get, {
      workoutId: finishResult.workoutId,
    });
    expect(workoutAfterToggle?.totalPrCount).toBe(0);

    await authed.mutation(api.exercises.update, {
      exerciseId: pullupId,
      name: "Ring Pull-Up",
      muscleGroup: "back",
      equipment: "bodyweight",
      isBodyweight: true,
    });

    const restoredRecord = await t.run((ctx) =>
      ctx.db
        .query("exerciseRecords")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", pullupId),
        )
        .unique(),
    );
    expect(restoredRecord?.bestBodyweightReps).toBe(12);
    expect(restoredRecord?.bestBodyweightSessionReps).toBe(22);
  });

  it("enforces strict multi-user isolation and authorization across workouts, history, and progression", async () => {
    const t = createTestConvex();
    await t.mutation(internal.seed.seedGlobalExercises, {});
    const { authed: alice, userId: aliceId } = await createAuthenticatedUser(
      t,
      "alice_iso",
    );
    const { authed: bob, userId: bobId } = await createAuthenticatedUser(
      t,
      "bob_iso",
    );

    const benchId = await seedGlobalExercise(t, {
      slug: "iso-bench",
      name: "Iso Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    });

    const alicePrivateExerciseId = await alice.mutation(api.exercises.create, {
      name: "Alice Secret Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    });

    const aliceWorkout = await logAndFinishWorkout(alice, {
      title: "Alice Push",
      exercises: [
        {
          exerciseId: benchId,
          sets: [{ setType: "working", weightKg: 100, reps: 5 }],
        },
        {
          exerciseId: alicePrivateExerciseId,
          sets: [{ setType: "working", weightKg: 60, reps: 10 }],
        },
      ],
    });

    const bobWorkout = await logAndFinishWorkout(bob, {
      title: "Bob Push",
      exercises: [
        {
          exerciseId: benchId,
          sets: [{ setType: "working", weightKg: 70, reps: 8 }],
        },
      ],
    });

    await expect(
      bob.query(api.workouts.get, { workoutId: aliceWorkout.workoutId }),
    ).rejects.toThrow(/FORBIDDEN|do not have access/i);

    await expect(
      bob.mutation(api.workouts.updateCompletedWorkout, {
        workoutId: aliceWorkout.workoutId,
        title: "Hacked",
        startedAt: aliceWorkout.finishedAt - 1000,
        finishedAt: aliceWorkout.finishedAt,
        exercises: [
          {
            exerciseId: benchId,
            restSeconds: 90,
            sets: [
              { setType: "working", weightKg: 50, enteredUnit: "kg", reps: 5 },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/FORBIDDEN|do not have access/i);

    await expect(
      bob.mutation(api.workouts.deleteCompletedWorkout, {
        workoutId: aliceWorkout.workoutId,
      }),
    ).rejects.toThrow(/FORBIDDEN|do not have access/i);

    await expect(
      bob.query(api.progression.getExerciseDetail, {
        exerciseId: alicePrivateExerciseId,
      }),
    ).rejects.toThrow(/FORBIDDEN|do not have access/i);

    expect(
      await bob.query(api.progression.getExerciseDetail, {
        exerciseId: "not-a-valid-id",
      }),
    ).toBeNull();

    const [aliceHistory, bobHistory, aliceOverview, bobOverview] =
      await Promise.all([
        alice.query(api.history.list, {}),
        bob.query(api.history.list, {}),
        alice.query(api.progression.listOverview, {}),
        bob.query(api.progression.listOverview, {}),
      ]);

    expect(aliceHistory.map((item) => item._id)).toEqual([
      aliceWorkout.workoutId,
    ]);
    expect(bobHistory.map((item) => item._id)).toEqual([bobWorkout.workoutId]);

    expect(aliceOverview.summary.totalCompletedWorkouts).toBe(1);
    expect(bobOverview.summary.totalCompletedWorkouts).toBe(1);
    expect(
      bobOverview.exercises.some((ex) => ex._id === alicePrivateExerciseId),
    ).toBe(false);

    const [aliceBenchRecord, bobBenchRecord] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db
          .query("exerciseRecords")
          .withIndex("by_user_exercise", (q) =>
            q.eq("userId", aliceId).eq("exerciseId", benchId),
          )
          .unique(),
        ctx.db
          .query("exerciseRecords")
          .withIndex("by_user_exercise", (q) =>
            q.eq("userId", bobId).eq("exerciseId", benchId),
          )
          .unique(),
      ]);
    });

    expect(aliceBenchRecord?.bestWeightKg).toBe(100);
    expect(bobBenchRecord?.bestWeightKg).toBe(70);

    await expect(t.query(api.history.list, {})).rejects.toThrow(
      /UNAUTHENTICATED|signed in/i,
    );
    await expect(t.query(api.progression.listOverview, {})).rejects.toThrow(
      /UNAUTHENTICATED|signed in/i,
    );
    await expect(
      t.query(api.progression.getExerciseDetail, { exerciseId: benchId }),
    ).rejects.toThrow(/UNAUTHENTICATED|signed in/i);
    await expect(
      t.mutation(api.workouts.deleteCompletedWorkout, {
        workoutId: aliceWorkout.workoutId,
      }),
    ).rejects.toThrow(/UNAUTHENTICATED|signed in/i);
  });
});
