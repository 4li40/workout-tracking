import { describe, expect, it } from "vitest";
import {
  computeEpleyE1rmKg,
  computeExerciseRecordTimeline,
  computeNextSessionTarget,
  E1RM_EPSILON_KG,
  VOLUME_EPSILON_KG,
  type ExerciseSessionInput,
} from "./lib/prEngine";
import {
  displayWeightToKg,
  kgToDisplayWeight,
  stepWeightKg,
  WEIGHT_EPSILON_KG,
} from "./lib/workouts";

describe("computeEpleyE1rmKg", () => {
  it("computes Epley e1RM = w * (1 + r / 30)", () => {
    expect(computeEpleyE1rmKg(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 6);
    expect(computeEpleyE1rmKg(80, 10)).toBeCloseTo(80 * (1 + 10 / 30), 6);
    expect(computeEpleyE1rmKg(60, 30)).toBeCloseTo(120, 6);
  });

  it("returns null for zero/epsilon weight, zero reps, or non-finite inputs", () => {
    expect(computeEpleyE1rmKg(0, 10)).toBeNull();
    expect(computeEpleyE1rmKg(WEIGHT_EPSILON_KG, 10)).toBeNull();
    expect(computeEpleyE1rmKg(100, 0)).toBeNull();
    expect(computeEpleyE1rmKg(Number.NaN, 5)).toBeNull();
    expect(computeEpleyE1rmKg(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("computeExerciseRecordTimeline", () => {
  it("tracks Weight, e1RM, and Session Volume PRs chronologically across sessions", () => {
    const sessions: ExerciseSessionInput[] = [
      {
        workoutId: "w3",
        completedAt: 3000,
        sets: [
          { setType: "working", weightKg: 95, reps: 10, completed: true },
          { setType: "working", weightKg: 95, reps: 10, completed: true },
        ],
      },
      {
        workoutId: "w1",
        completedAt: 1000,
        sets: [
          { setType: "working", weightKg: 80, reps: 8, completed: true },
          { setType: "working", weightKg: 80, reps: 8, completed: true },
        ],
      },
      {
        workoutId: "w2",
        completedAt: 2000,
        sets: [{ setType: "working", weightKg: 100, reps: 3, completed: true }],
      },
    ];

    const result = computeExerciseRecordTimeline(sessions, false);

    expect(result.timeline.map((point) => point.workoutId)).toEqual([
      "w1",
      "w2",
      "w3",
    ]);

    expect(result.prTypesByWorkoutId.get("w1")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);
    expect(result.prTypesByWorkoutId.get("w2")).toEqual(["weight", "e1rm"]);
    expect(result.prTypesByWorkoutId.get("w3")).toEqual([
      "e1rm",
      "session_volume",
    ]);

    expect(result.record).not.toBeNull();
    expect(result.record?.bestWeightKg).toBe(100);
    expect(result.record?.bestE1rmKg).toBeCloseTo(95 * (1 + 10 / 30), 6);
    expect(result.record?.bestSessionVolumeKg).toBe(1900);
    expect(result.record?.bestBodyweightReps).toBeUndefined();
    expect(result.record?.bestBodyweightSessionReps).toBeUndefined();
  });

  it("ignores ties within floating-point epsilon thresholds", () => {
    const sessions: ExerciseSessionInput[] = [
      {
        workoutId: "w1",
        completedAt: 1000,
        sets: [{ setType: "working", weightKg: 100, reps: 5, completed: true }],
      },
      {
        workoutId: "w2",
        completedAt: 2000,
        sets: [
          {
            setType: "working",
            weightKg: 100 + WEIGHT_EPSILON_KG / 2,
            reps: 5,
            completed: true,
          },
        ],
      },
    ];

    const result = computeExerciseRecordTimeline(sessions, false);
    expect(result.prTypesByWorkoutId.get("w1")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);
    expect(result.prTypesByWorkoutId.get("w2")).toEqual([]);
    expect(E1RM_EPSILON_KG).toBe(0.01);
    expect(VOLUME_EPSILON_KG).toBe(0.05);
  });

  it("excludes warmups and incomplete sets while including drop and failure sets", () => {
    const sessions: ExerciseSessionInput[] = [
      {
        workoutId: "w1",
        completedAt: 1000,
        sets: [
          { setType: "warmup", weightKg: 200, reps: 20, completed: true },
          { setType: "working", weightKg: 180, reps: 10, completed: false },
          { setType: "working", weightKg: 80, reps: 8, completed: true },
          { setType: "drop", weightKg: 60, reps: 12, completed: true },
          { setType: "failure", weightKg: 90, reps: 6, completed: true },
        ],
      },
    ];

    const result = computeExerciseRecordTimeline(sessions, false);
    const point = result.timeline[0];

    expect(point.workingSetCount).toBe(3);
    expect(point.bestWeightKg).toBe(90);
    expect(point.bestE1rmKg).toBeCloseTo(90 * (1 + 6 / 30), 6);
    expect(point.sessionVolumeKg).toBe(80 * 8 + 60 * 12 + 90 * 6);
    expect(point.maxRepsPerSet).toBe(12);
    expect(point.achievedPrs).toEqual(["weight", "e1rm", "session_volume"]);
  });

  it("returns null record for warmup-only or empty sessions", () => {
    const result = computeExerciseRecordTimeline(
      [
        {
          workoutId: "w1",
          completedAt: 1000,
          sets: [
            { setType: "warmup", weightKg: 60, reps: 10, completed: true },
          ],
        },
      ],
      false,
    );

    expect(result.record).toBeNull();
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].workingSetCount).toBe(0);
    expect(result.timeline[0].achievedPrs).toEqual([]);
  });

  it("tracks zero-weight bodyweight rep PRs and session rep volume independently from added-load sets", () => {
    const sessions: ExerciseSessionInput[] = [
      {
        workoutId: "w1",
        completedAt: 1000,
        sets: [
          { setType: "warmup", weightKg: 0, reps: 20, completed: true },
          { setType: "working", weightKg: 0, reps: 10, completed: true },
          { setType: "working", weightKg: 0, reps: 8, completed: true },
        ],
      },
      {
        workoutId: "w2",
        completedAt: 2000,
        sets: [
          { setType: "working", weightKg: 10, reps: 6, completed: true },
          { setType: "failure", weightKg: 0, reps: 12, completed: true },
        ],
      },
      {
        workoutId: "w3",
        completedAt: 3000,
        sets: [
          { setType: "working", weightKg: 0, reps: 11, completed: true },
          { setType: "working", weightKg: 0, reps: 10, completed: true },
        ],
      },
    ];

    const result = computeExerciseRecordTimeline(sessions, true);

    expect(result.prTypesByWorkoutId.get("w1")).toEqual([
      "bodyweight_reps",
      "bodyweight_session_reps",
    ]);
    expect(result.prTypesByWorkoutId.get("w2")).toEqual([
      "weight",
      "e1rm",
      "bodyweight_reps",
      "session_volume",
    ]);
    expect(result.prTypesByWorkoutId.get("w3")).toEqual([
      "bodyweight_session_reps",
    ]);

    expect(result.record).toEqual({
      bestWeightKg: 10,
      bestE1rmKg: 10 * (1 + 6 / 30),
      bestSessionVolumeKg: 60,
      bestBodyweightReps: 12,
      bestBodyweightSessionReps: 21,
    });
  });

  it("recomputes PR flags accurately when an earlier peak session is edited or removed", () => {
    const baseSessions: ExerciseSessionInput[] = [
      {
        workoutId: "w1",
        completedAt: 1000,
        sets: [{ setType: "working", weightKg: 120, reps: 5, completed: true }],
      },
      {
        workoutId: "w2",
        completedAt: 2000,
        sets: [{ setType: "working", weightKg: 100, reps: 5, completed: true }],
      },
      {
        workoutId: "w3",
        completedAt: 3000,
        sets: [{ setType: "working", weightKg: 110, reps: 5, completed: true }],
      },
    ];

    const initial = computeExerciseRecordTimeline(baseSessions, false);
    expect(initial.prTypesByWorkoutId.get("w2")).toEqual([]);
    expect(initial.prTypesByWorkoutId.get("w3")).toEqual([]);

    const edited = computeExerciseRecordTimeline(
      [
        {
          workoutId: "w1",
          completedAt: 1000,
          sets: [
            { setType: "working", weightKg: 90, reps: 5, completed: true },
          ],
        },
        baseSessions[1],
        baseSessions[2],
      ],
      false,
    );
    expect(edited.record?.bestWeightKg).toBe(110);
    expect(edited.prTypesByWorkoutId.get("w2")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);
    expect(edited.prTypesByWorkoutId.get("w3")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);

    const afterDelete = computeExerciseRecordTimeline(
      [baseSessions[1], baseSessions[2]],
      false,
    );
    expect(afterDelete.record?.bestWeightKg).toBe(110);
    expect(afterDelete.prTypesByWorkoutId.get("w2")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);
    expect(afterDelete.prTypesByWorkoutId.get("w3")).toEqual([
      "weight",
      "e1rm",
      "session_volume",
    ]);
  });
});

describe("unit conversions and computeNextSessionTarget", () => {
  it("converts kg <-> lb cleanly and steps weights by +2.5 kg or +5 lb", () => {
    const lb225InKg = displayWeightToKg(225, "lb");
    expect(kgToDisplayWeight(lb225InKg, "lb")).toBe(225);

    const steppedLbKg = stepWeightKg(lb225InKg, "lb", 1);
    expect(kgToDisplayWeight(steppedLbKg, "lb")).toBe(230);

    const steppedKg = stepWeightKg(100, "kg", 1);
    expect(steppedKg).toBe(102.5);
  });

  it("computes linear weight target in kg and lb preferring working sets", () => {
    const latestSets = [
      { setType: "warmup" as const, weightKg: 140, reps: 5, completed: true },
      { setType: "working" as const, weightKg: 100, reps: 8, completed: true },
      { setType: "working" as const, weightKg: 100, reps: 10, completed: true },
      { setType: "failure" as const, weightKg: 110, reps: 4, completed: true },
    ];

    expect(computeNextSessionTarget(latestSets, "kg", false)).toEqual({
      kind: "weight",
      targetWeightKg: 102.5,
      previousWeightKg: 100,
      previousReps: 10,
      incrementDisplay: 2.5,
      isAddedLoad: false,
    });

    const lb135Kg = displayWeightToKg(135, "lb");
    const lbTarget = computeNextSessionTarget(
      [{ setType: "working", weightKg: lb135Kg, reps: 8, completed: true }],
      "lb",
      false,
    );
    expect(lbTarget).not.toBeNull();
    expect(lbTarget?.kind).toBe("weight");
    if (lbTarget?.kind === "weight") {
      expect(kgToDisplayWeight(lbTarget.targetWeightKg, "lb")).toBe(140);
      expect(lbTarget.incrementDisplay).toBe(5);
      expect(lbTarget.isAddedLoad).toBe(false);
    }
  });

  it("falls back to drop/failure sets when no working sets exist", () => {
    const target = computeNextSessionTarget(
      [
        { setType: "warmup", weightKg: 40, reps: 10, completed: true },
        { setType: "drop", weightKg: 60, reps: 12, completed: true },
        { setType: "failure", weightKg: 70, reps: 6, completed: true },
      ],
      "kg",
      false,
    );

    expect(target).toEqual({
      kind: "weight",
      targetWeightKg: 72.5,
      previousWeightKg: 70,
      previousReps: 6,
      incrementDisplay: 2.5,
      isAddedLoad: false,
    });
  });

  it("targets +1 rep for zero-weight bodyweight and added-load increment for weighted bodyweight", () => {
    expect(
      computeNextSessionTarget(
        [
          { setType: "warmup", weightKg: 0, reps: 20, completed: true },
          { setType: "working", weightKg: 0, reps: 10, completed: true },
          { setType: "working", weightKg: 0, reps: 12, completed: true },
        ],
        "kg",
        true,
      ),
    ).toEqual({
      kind: "bodyweight_reps",
      targetReps: 13,
      previousReps: 12,
    });

    expect(
      computeNextSessionTarget(
        [
          { setType: "working", weightKg: 10, reps: 8, completed: true },
          { setType: "working", weightKg: 0, reps: 12, completed: true },
        ],
        "kg",
        true,
      ),
    ).toEqual({
      kind: "weight",
      targetWeightKg: 12.5,
      previousWeightKg: 10,
      previousReps: 8,
      incrementDisplay: 2.5,
      isAddedLoad: true,
    });

    expect(
      computeNextSessionTarget(
        [{ setType: "working", weightKg: 0, reps: 10, completed: true }],
        "kg",
        false,
      ),
    ).toBeNull();
  });
});
