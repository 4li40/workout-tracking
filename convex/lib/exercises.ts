import type { Equipment, MuscleGroup } from "./validators";

export const MAX_EXERCISE_NAME_LENGTH = 80;
export const MAX_EXERCISE_NOTE_LENGTH = 1000;
export const MAX_CUSTOM_EXERCISES_PER_USER = 200;
export const GLOBAL_EXERCISES_LIST_LIMIT = 500;
export const USER_NOTES_LIST_LIMIT = 1000;

export const MUSCLE_GROUP_LABELS = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full Body",
  other: "Other",
} as const satisfies Record<MuscleGroup, string>;

const MUSCLE_GROUP_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full_body",
  "other",
] as const satisfies readonly MuscleGroup[];

function buildExhaustiveOptions<
  Union extends string,
  const Order extends readonly Union[],
>(
  order: Order & (Exclude<Union, Order[number]> extends never ? Order : never),
  labels: Record<Union, string>,
): ReadonlyArray<{ readonly value: Union; readonly label: string }> {
  return order.map((value) => ({
    value,
    label: labels[value],
  }));
}

export const MUSCLE_GROUP_OPTIONS = buildExhaustiveOptions<
  MuscleGroup,
  typeof MUSCLE_GROUP_ORDER
>(MUSCLE_GROUP_ORDER, MUSCLE_GROUP_LABELS);

export const EQUIPMENT_LABELS = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  bodyweight: "Bodyweight",
  kettlebell: "Kettlebell",
  smith_machine: "Smith Machine",
  ez_bar: "EZ-Bar",
  trap_bar: "Trap Bar",
  band: "Band",
  other: "Other",
} as const satisfies Record<Equipment, string>;

const EQUIPMENT_ORDER = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "smith_machine",
  "ez_bar",
  "trap_bar",
  "band",
  "other",
] as const satisfies readonly Equipment[];

export const EQUIPMENT_OPTIONS = buildExhaustiveOptions<
  Equipment,
  typeof EQUIPMENT_ORDER
>(EQUIPMENT_ORDER, EQUIPMENT_LABELS);

export type ParseExerciseNameResult =
  | { readonly kind: "ok"; readonly name: string }
  | { readonly kind: "error"; readonly message: string };

export function normalizeExerciseNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function parseExerciseName(raw: string): ParseExerciseNameResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      kind: "error",
      message: "Exercise name is required.",
    };
  }
  if (trimmed.length > MAX_EXERCISE_NAME_LENGTH) {
    return {
      kind: "error",
      message: `Exercise name must be ${MAX_EXERCISE_NAME_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", name: trimmed };
}

export type ParseExerciseNoteResult =
  | { readonly kind: "ok"; readonly notes: string }
  | { readonly kind: "error"; readonly message: string };

export function parseExerciseNote(raw: string): ParseExerciseNoteResult {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_EXERCISE_NOTE_LENGTH) {
    return {
      kind: "error",
      message: `Sticky note must be ${MAX_EXERCISE_NOTE_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", notes: trimmed };
}

export type ExerciseScopeFilter = "all" | "global" | "custom";

export interface ExerciseFilterState {
  readonly search: string;
  readonly scope: ExerciseScopeFilter;
  readonly muscleGroup: MuscleGroup | "all";
  readonly equipment: Equipment | "all";
}

export function filterExercises<
  T extends {
    readonly name: string;
    readonly muscleGroup: MuscleGroup;
    readonly equipment: Equipment;
    readonly isCustom: boolean;
    readonly notes?: string;
  },
>(exercises: readonly T[], filter: ExerciseFilterState): T[] {
  const query = filter.search.trim().toLowerCase();

  return exercises.filter((exercise) => {
    if (filter.scope === "global" && exercise.isCustom) {
      return false;
    }
    if (filter.scope === "custom" && !exercise.isCustom) {
      return false;
    }
    if (
      filter.muscleGroup !== "all" &&
      exercise.muscleGroup !== filter.muscleGroup
    ) {
      return false;
    }
    if (filter.equipment !== "all" && exercise.equipment !== filter.equipment) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }

    const haystack = [
      exercise.name,
      MUSCLE_GROUP_LABELS[exercise.muscleGroup],
      EQUIPMENT_LABELS[exercise.equipment],
      exercise.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}
