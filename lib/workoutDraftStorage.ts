import type { SetType, WeightUnit } from "@/convex/lib/validators";
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  WEIGHT_EPSILON_KG,
} from "@/convex/lib/workouts";

const LEGACY_DRAFT_STORAGE_PREFIX = "workout-tracker:active-draft:v1:";
const DRAFT_STORAGE_PREFIX = "workout-tracker:active-draft:v2:";

export interface LocalSetDraft {
  readonly setId: string;
  readonly workoutExerciseId: string;
  readonly setType: SetType;
  readonly weightKg: number;
  readonly enteredUnit: WeightUnit;
  readonly reps: number;
  readonly completed: boolean;
}

export interface ActiveWorkoutDraft {
  readonly version: 1;
  readonly workoutId: string;
  readonly updatedAt: number;
  readonly title?: string;
  readonly notes?: string;
  readonly sets: Readonly<Record<string, LocalSetDraft>>;
}

function getScopePrefix(scopeId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${scopeId}:`;
}

function getDraftStorageKey(scopeId: string, workoutId: string): string {
  return `${getScopePrefix(scopeId)}${workoutId}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSetType(value: unknown): value is SetType {
  return (
    value === "warmup" ||
    value === "working" ||
    value === "drop" ||
    value === "failure"
  );
}

function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "kg" || value === "lb";
}

function parseLocalSetDraft(key: string, raw: unknown): LocalSetDraft | null {
  if (!isPlainRecord(raw)) {
    return null;
  }
  if (
    typeof raw.setId !== "string" ||
    raw.setId.length === 0 ||
    raw.setId !== key ||
    typeof raw.workoutExerciseId !== "string" ||
    raw.workoutExerciseId.length === 0 ||
    !isSetType(raw.setType) ||
    typeof raw.weightKg !== "number" ||
    !Number.isFinite(raw.weightKg) ||
    raw.weightKg < 0 ||
    raw.weightKg > MAX_WEIGHT_KG ||
    !isWeightUnit(raw.enteredUnit) ||
    typeof raw.reps !== "number" ||
    !Number.isFinite(raw.reps) ||
    !Number.isInteger(raw.reps) ||
    raw.reps < 0 ||
    raw.reps > MAX_REPS ||
    typeof raw.completed !== "boolean"
  ) {
    return null;
  }

  return {
    setId: raw.setId,
    workoutExerciseId: raw.workoutExerciseId,
    setType: raw.setType,
    weightKg: raw.weightKg,
    enteredUnit: raw.enteredUnit,
    reps: raw.reps,
    completed: raw.completed,
  };
}

export function parseStoredDraft(
  raw: unknown,
  workoutId: string,
): ActiveWorkoutDraft | null {
  if (!isPlainRecord(raw)) {
    return null;
  }
  if (
    raw.version !== 1 ||
    typeof raw.workoutId !== "string" ||
    raw.workoutId !== workoutId ||
    typeof raw.updatedAt !== "number" ||
    !Number.isFinite(raw.updatedAt) ||
    (raw.title !== undefined && typeof raw.title !== "string") ||
    (raw.notes !== undefined && typeof raw.notes !== "string") ||
    !isPlainRecord(raw.sets)
  ) {
    return null;
  }

  const parsedSets: Record<string, LocalSetDraft> = {};
  for (const [key, value] of Object.entries(raw.sets)) {
    const parsedSet = parseLocalSetDraft(key, value);
    if (parsedSet === null) {
      return null;
    }
    parsedSets[key] = parsedSet;
  }

  return {
    version: 1,
    workoutId: raw.workoutId,
    updatedAt: raw.updatedAt,
    ...(raw.title !== undefined ? { title: raw.title } : {}),
    ...(raw.notes !== undefined ? { notes: raw.notes } : {}),
    sets: parsedSets,
  };
}

export function reconcileDraftWithServer(
  draft: ActiveWorkoutDraft,
  serverWorkout: {
    readonly _id: string;
    readonly title: string;
    readonly notes?: string;
    readonly exercises: ReadonlyArray<{
      readonly _id: string;
      readonly sets: ReadonlyArray<{
        readonly _id: string;
        readonly setType: SetType;
        readonly weightKg: number;
        readonly enteredUnit: WeightUnit;
        readonly reps: number;
        readonly completed: boolean;
      }>;
    }>;
  },
): ActiveWorkoutDraft | null {
  if (draft.workoutId !== serverWorkout._id) {
    return null;
  }

  const nextTitle =
    draft.title !== undefined && draft.title !== serverWorkout.title
      ? draft.title
      : undefined;
  const serverNotes = serverWorkout.notes ?? "";
  const nextNotes =
    draft.notes !== undefined && draft.notes !== serverNotes
      ? draft.notes
      : undefined;

  const serverSetsById = new Map<
    string,
    {
      readonly workoutExerciseId: string;
      readonly setType: SetType;
      readonly weightKg: number;
      readonly enteredUnit: WeightUnit;
      readonly reps: number;
      readonly completed: boolean;
    }
  >();

  for (const exercise of serverWorkout.exercises) {
    for (const set of exercise.sets) {
      serverSetsById.set(set._id, {
        workoutExerciseId: exercise._id,
        setType: set.setType,
        weightKg: set.weightKg,
        enteredUnit: set.enteredUnit,
        reps: set.reps,
        completed: set.completed,
      });
    }
  }

  const nextSets: Record<string, LocalSetDraft> = {};
  for (const [setId, setDraft] of Object.entries(draft.sets)) {
    const serverSet = serverSetsById.get(setId);
    if (
      serverSet === undefined ||
      serverSet.workoutExerciseId !== setDraft.workoutExerciseId
    ) {
      continue;
    }

    const matchesServer =
      setDraft.setType === serverSet.setType &&
      Math.abs(setDraft.weightKg - serverSet.weightKg) <= WEIGHT_EPSILON_KG &&
      setDraft.enteredUnit === serverSet.enteredUnit &&
      setDraft.reps === serverSet.reps &&
      setDraft.completed === serverSet.completed;

    if (!matchesServer) {
      nextSets[setId] = setDraft;
    }
  }

  if (
    nextTitle === undefined &&
    nextNotes === undefined &&
    Object.keys(nextSets).length === 0
  ) {
    return null;
  }

  return {
    version: 1,
    workoutId: draft.workoutId,
    updatedAt: draft.updatedAt,
    ...(nextTitle !== undefined ? { title: nextTitle } : {}),
    ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
    sets: nextSets,
  };
}

