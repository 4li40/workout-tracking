import { MAX_TARGET_SETS, MIN_TARGET_SETS } from "./templates";
import type { SetType, WeightUnit } from "./validators";

export const KG_PER_LB = 0.45359237;
export const WEIGHT_EPSILON_KG = 0.01;
export const MAX_WORKOUT_TITLE_LENGTH = 80;
export const MAX_WORKOUT_NOTES_LENGTH = 1000;
export const MAX_WORKOUT_EXERCISES = 50;
export const MAX_SETS_PER_EXERCISE = 30;
export const MAX_WORKOUT_SETS = 500;
export const MAX_WEIGHT_KG = 2000;
export const MAX_REPS = 999;
export const PREVIOUS_SESSION_LOOKBACK_LIMIT = 5;
export const REST_ADJUST_STEP_SECONDS = 15;
export const MAX_REST_ADJUST_DELTA_SECONDS = 300;

export const WEIGHT_INCREMENT_BY_UNIT = {
  kg: 2.5,
  lb: 5,
} as const satisfies Record<WeightUnit, number>;

export const SET_TYPE_ORDER = [
  "working",
  "warmup",
  "drop",
  "failure",
] as const satisfies readonly SetType[];

export interface SetTypeMetadata {
  readonly shortLabel: string;
  readonly label: string;
  readonly countsTowardVolumeAndProgression: boolean;
  readonly autoStartsRestTimer: boolean;
}

export const SET_TYPE_META = {
  warmup: {
    shortLabel: "W",
    label: "Warmup",
    countsTowardVolumeAndProgression: false,
    autoStartsRestTimer: false,
  },
  working: {
    shortLabel: "1",
    label: "Working",
    countsTowardVolumeAndProgression: true,
    autoStartsRestTimer: true,
  },
  drop: {
    shortLabel: "D",
    label: "Drop",
    countsTowardVolumeAndProgression: true,
    autoStartsRestTimer: true,
  },
  failure: {
    shortLabel: "F",
    label: "Failure",
    countsTowardVolumeAndProgression: true,
    autoStartsRestTimer: true,
  },
} as const satisfies Record<SetType, SetTypeMetadata>;

export type ParseWorkoutTitleResult =
  | { readonly kind: "ok"; readonly title: string }
  | { readonly kind: "error"; readonly message: string };

