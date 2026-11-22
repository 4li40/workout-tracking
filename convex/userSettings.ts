import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./lib/auth";
import { DEFAULT_REST_SECONDS, parseRestSeconds } from "./lib/settings";
import { seedStarterTemplatesForUser } from "./lib/starterTemplates";
import { weightUnitValidator } from "./lib/validators";

const userSettingsSnapshotValidator = v.object({
  _id: v.id("userSettings"),
  unit: weightUnitValidator,
  defaultRestSeconds: v.number(),
  onboardingCompleted: v.boolean(),
});

const activeWorkoutSummaryValidator = v.object({
  _id: v.id("workouts"),
  title: v.string(),
  startedAt: v.number(),
  restTimerEndsAt: v.optional(v.number()),
});

function toSettingsSnapshot(doc: Doc<"userSettings">) {
  return {
    _id: doc._id,
    unit: doc.unit,
    defaultRestSeconds: doc.defaultRestSeconds,
    onboardingCompleted: doc.onboardingCompleted,
  };
}

export const getAppShellState = query({
  args: {},
  returns: v.object({
    settings: v.union(userSettingsSnapshotValidator, v.null()),
    activeWorkout: v.union(activeWorkoutSummaryValidator, v.null()),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const [settingsDoc, activeWorkoutDoc] = await Promise.all([
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("workouts")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", "in_progress"),
        )
        .order("desc")
        .first(),
    ]);

    return {
      settings: settingsDoc !== null ? toSettingsSnapshot(settingsDoc) : null,
      activeWorkout:
        activeWorkoutDoc !== null
          ? {
              _id: activeWorkoutDoc._id,
              title: activeWorkoutDoc.title,
              startedAt: activeWorkoutDoc.startedAt,
              ...(activeWorkoutDoc.restTimerEndsAt !== undefined
                ? { restTimerEndsAt: activeWorkoutDoc.restTimerEndsAt }
                : {}),
            }
          : null,
    };
  },
});

export const completeOnboarding = mutation({
  args: {
    unit: weightUnitValidator,
    defaultRestSeconds: v.optional(v.number()),
  },
  returns: v.object({
    settings: userSettingsSnapshotValidator,
    templatesCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    const parsedRest = parseRestSeconds(
      args.defaultRestSeconds ?? DEFAULT_REST_SECONDS,
    );
    if (parsedRest.kind === "error") {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: parsedRest.message,
      });
    }

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing !== null && existing.onboardingCompleted) {
      return {
        settings: toSettingsSnapshot(existing),
        templatesCreated: 0,
      };
    }

    let settingsId = existing?._id;
    if (settingsId === undefined) {
      settingsId = await ctx.db.insert("userSettings", {
        userId,
        unit: args.unit,
        defaultRestSeconds: parsedRest.seconds,
        onboardingCompleted: true,
      });
    } else {
      await ctx.db.patch("userSettings", settingsId, {
        unit: args.unit,
        defaultRestSeconds: parsedRest.seconds,
        onboardingCompleted: true,
      });
    }

    const templatesCreated = await seedStarterTemplatesForUser(ctx, userId);

    return {
      settings: {
        _id: settingsId,
        unit: args.unit,
        defaultRestSeconds: parsedRest.seconds,
        onboardingCompleted: true,
      },
      templatesCreated,
    };
  },
});

export const updateSettings = mutation({
  args: {
    unit: v.optional(weightUnitValidator),
    defaultRestSeconds: v.optional(v.number()),
  },
  returns: userSettingsSnapshotValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);

    let validatedRestSeconds: number | undefined;
    if (args.defaultRestSeconds !== undefined) {
      const parsedRest = parseRestSeconds(args.defaultRestSeconds);
      if (parsedRest.kind === "error") {
        throw new ConvexError({
          code: "INVALID_ARGUMENT",
          message: parsedRest.message,
        });
      }
      validatedRestSeconds = parsedRest.seconds;
    }

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing === null) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User settings not found. Complete onboarding first.",
      });
    }

    const patch: Partial<
      Pick<Doc<"userSettings">, "unit" | "defaultRestSeconds">
    > = {};
    if (args.unit !== undefined) {
      patch.unit = args.unit;
    }
    if (validatedRestSeconds !== undefined) {
      patch.defaultRestSeconds = validatedRestSeconds;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("userSettings", existing._id, patch);
    }

    return {
      _id: existing._id,
      unit: args.unit ?? existing.unit,
      defaultRestSeconds: validatedRestSeconds ?? existing.defaultRestSeconds,
      onboardingCompleted: existing.onboardingCompleted,
    };
  },
});