export function countDraftChanges(draft: ActiveWorkoutDraft): number {
  return (
    (draft.title !== undefined ? 1 : 0) +
    (draft.notes !== undefined ? 1 : 0) +
    Object.keys(draft.sets).length
  );
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readWorkoutDraft(
  scopeId: string,
  workoutId: string,
): ActiveWorkoutDraft | null {
  const storage = getLocalStorage();
  if (storage === null) {
    return null;
  }
  try {
    const serialized = storage.getItem(getDraftStorageKey(scopeId, workoutId));
    if (serialized === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(serialized);
    return parseStoredDraft(parsed, workoutId);
  } catch {
    return null;
  }
}

export function writeWorkoutDraft(
  scopeId: string,
  workoutId: string,
  draft: ActiveWorkoutDraft | null,
): void {
  const storage = getLocalStorage();
  if (storage === null) {
    return;
  }
  try {
    const key = getDraftStorageKey(scopeId, workoutId);
    if (draft === null || countDraftChanges(draft) === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(draft));
  } catch {
    return;
  }
}

export function saveWorkoutSetDraft(
  scopeId: string,
  workoutId: string,
  setDraft: LocalSetDraft,
): void {
  const existing = readWorkoutDraft(scopeId, workoutId);
  const nextDraft: ActiveWorkoutDraft = {
    version: 1,
    workoutId,
    updatedAt: Date.now(),
    ...(existing?.title !== undefined ? { title: existing.title } : {}),
    ...(existing?.notes !== undefined ? { notes: existing.notes } : {}),
    sets: {
      ...(existing?.sets ?? {}),
      [setDraft.setId]: setDraft,
    },
  };
  writeWorkoutDraft(scopeId, workoutId, nextDraft);
}

export function saveWorkoutMetaDraft(
  scopeId: string,
  workoutId: string,
  meta: { readonly title?: string; readonly notes?: string },
): void {
  const existing = readWorkoutDraft(scopeId, workoutId);
  const title = meta.title !== undefined ? meta.title : existing?.title;
  const notes = meta.notes !== undefined ? meta.notes : existing?.notes;

  const nextDraft: ActiveWorkoutDraft = {
    version: 1,
    workoutId,
    updatedAt: Date.now(),
    ...(title !== undefined ? { title } : {}),
    ...(notes !== undefined ? { notes } : {}),
    sets: existing?.sets ?? {},
  };
  writeWorkoutDraft(scopeId, workoutId, nextDraft);
}

export function clearWorkoutSetDraft(
  scopeId: string,
  workoutId: string,
  setId: string,
): void {
  const existing = readWorkoutDraft(scopeId, workoutId);
  if (existing === null || !(setId in existing.sets)) {
    return;
  }
  const nextSets = { ...existing.sets };
  delete nextSets[setId];
  writeWorkoutDraft(scopeId, workoutId, {
    ...existing,
    updatedAt: Date.now(),
    sets: nextSets,
  });
}

export function clearWorkoutMetaDraft(
  scopeId: string,
  workoutId: string,
  fields: { readonly title?: boolean; readonly notes?: boolean },
): void {
  const existing = readWorkoutDraft(scopeId, workoutId);
  if (existing === null) {
    return;
  }
  const title = fields.title ? undefined : existing.title;
  const notes = fields.notes ? undefined : existing.notes;
  writeWorkoutDraft(scopeId, workoutId, {
    version: 1,
    workoutId,
    updatedAt: Date.now(),
    ...(title !== undefined ? { title } : {}),
    ...(notes !== undefined ? { notes } : {}),
    sets: existing.sets,
  });
}

export function clearWorkoutDraft(scopeId: string, workoutId: string): void {
  writeWorkoutDraft(scopeId, workoutId, null);
}

export function pruneStaleWorkoutDrafts(
  scopeId: string,
  activeWorkoutId: string,
): void {
  const storage = getLocalStorage();
  if (storage === null) {
    return;
  }
  const scopePrefix = getScopePrefix(scopeId);
  const activeKey = getDraftStorageKey(scopeId, activeWorkoutId);
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(scopePrefix) && key !== activeKey) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {
    return;
  }
}

export function clearAllWorkoutDrafts(): void {
  const storage = getLocalStorage();
  if (storage === null) {
    return;
  }
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key !== null &&
        (key.startsWith(DRAFT_STORAGE_PREFIX) ||
          key.startsWith(LEGACY_DRAFT_STORAGE_PREFIX))
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {
    return;
  }
}