export function parseWorkoutTitle(raw: string): ParseWorkoutTitleResult {
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

export type ParseWorkoutNotesResult =
  | { readonly kind: "ok"; readonly notes: string | undefined }
  | { readonly kind: "error"; readonly message: string };

export function parseWorkoutNotes(
  raw: string | undefined,
): ParseWorkoutNotesResult {
  if (raw === undefined) {
    return { kind: "ok", notes: undefined };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: "ok", notes: undefined };
  }
  if (trimmed.length > MAX_WORKOUT_NOTES_LENGTH) {
    return {
      kind: "error",
      message: `Session notes must be ${MAX_WORKOUT_NOTES_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", notes: trimmed };
}

export type ParseSetWeightResult =
  | { readonly kind: "ok"; readonly weightKg: number }
  | { readonly kind: "error"; readonly message: string };

export function parseSetWeightKg(value: number): ParseSetWeightResult {
  if (!Number.isFinite(value) || value < 0) {
    return {
      kind: "error",
      message: "Weight must be zero or a positive number.",
    };
  }
  if (value > MAX_WEIGHT_KG) {
    return {
      kind: "error",
      message: `Weight must be ${MAX_WEIGHT_KG} kg or less.`,
    };
  }
  return { kind: "ok", weightKg: value };
}

export type ParseSetRepsResult =
  | { readonly kind: "ok"; readonly reps: number }
  | { readonly kind: "error"; readonly message: string };

export function parseSetReps(value: number): ParseSetRepsResult {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return {
      kind: "error",
      message: "Reps must be zero or a whole positive number.",
    };
  }
  if (value > MAX_REPS) {
    return {
      kind: "error",
      message: `Reps must be ${MAX_REPS} or fewer.`,
    };
  }
  return { kind: "ok", reps: value };
}

export type ValidateCompletedSetResult =
  | { readonly kind: "ok" }
  | { readonly kind: "error"; readonly message: string };

export function validateCompletedSet(input: {
  readonly weightKg: number;
  readonly reps: number;
  readonly isBodyweight: boolean;
}): ValidateCompletedSetResult {
  if (input.reps < 1) {
    return {
      kind: "error",
      message: "Enter at least 1 rep before checking off a set.",
    };
  }
  if (!input.isBodyweight && input.weightKg <= WEIGHT_EPSILON_KG) {
    return {
      kind: "error",
      message: "Enter a weight above 0 before checking off this set.",
    };
  }
  return { kind: "ok" };
}

export type ParseRestAdjustDeltaResult =
  | { readonly kind: "ok"; readonly deltaSeconds: number }
  | { readonly kind: "error"; readonly message: string };

export function parseRestAdjustDelta(
  deltaSeconds: number,
): ParseRestAdjustDeltaResult {
  if (
    !Number.isFinite(deltaSeconds) ||
    !Number.isInteger(deltaSeconds) ||
    deltaSeconds === 0
  ) {
    return {
      kind: "error",
      message: "Rest adjustment must be a non-zero whole number of seconds.",
    };
  }
  if (Math.abs(deltaSeconds) > MAX_REST_ADJUST_DELTA_SECONDS) {
    return {
      kind: "error",
      message: `Rest adjustment must be within ${MAX_REST_ADJUST_DELTA_SECONDS} seconds.`,
    };
  }
  return { kind: "ok", deltaSeconds };
}

export function kgToDisplayWeight(weightKg: number, unit: WeightUnit): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return 0;
  }
  const converted = unit === "kg" ? weightKg : weightKg / KG_PER_LB;
  return Math.round(converted * 100) / 100;
}

export function displayWeightToKg(
  displayWeight: number,
  unit: WeightUnit,
): number {
  if (!Number.isFinite(displayWeight) || displayWeight <= 0) {
    return 0;
  }
  if (unit === "kg") {
    return Math.round(displayWeight * 10000) / 10000;
  }
  return Math.round(displayWeight * KG_PER_LB * 1_000_000) / 1_000_000;
}

export function formatWeightNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function formatWeightFromKg(weightKg: number, unit: WeightUnit): string {
  return formatWeightNumber(kgToDisplayWeight(weightKg, unit));
}

export function formatSetPreviousLabel(
  previous: { readonly weightKg: number; readonly reps: number },
  unit: WeightUnit,
  isBodyweight: boolean,
): string {
  if (isBodyweight && previous.weightKg <= WEIGHT_EPSILON_KG) {
    return `BW × ${previous.reps}`;
  }
  if (isBodyweight) {
    return `BW+${formatWeightFromKg(previous.weightKg, unit)} ${unit} × ${previous.reps}`;
  }
  return `${formatWeightFromKg(previous.weightKg, unit)} ${unit} × ${previous.reps}`;
}

export function parseWeightInputString(
  raw: string,
  unit: WeightUnit,
): ParseSetWeightResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { kind: "ok", weightKg: 0 };
  }
  const normalized = trimmed.includes(".")
    ? trimmed
    : trimmed.replace(",", ".");
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return {
      kind: "error",
      message: "Enter a valid weight.",
    };
  }
  const displayWeight = Number(normalized);
  if (!Number.isFinite(displayWeight) || displayWeight < 0) {
    return {
      kind: "error",
      message: "Weight must be zero or a positive number.",
    };
  }
  const weightKg = displayWeightToKg(displayWeight, unit);
  if (weightKg > MAX_WEIGHT_KG) {
    const maxDisplayWeight =
      unit === "kg"
        ? MAX_WEIGHT_KG
        : Math.floor((MAX_WEIGHT_KG / KG_PER_LB) * 100) / 100;
    return {
      kind: "error",
      message: `Weight must be ${formatWeightNumber(maxDisplayWeight)} ${unit} or less.`,
    };
  }
  return parseSetWeightKg(weightKg);
}

export function parseRepsInputString(raw: string): ParseSetRepsResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { kind: "ok", reps: 0 };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      kind: "error",
      message: "Reps must be zero or a whole positive number.",
    };
  }
  const reps = Number(trimmed);
  return parseSetReps(reps);
}

export function stepWeightKg(
  currentWeightKg: number,
  unit: WeightUnit,
  direction: 1 | -1,
): number {
  const currentDisplay = kgToDisplayWeight(currentWeightKg, unit);
  const nextDisplay = Math.max(
    0,
    Math.round(
      (currentDisplay + direction * WEIGHT_INCREMENT_BY_UNIT[unit]) * 100,
    ) / 100,
  );
  if (nextDisplay <= 0) {
    return 0;
  }
  const nextKg = displayWeightToKg(nextDisplay, unit);
  return Math.min(MAX_WEIGHT_KG, nextKg);
}

export interface PreviousSetPerformance {
  readonly setType: SetType;
  readonly typeOrdinal: number;
  readonly weightKg: number;
  readonly enteredUnit: WeightUnit;
  readonly reps: number;
}

export function buildPreviousSetPerformances(
  completedSets: ReadonlyArray<{
    readonly setType: SetType;
    readonly weightKg: number;
    readonly enteredUnit: WeightUnit;
    readonly reps: number;
  }>,
): PreviousSetPerformance[] {
  const ordinalByType: Record<SetType, number> = {
    warmup: 0,
    working: 0,
    drop: 0,
    failure: 0,
  };

  return completedSets.map((set) => {
    const typeOrdinal = ordinalByType[set.setType];
    ordinalByType[set.setType] = typeOrdinal + 1;
    return {
      setType: set.setType,
      typeOrdinal,
      weightKg: set.weightKg,
      enteredUnit: set.enteredUnit,
      reps: set.reps,
    };
  });
}

export interface MatchedWorkoutSet<T extends { readonly setType: SetType }> {
  readonly set: T;
  readonly typeOrdinal: number;
  readonly workingDisplayNumber: number | null;
  readonly previous: PreviousSetPerformance | null;
}

export function matchPreviousSetsForExercise<
  T extends { readonly setType: SetType },
>(
  currentSets: readonly T[],
  previousSets: readonly PreviousSetPerformance[],
): MatchedWorkoutSet<T>[] {
  const previousByKey = new Map<string, PreviousSetPerformance>();
  for (const prev of previousSets) {
    previousByKey.set(`${prev.setType}:${prev.typeOrdinal}`, prev);
  }

  const ordinalByType: Record<SetType, number> = {
    warmup: 0,
    working: 0,
    drop: 0,
    failure: 0,
  };
  let workingDisplayCount = 0;

  return currentSets.map((set) => {
    const typeOrdinal = ordinalByType[set.setType];
    ordinalByType[set.setType] = typeOrdinal + 1;
    const workingDisplayNumber =
      set.setType === "working" ? ++workingDisplayCount : null;
    const previous = previousByKey.get(`${set.setType}:${typeOrdinal}`) ?? null;

    return {
      set,
      typeOrdinal,
      workingDisplayNumber,
      previous,
    };
  });
}

export type SetProgressionOutcome =
  | { readonly kind: "none" }
  | {
      readonly kind: "improved";
      readonly reason: "weight" | "reps" | "volume";
    };

export function evaluateSetProgression(input: {
  readonly setType: SetType;
  readonly weightKg: number;
  readonly reps: number;
  readonly completed: boolean;
  readonly isBodyweight: boolean;
  readonly previous: {
    readonly weightKg: number;
    readonly reps: number;
  } | null;
}): SetProgressionOutcome {
  if (
    !input.completed ||
    !SET_TYPE_META[input.setType].countsTowardVolumeAndProgression ||
    input.previous === null ||
    input.reps <= 0
  ) {
    return { kind: "none" };
  }

  if (
    input.isBodyweight &&
    input.weightKg <= WEIGHT_EPSILON_KG &&
    input.previous.weightKg <= WEIGHT_EPSILON_KG
  ) {
    return input.reps > input.previous.reps
      ? { kind: "improved", reason: "reps" }
      : { kind: "none" };
  }

  if (input.weightKg > input.previous.weightKg + WEIGHT_EPSILON_KG) {
    return { kind: "improved", reason: "weight" };
  }

  if (
    Math.abs(input.weightKg - input.previous.weightKg) <= WEIGHT_EPSILON_KG &&
    input.reps > input.previous.reps
  ) {
    return { kind: "improved", reason: "reps" };
  }

  if (
    input.weightKg * input.reps >
    input.previous.weightKg * input.previous.reps + 0.05
  ) {
    return { kind: "improved", reason: "volume" };
  }

  return { kind: "none" };
}

export function computeLinearWeightTargetKg(
  previousSets: ReadonlyArray<{
    readonly setType: SetType;
    readonly weightKg: number;
  }>,
  unit: WeightUnit,
  isBodyweight: boolean,
): number | null {
  if (isBodyweight) {
    return null;
  }

  let bestWorkingWeightKg = 0;
  for (const prev of previousSets) {
    if (
      prev.setType === "working" &&
      prev.weightKg > WEIGHT_EPSILON_KG &&
      prev.weightKg > bestWorkingWeightKg
    ) {
      bestWorkingWeightKg = prev.weightKg;
    }
  }

  if (bestWorkingWeightKg <= WEIGHT_EPSILON_KG) {
    return null;
  }

  return stepWeightKg(bestWorkingWeightKg, unit, 1);
}

export interface WorkoutVolumeSummary {
  readonly completedSets: number;
  readonly totalSets: number;
  readonly workingVolumeKg: number;
  readonly bodyweightWorkingReps: number;
}

export function computeWorkoutVolumeSummary(
  exercises: ReadonlyArray<{
    readonly isBodyweight: boolean;
    readonly sets: ReadonlyArray<{
      readonly setType: SetType;
      readonly weightKg: number;
      readonly reps: number;
      readonly completed: boolean;
    }>;
  }>,
): WorkoutVolumeSummary {
  let completedSets = 0;
  let totalSets = 0;
  let workingVolumeKg = 0;
  let bodyweightWorkingReps = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      totalSets += 1;
      if (!set.completed) {
        continue;
      }
      completedSets += 1;
      if (!SET_TYPE_META[set.setType].countsTowardVolumeAndProgression) {
        continue;
      }
      if (set.weightKg > WEIGHT_EPSILON_KG) {
        workingVolumeKg += set.weightKg * set.reps;
      } else if (exercise.isBodyweight) {
        bodyweightWorkingReps += set.reps;
      }
    }
  }

  return {
    completedSets,
    totalSets,
    workingVolumeKg,
    bodyweightWorkingReps,
  };
}

export interface TemplateExerciseStructure {
  readonly exerciseId: string;
  readonly targetSets: number;
  readonly restSeconds: number;
}

export interface TemplateDiffSummary {
  readonly hasStructuralChanges: boolean;
  readonly exercisesAdded: number;
  readonly exercisesRemoved: number;
  readonly orderOrSelectionChanged: boolean;
  readonly targetSetsChanged: boolean;
  readonly restDurationChanged: boolean;
}

export function computeEffectiveTargetSets(
  sets: ReadonlyArray<{ readonly setType: SetType }>,
): number {
  const workingCount = sets.filter((set) => set.setType !== "warmup").length;
  const rawCount = workingCount > 0 ? workingCount : sets.length;
  return Math.min(MAX_TARGET_SETS, Math.max(MIN_TARGET_SETS, rawCount));
}

function buildOccurrenceMap(
  items: readonly TemplateExerciseStructure[],
): Map<string, TemplateExerciseStructure> {
  const counts = new Map<string, number>();
  const result = new Map<string, TemplateExerciseStructure>();
  for (const item of items) {
    const occurrence = counts.get(item.exerciseId) ?? 0;
    counts.set(item.exerciseId, occurrence + 1);
    result.set(`${item.exerciseId}:${occurrence}`, item);
  }
  return result;
}

export function diffWorkoutAgainstTemplate(
  current: readonly TemplateExerciseStructure[],
  template: readonly TemplateExerciseStructure[],
): TemplateDiffSummary {
  const currentCounts = new Map<string, number>();
  for (const item of current) {
    currentCounts.set(
      item.exerciseId,
      (currentCounts.get(item.exerciseId) ?? 0) + 1,
    );
  }

  const templateCounts = new Map<string, number>();
  for (const item of template) {
    templateCounts.set(
      item.exerciseId,
      (templateCounts.get(item.exerciseId) ?? 0) + 1,
    );
  }

  let exercisesAdded = 0;
  for (const [exerciseId, count] of currentCounts) {
    const prevCount = templateCounts.get(exerciseId) ?? 0;
    if (count > prevCount) {
      exercisesAdded += count - prevCount;
    }
  }

  let exercisesRemoved = 0;
  for (const [exerciseId, prevCount] of templateCounts) {
    const count = currentCounts.get(exerciseId) ?? 0;
    if (prevCount > count) {
      exercisesRemoved += prevCount - count;
    }
  }

  const orderOrSelectionChanged =
    current.length !== template.length ||
    current.some(
      (item, index) => item.exerciseId !== template[index]?.exerciseId,
    );

  let targetSetsChanged = false;
  let restDurationChanged = false;

  const templateByOccurrence = buildOccurrenceMap(template);
  const currentSeenCounts = new Map<string, number>();
  for (const item of current) {
    const occurrence = currentSeenCounts.get(item.exerciseId) ?? 0;
    currentSeenCounts.set(item.exerciseId, occurrence + 1);
    const matchedTemplateItem = templateByOccurrence.get(
      `${item.exerciseId}:${occurrence}`,
    );
    if (matchedTemplateItem !== undefined) {
      if (item.targetSets !== matchedTemplateItem.targetSets) {
        targetSetsChanged = true;
      }
      if (item.restSeconds !== matchedTemplateItem.restSeconds) {
        restDurationChanged = true;
      }
    }
  }

  const hasStructuralChanges =
    exercisesAdded > 0 ||
    exercisesRemoved > 0 ||
    orderOrSelectionChanged ||
    targetSetsChanged ||
    restDurationChanged;

  return {
    hasStructuralChanges,
    exercisesAdded,
    exercisesRemoved,
    orderOrSelectionChanged,
    targetSetsChanged,
    restDurationChanged,
  };
}

export function formatTemplateDiffHighlights(
  diff: TemplateDiffSummary,
): string[] {
  const highlights: string[] = [];
  if (diff.exercisesAdded > 0) {
    highlights.push(
      `${diff.exercisesAdded} ${diff.exercisesAdded === 1 ? "exercise" : "exercises"} added`,
    );
  }
  if (diff.exercisesRemoved > 0) {
    highlights.push(
      `${diff.exercisesRemoved} ${diff.exercisesRemoved === 1 ? "exercise" : "exercises"} removed`,
    );
  }
  if (
    diff.orderOrSelectionChanged &&
    diff.exercisesAdded === 0 &&
    diff.exercisesRemoved === 0
  ) {
    highlights.push("Exercise order or selection changed");
  }
  if (diff.targetSetsChanged) {
    highlights.push("Target set counts adjusted");
  }
  if (diff.restDurationChanged) {
    highlights.push("Rest timer durations adjusted");
  }
  return highlights;
}
