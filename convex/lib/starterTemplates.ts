import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  ensureGlobalExercisesSeeded,
  type GlobalExerciseSlug,
} from "./globalExercises";

export interface StarterTemplateExerciseSeed {
  readonly exerciseSlug: GlobalExerciseSlug;
  readonly targetSets: number;
  readonly targetReps: string;
  readonly restSeconds: number;
}

export interface StarterTemplateSeed {
  readonly title: string;
  readonly sortOrder: number;
  readonly exercises: readonly StarterTemplateExerciseSeed[];
}

export const STARTER_TEMPLATES = [
  {
    title: "Push",
    sortOrder: 0,
    exercises: [
      {
        exerciseSlug: "barbell-bench-press",
        targetSets: 4,
        targetReps: "6-8",
        restSeconds: 150,
      },
      {
        exerciseSlug: "incline-dumbbell-press",
        targetSets: 3,
        targetReps: "8-10",
        restSeconds: 120,
      },
      {
        exerciseSlug: "barbell-overhead-press",
        targetSets: 3,
        targetReps: "6-8",
        restSeconds: 120,
      },
      {
        exerciseSlug: "dumbbell-lateral-raise",
        targetSets: 3,
        targetReps: "12-15",
        restSeconds: 60,
      },
      {
        exerciseSlug: "tricep-rope-pushdown",
        targetSets: 3,
        targetReps: "10-12",
        restSeconds: 60,
      },
    ],
  },
  {
    title: "Pull",
    sortOrder: 1,
    exercises: [
      {
        exerciseSlug: "barbell-row",
        targetSets: 4,
        targetReps: "6-8",
        restSeconds: 150,
      },
      {
        exerciseSlug: "pull-up",
        targetSets: 3,
        targetReps: "6-10",
        restSeconds: 120,
      },
      {
        exerciseSlug: "seated-cable-row",
        targetSets: 3,
        targetReps: "8-12",
        restSeconds: 90,
      },
      {
        exerciseSlug: "face-pull",
        targetSets: 3,
        targetReps: "12-15",
        restSeconds: 60,
      },
      {
        exerciseSlug: "ez-bar-curl",
        targetSets: 3,
        targetReps: "8-12",
        restSeconds: 60,
      },
    ],
  },
  {
    title: "Legs",
    sortOrder: 2,
    exercises: [
      {
        exerciseSlug: "barbell-back-squat",
        targetSets: 4,
        targetReps: "5-8",
        restSeconds: 180,
      },
      {
        exerciseSlug: "romanian-deadlift",
        targetSets: 3,
        targetReps: "8-10",
        restSeconds: 150,
      },
      {
        exerciseSlug: "leg-press",
        targetSets: 3,
        targetReps: "10-12",
        restSeconds: 120,
      },
      {
        exerciseSlug: "lying-leg-curl",
        targetSets: 3,
        targetReps: "10-12",
        restSeconds: 90,
      },
      {
        exerciseSlug: "standing-calf-raise",
        targetSets: 4,
        targetReps: "12-15",
        restSeconds: 60,
      },
    ],
  },
] as const satisfies readonly StarterTemplateSeed[];

const SLUG_LOOKUP_LIMIT = 10;

async function findGlobalExerciseIdBySlug(
  ctx: MutationCtx,
  slug: GlobalExerciseSlug,
): Promise<Id<"exercises"> | null> {
  const matches = await ctx.db
    .query("exercises")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .take(SLUG_LOOKUP_LIMIT);
  const globalExercise = matches.find((doc) => doc.userId === undefined);
  return globalExercise?._id ?? null;
}

export async function seedStarterTemplatesForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const existingTemplates = await ctx.db
    .query("workoutTemplates")
    .withIndex("by_user_order", (q) => q.eq("userId", userId))
    .take(1);

  if (existingTemplates.length > 0) {
    return 0;
  }

  const requiredSlugs = Array.from(
    new Set(
      STARTER_TEMPLATES.flatMap((template) =>
        template.exercises.map((exercise) => exercise.exerciseSlug),
      ),
    ),
  );

  const exerciseIdsBySlug = new Map<GlobalExerciseSlug, Id<"exercises">>();
  const missingSlugs: GlobalExerciseSlug[] = [];

  const initialLookups = await Promise.all(
    requiredSlugs.map(async (slug) => ({
      slug,
      id: await findGlobalExerciseIdBySlug(ctx, slug),
    })),
  );

  for (const { slug, id } of initialLookups) {
    if (id !== null) {
      exerciseIdsBySlug.set(slug, id);
    } else {
      missingSlugs.push(slug);
    }
  }

  if (missingSlugs.length > 0) {
    await ensureGlobalExercisesSeeded(ctx);

    const retryLookups = await Promise.all(
      missingSlugs.map(async (slug) => ({
        slug,
        id: await findGlobalExerciseIdBySlug(ctx, slug),
      })),
    );

    for (const { slug, id } of retryLookups) {
      if (id === null) {
        throw new Error(`Missing global exercise for slug "${slug}".`);
      }
      exerciseIdsBySlug.set(slug, id);
    }
  }

  for (const template of STARTER_TEMPLATES) {
    const templateId = await ctx.db.insert("workoutTemplates", {
      userId,
      title: template.title,
      sortOrder: template.sortOrder,
    });

    for (const [orderIndex, exercise] of template.exercises.entries()) {
      const exerciseId = exerciseIdsBySlug.get(exercise.exerciseSlug);
      if (exerciseId === undefined) {
        throw new Error(
          `Missing global exercise for slug "${exercise.exerciseSlug}".`,
        );
      }

      await ctx.db.insert("templateExercises", {
        userId,
        templateId,
        exerciseId,
        orderIndex,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        restSeconds: exercise.restSeconds,
      });
    }
  }

  return STARTER_TEMPLATES.length;
}
