export const MAX_TEMPLATE_TITLE_LENGTH = 80;
export const MAX_TARGET_REPS_LENGTH = 30;
export const MIN_TARGET_SETS = 1;
export const MAX_TARGET_SETS = 20;
export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_TARGET_REPS = "8-12";
export const MAX_TEMPLATES_PER_USER = 100;
export const MAX_TEMPLATE_EXERCISES = 50;

export type ParseTemplateTitleResult =
  | { readonly kind: "ok"; readonly title: string }
  | { readonly kind: "error"; readonly message: string };

export function parseTemplateTitle(raw: string): ParseTemplateTitleResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      kind: "error",
      message: "Routine title is required.",
    };
  }
  if (trimmed.length > MAX_TEMPLATE_TITLE_LENGTH) {
    return {
      kind: "error",
      message: `Routine title must be ${MAX_TEMPLATE_TITLE_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", title: trimmed };
}

export type ParseTargetSetsResult =
  | { readonly kind: "ok"; readonly targetSets: number }
  | { readonly kind: "error"; readonly message: string };

export function parseTargetSets(value: number): ParseTargetSetsResult {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return {
      kind: "error",
      message: "Target sets must be a whole number.",
    };
  }
  if (value < MIN_TARGET_SETS || value > MAX_TARGET_SETS) {
    return {
      kind: "error",
      message: `Target sets must be between ${MIN_TARGET_SETS} and ${MAX_TARGET_SETS}.`,
    };
  }
  return { kind: "ok", targetSets: value };
}

export type ParseTargetRepsResult =
  | { readonly kind: "ok"; readonly targetReps: string | undefined }
  | { readonly kind: "error"; readonly message: string };

export function parseTargetReps(
  raw: string | undefined,
): ParseTargetRepsResult {
  if (raw === undefined) {
    return { kind: "ok", targetReps: undefined };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: "ok", targetReps: undefined };
  }
  if (trimmed.length > MAX_TARGET_REPS_LENGTH) {
    return {
      kind: "error",
      message: `Target reps must be ${MAX_TARGET_REPS_LENGTH} characters or fewer.`,
    };
  }
  return { kind: "ok", targetReps: trimmed };
}

export function buildDuplicateTemplateTitle(sourceTitle: string): string {
  const suffix = " (Copy)";
  const trimmed = sourceTitle.trim();
  const baseSource = trimmed.length > 0 ? trimmed : "Routine";
  const maxBaseLength = MAX_TEMPLATE_TITLE_LENGTH - suffix.length;
  const base = baseSource.slice(0, maxBaseLength).trimEnd();
  return `${base}${suffix}`;
}

export function reorderByIndex<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const next = items.slice();
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= next.length ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }

  const [moved] = next.splice(fromIndex, 1);
  if (moved !== undefined) {
    next.splice(toIndex, 0, moved);
  }
  return next;
}

export type ValidatePermutationResult =
  | { readonly kind: "ok" }
  | { readonly kind: "error"; readonly message: string };

export function validatePermutation<IdType extends string>(
  existingIds: readonly IdType[],
  orderedIds: readonly IdType[],
): ValidatePermutationResult {
  if (existingIds.length !== orderedIds.length) {
    return {
      kind: "error",
      message: "Reordered list must contain every existing item.",
    };
  }

  const existingSet = new Set(existingIds);
  const seen = new Set<IdType>();

  for (const id of orderedIds) {
    if (!existingSet.has(id)) {
      return {
        kind: "error",
        message: "Reordered list contains an unrecognized item.",
      };
    }
    if (seen.has(id)) {
      return {
        kind: "error",
        message: "Reordered list contains duplicate items.",
      };
    }
    seen.add(id);
  }

  if (seen.size !== existingSet.size) {
    return {
      kind: "error",
      message: "Reordered list must contain every existing item.",
    };
  }

  return { kind: "ok" };
}
