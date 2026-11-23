import type { PrType, SetType, WeightUnit } from "./validators";
import {
  MAX_REPS,
  SET_TYPE_META,
  stepWeightKg,
  WEIGHT_EPSILON_KG,
  WEIGHT_INCREMENT_BY_UNIT,
} from "./workouts";

export const E1RM_EPSILON_KG = 0.01;
export const VOLUME_EPSILON_KG = 0.05;

export const PR_TYPES = [
  "weight",
  "e1rm",
  "bodyweight_reps",
  "session_volume",
  "bodyweight_session_reps",
] as const satisfies readonly PrType[];

export const PR_TYPE_LABELS = {
  weight: "Weight PR",
  e1rm: "Est. 1RM PR",
  bodyweight_reps: "Bodyweight Reps PR",
  session_volume: "Session Volume PR",
  bodyweight_session_reps: "Session Reps PR",
} as const satisfies Record<PrType, string>;

export interface PrSetInput {
  readonly setType: SetType;
  readonly weightKg: number;
  readonly reps: number;
  readonly completed: boolean;
}

export interface ExerciseSessionInput {
  readonly workoutId: string;
  readonly completedAt: number;
  readonly sets: readonly PrSetInput[];
}

export interface ExerciseRecordSnapshot {
  readonly bestWeightKg?: number;
  readonly bestE1rmKg?: number;
  readonly bestSessionVolumeKg?: number;
  readonly bestBodyweightReps?: number;
  readonly bestBodyweightSessionReps?: number;
}

export interface ExerciseSessionPoint {
  readonly workoutId: string;
  readonly completedAt: number;
  readonly workingSetCount: number;
  readonly bestWeightKg: number | null;
  readonly bestE1rmKg: number | null;
  readonly sessionVolumeKg: number | null;
  readonly bestBodyweightReps: number | null;
  readonly bodyweightSessionReps: number | null;
  readonly maxRepsPerSet: number | null;
  readonly achievedPrs: readonly PrType[];
}

export interface ExerciseRecordTimelineResult {
  readonly record: ExerciseRecordSnapshot | null;
  readonly timeline: readonly ExerciseSessionPoint[];
  readonly prTypesByWorkoutId: ReadonlyMap<string, readonly PrType[]>;
}

export type NextSessionTarget =
  | {
      readonly kind: "weight";
      readonly targetWeightKg: number;
      readonly previousWeightKg: number;
      readonly previousReps: number;
      readonly incrementDisplay: number;
      readonly isAddedLoad: boolean;
    }
  | {
      readonly kind: "bodyweight_reps";
      readonly targetReps: number;
      readonly previousReps: number;
    };

export function computeEpleyE1rmKg(
  weightKg: number,
  reps: number,
): number | null {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(reps) ||
    weightKg <= WEIGHT_EPSILON_KG ||
    reps < 1
  ) {
    return null;
  }
  return weightKg * (1 + reps / 30);
}

