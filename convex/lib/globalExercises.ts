import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Equipment, MuscleGroup } from "./validators";

export interface GlobalExerciseSeed {
  readonly slug: string;
  readonly name: string;
  readonly muscleGroup: MuscleGroup;
  readonly equipment: Equipment;
  readonly isBodyweight: boolean;
}

export interface SeedGlobalExercisesResult {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export const GLOBAL_EXERCISES: readonly GlobalExerciseSeed[] = [
  // Chest
  {
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    muscleGroup: "chest",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "dumbbell-bench-press",
    name: "Dumbbell Bench Press",
    muscleGroup: "chest",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "incline-barbell-bench-press",
    name: "Incline Barbell Bench Press",
    muscleGroup: "chest",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "cable-chest-fly",
    name: "Cable Chest Fly",
    muscleGroup: "chest",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "pec-deck-fly",
    name: "Pec Deck Fly",
    muscleGroup: "chest",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "chest-dip",
    name: "Chest Dip",
    muscleGroup: "chest",
    equipment: "bodyweight",
    isBodyweight: true,
  },
  {
    slug: "push-up",
    name: "Push-Up",
    muscleGroup: "chest",
    equipment: "bodyweight",
    isBodyweight: true,
  },

  // Back
  {
    slug: "barbell-row",
    name: "Barbell Row",
    muscleGroup: "back",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "conventional-deadlift",
    name: "Conventional Deadlift",
    muscleGroup: "back",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "pull-up",
    name: "Pull-Up",
    muscleGroup: "back",
    equipment: "bodyweight",
    isBodyweight: true,
  },
  {
    slug: "chin-up",
    name: "Chin-Up",
    muscleGroup: "back",
    equipment: "bodyweight",
    isBodyweight: true,
  },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    muscleGroup: "back",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "seated-cable-row",
    name: "Seated Cable Row",
    muscleGroup: "back",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "single-arm-dumbbell-row",
    name: "Single-Arm Dumbbell Row",
    muscleGroup: "back",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "chest-supported-row",
    name: "Chest-Supported Row",
    muscleGroup: "back",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "face-pull",
    name: "Face Pull",
    muscleGroup: "back",
    equipment: "cable",
    isBodyweight: false,
  },

  // Shoulders
  {
    slug: "barbell-overhead-press",
    name: "Barbell Overhead Press",
    muscleGroup: "shoulders",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "seated-dumbbell-shoulder-press",
    name: "Seated Dumbbell Shoulder Press",
    muscleGroup: "shoulders",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    muscleGroup: "shoulders",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    muscleGroup: "shoulders",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    muscleGroup: "shoulders",
    equipment: "machine",
    isBodyweight: false,
  },

  // Biceps
  {
    slug: "barbell-curl",
    name: "Barbell Curl",
    muscleGroup: "biceps",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "ez-bar-curl",
    name: "EZ-Bar Curl",
    muscleGroup: "biceps",
    equipment: "ez_bar",
    isBodyweight: false,
  },
  {
    slug: "incline-dumbbell-curl",
    name: "Incline Dumbbell Curl",
    muscleGroup: "biceps",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "hammer-curl",
    name: "Hammer Curl",
    muscleGroup: "biceps",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "cable-bicep-curl",
    name: "Cable Bicep Curl",
    muscleGroup: "biceps",
    equipment: "cable",
    isBodyweight: false,
  },

  // Triceps
  {
    slug: "tricep-rope-pushdown",
    name: "Tricep Rope Pushdown",
    muscleGroup: "triceps",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "overhead-cable-tricep-extension",
    name: "Overhead Cable Tricep Extension",
    muscleGroup: "triceps",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "skull-crusher",
    name: "Skull Crusher",
    muscleGroup: "triceps",
    equipment: "ez_bar",
    isBodyweight: false,
  },
  {
    slug: "tricep-dip",
    name: "Tricep Dip",
    muscleGroup: "triceps",
    equipment: "bodyweight",
    isBodyweight: true,
  },