export function computeExerciseRecordTimeline(
  sessions: readonly ExerciseSessionInput[],
  isBodyweight: boolean,
): ExerciseRecordTimelineResult {
  const ordered = [...sessions].sort(
    (a, b) =>
      a.completedAt - b.completedAt || a.workoutId.localeCompare(b.workoutId),
  );

  let bestWeightKg: number | undefined;
  let bestE1rmKg: number | undefined;
  let bestSessionVolumeKg: number | undefined;
  let bestBodyweightReps: number | undefined;
  let bestBodyweightSessionReps: number | undefined;

  const timeline: ExerciseSessionPoint[] = [];
  const prTypesByWorkoutId = new Map<string, readonly PrType[]>();

  for (const session of ordered) {
    let workingSetCount = 0;
    let sessionBestWeightKg: number | null = null;
    let sessionBestE1rmKg: number | null = null;
    let sessionVolumeKg: number | null = null;
    let sessionBestBodyweightReps: number | null = null;
    let sessionBodyweightReps: number | null = null;
    let maxRepsPerSet: number | null = null;

    for (const set of session.sets) {
      if (
        !set.completed ||
        !SET_TYPE_META[set.setType].countsTowardVolumeAndProgression ||
        !Number.isFinite(set.weightKg) ||
        set.weightKg < 0 ||
        !Number.isFinite(set.reps) ||
        set.reps < 1
      ) {
        continue;
      }

      workingSetCount += 1;
      maxRepsPerSet =
        maxRepsPerSet === null ? set.reps : Math.max(maxRepsPerSet, set.reps);

      if (set.weightKg > WEIGHT_EPSILON_KG) {
        sessionBestWeightKg =
          sessionBestWeightKg === null
            ? set.weightKg
            : Math.max(sessionBestWeightKg, set.weightKg);

        const e1rm = computeEpleyE1rmKg(set.weightKg, set.reps);
        if (e1rm !== null) {
          sessionBestE1rmKg =
            sessionBestE1rmKg === null
              ? e1rm
              : Math.max(sessionBestE1rmKg, e1rm);
        }

        const setVolume = set.weightKg * set.reps;
        sessionVolumeKg =
          sessionVolumeKg === null ? setVolume : sessionVolumeKg + setVolume;
      } else if (isBodyweight) {
        sessionBestBodyweightReps =
          sessionBestBodyweightReps === null
            ? set.reps
            : Math.max(sessionBestBodyweightReps, set.reps);

        sessionBodyweightReps =
          sessionBodyweightReps === null
            ? set.reps
            : sessionBodyweightReps + set.reps;
      }
    }

    const achievedPrs: PrType[] = [];

    if (
      sessionBestWeightKg !== null &&
      (bestWeightKg === undefined ||
        sessionBestWeightKg > bestWeightKg + WEIGHT_EPSILON_KG)
    ) {
      bestWeightKg = sessionBestWeightKg;
      achievedPrs.push("weight");
    }

    if (
      sessionBestE1rmKg !== null &&
      (bestE1rmKg === undefined ||
        sessionBestE1rmKg > bestE1rmKg + E1RM_EPSILON_KG)
    ) {
      bestE1rmKg = sessionBestE1rmKg;
      achievedPrs.push("e1rm");
    }

    if (
      sessionBestBodyweightReps !== null &&
      (bestBodyweightReps === undefined ||
        sessionBestBodyweightReps > bestBodyweightReps)
    ) {
      bestBodyweightReps = sessionBestBodyweightReps;
      achievedPrs.push("bodyweight_reps");
    }

    if (
      sessionVolumeKg !== null &&
      (bestSessionVolumeKg === undefined ||
        sessionVolumeKg > bestSessionVolumeKg + VOLUME_EPSILON_KG)
    ) {
      bestSessionVolumeKg = sessionVolumeKg;
      achievedPrs.push("session_volume");
    }

    if (
      sessionBodyweightReps !== null &&
      (bestBodyweightSessionReps === undefined ||
        sessionBodyweightReps > bestBodyweightSessionReps)
    ) {
      bestBodyweightSessionReps = sessionBodyweightReps;
      achievedPrs.push("bodyweight_session_reps");
    }

    prTypesByWorkoutId.set(session.workoutId, achievedPrs);
    timeline.push({
      workoutId: session.workoutId,
      completedAt: session.completedAt,
      workingSetCount,
      bestWeightKg: sessionBestWeightKg,
      bestE1rmKg: sessionBestE1rmKg,
      sessionVolumeKg,
      bestBodyweightReps: sessionBestBodyweightReps,
      bodyweightSessionReps: sessionBodyweightReps,
      maxRepsPerSet,
      achievedPrs,
    });
  }

  const hasAnyRecord =
    bestWeightKg !== undefined ||
    bestE1rmKg !== undefined ||
    bestSessionVolumeKg !== undefined ||
    bestBodyweightReps !== undefined ||
    bestBodyweightSessionReps !== undefined;

  const record: ExerciseRecordSnapshot | null = hasAnyRecord
    ? {
        ...(bestWeightKg !== undefined ? { bestWeightKg } : {}),
        ...(bestE1rmKg !== undefined ? { bestE1rmKg } : {}),
        ...(bestSessionVolumeKg !== undefined ? { bestSessionVolumeKg } : {}),
        ...(bestBodyweightReps !== undefined ? { bestBodyweightReps } : {}),
        ...(bestBodyweightSessionReps !== undefined
          ? { bestBodyweightSessionReps }
          : {}),
      }
    : null;

  return {
    record,
    timeline,
    prTypesByWorkoutId,
  };
}

export function computeNextSessionTarget(
  latestSets: readonly PrSetInput[],
  unit: WeightUnit,
  isBodyweight: boolean,
): NextSessionTarget | null {
  const qualifying = latestSets.filter(
    (set) =>
      set.completed &&
      SET_TYPE_META[set.setType].countsTowardVolumeAndProgression &&
      Number.isFinite(set.weightKg) &&
      set.weightKg >= 0 &&
      Number.isFinite(set.reps) &&
      set.reps >= 1,
  );

  if (qualifying.length === 0) {
    return null;
  }

  const workingSets = qualifying.filter((set) => set.setType === "working");
  const pool = workingSets.length > 0 ? workingSets : qualifying;

  const weightedSets = pool.filter((set) => set.weightKg > WEIGHT_EPSILON_KG);
  if (weightedSets.length > 0) {
    let best = weightedSets[0];
    for (let index = 1; index < weightedSets.length; index += 1) {
      const candidate = weightedSets[index];
      if (
        candidate.weightKg > best.weightKg + WEIGHT_EPSILON_KG ||
        (Math.abs(candidate.weightKg - best.weightKg) <= WEIGHT_EPSILON_KG &&
          candidate.reps > best.reps)
      ) {
        best = candidate;
      }
    }

    return {
      kind: "weight",
      targetWeightKg: stepWeightKg(best.weightKg, unit, 1),
      previousWeightKg: best.weightKg,
      previousReps: best.reps,
      incrementDisplay: WEIGHT_INCREMENT_BY_UNIT[unit],
      isAddedLoad: isBodyweight,
    };
  }

  if (!isBodyweight) {
    return null;
  }

  let bestReps = 0;
  for (const set of pool) {
    if (set.reps > bestReps) {
      bestReps = set.reps;
    }
  }

  if (bestReps < 1) {
    return null;
  }

  return {
    kind: "bodyweight_reps",
    targetReps: Math.min(MAX_REPS, bestReps + 1),
    previousReps: bestReps,
  };
}