  // Quads
  {
    slug: "barbell-back-squat",
    name: "Barbell Back Squat",
    muscleGroup: "quads",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "barbell-front-squat",
    name: "Barbell Front Squat",
    muscleGroup: "quads",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "leg-press",
    name: "Leg Press",
    muscleGroup: "quads",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    muscleGroup: "quads",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "leg-extension",
    name: "Leg Extension",
    muscleGroup: "quads",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "bodyweight-squat",
    name: "Bodyweight Squat",
    muscleGroup: "quads",
    equipment: "bodyweight",
    isBodyweight: true,
  },

  // Hamstrings
  {
    slug: "romanian-deadlift",
    name: "Romanian Deadlift",
    muscleGroup: "hamstrings",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "dumbbell-romanian-deadlift",
    name: "Dumbbell Romanian Deadlift",
    muscleGroup: "hamstrings",
    equipment: "dumbbell",
    isBodyweight: false,
  },
  {
    slug: "lying-leg-curl",
    name: "Lying Leg Curl",
    muscleGroup: "hamstrings",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "seated-leg-curl",
    name: "Seated Leg Curl",
    muscleGroup: "hamstrings",
    equipment: "machine",
    isBodyweight: false,
  },

  // Glutes
  {
    slug: "barbell-hip-thrust",
    name: "Barbell Hip Thrust",
    muscleGroup: "glutes",
    equipment: "barbell",
    isBodyweight: false,
  },
  {
    slug: "walking-lunge",
    name: "Walking Lunge",
    muscleGroup: "glutes",
    equipment: "dumbbell",
    isBodyweight: false,
  },

  // Calves
  {
    slug: "standing-calf-raise",
    name: "Standing Calf Raise",
    muscleGroup: "calves",
    equipment: "machine",
    isBodyweight: false,
  },
  {
    slug: "seated-calf-raise",
    name: "Seated Calf Raise",
    muscleGroup: "calves",
    equipment: "machine",
    isBodyweight: false,
  },

  // Core
  {
    slug: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    muscleGroup: "core",
    equipment: "bodyweight",
    isBodyweight: true,
  },
  {
    slug: "cable-crunch",
    name: "Cable Crunch",
    muscleGroup: "core",
    equipment: "cable",
    isBodyweight: false,
  },
  {
    slug: "ab-wheel-rollout",
    name: "Ab Wheel Rollout",
    muscleGroup: "core",
    equipment: "bodyweight",
    isBodyweight: true,
  },
];

const GLOBAL_EXERCISE_SCAN_LIMIT = 500;

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase();
}

export async function ensureGlobalExercisesSeeded(
  ctx: MutationCtx,
): Promise<SeedGlobalExercisesResult> {
  const existingGlobals = await ctx.db
    .query("exercises")
    .withIndex("by_user", (q) => q.eq("userId", undefined))
    .take(GLOBAL_EXERCISE_SCAN_LIMIT);

  const bySlug = new Map<string, Doc<"exercises">>();
  const byNormalizedName = new Map<string, Doc<"exercises">>();

  for (const exercise of existingGlobals) {
    if (exercise.slug !== undefined) {
      bySlug.set(exercise.slug, exercise);
    }
    byNormalizedName.set(normalizeExerciseName(exercise.name), exercise);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const seed of GLOBAL_EXERCISES) {
    const existing =
      bySlug.get(seed.slug) ??
      byNormalizedName.get(normalizeExerciseName(seed.name));

    if (existing === undefined) {
      await ctx.db.insert("exercises", {
        slug: seed.slug,
        name: seed.name,
        muscleGroup: seed.muscleGroup,
        equipment: seed.equipment,
        isBodyweight: seed.isBodyweight,
      });
      inserted += 1;
      continue;
    }

    const needsPatch =
      existing.slug !== seed.slug ||
      existing.name !== seed.name ||
      existing.muscleGroup !== seed.muscleGroup ||
      existing.equipment !== seed.equipment ||
      existing.isBodyweight !== seed.isBodyweight;

    if (needsPatch) {
      await ctx.db.patch("exercises", existing._id, {
        slug: seed.slug,
        name: seed.name,
        muscleGroup: seed.muscleGroup,
        equipment: seed.equipment,
        isBodyweight: seed.isBodyweight,
      });
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return {
    inserted,
    updated,
    skipped,
    total: GLOBAL_EXERCISES.length,
  };
}
