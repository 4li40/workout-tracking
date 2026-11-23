import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAuthUserId, requireUserOwnedDoc } from "./lib/auth";
import { syncActiveWorkoutRestTimerPushSchedule } from "./lib/restTimerPush";
import { sendWebPushMessage } from "./lib/webPush";

const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 50;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 512;
const MAX_AUTH_LENGTH = 256;
const MAX_USER_AGENT_LENGTH = 512;

function readVapidConfig() {
  const publicKey = (env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (env.VAPID_SUBJECT ?? "").trim();
  const configured =
    publicKey.length > 0 && privateKey.length > 0 && subject.length > 0;
  return { configured, publicKey, privateKey, subject };
}

function parsePushEndpoint(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ENDPOINT_LENGTH) {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: "Push subscription endpoint is invalid.",
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: "Push subscription endpoint must be a valid URL.",
    });
  }
  if (parsed.protocol !== "https:") {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: "Push subscription endpoint must use https://.",
    });
  }
  return trimmed;
}

function parseRequiredKey(
  raw: string,
  label: string,
  maxLength: number,
): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new ConvexError({
      code: "INVALID_ARGUMENT",
      message: `Push subscription ${label} key is invalid.`,
    });
  }
  return trimmed;
}

export const getPushConfig = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    publicKey: v.union(v.string(), v.null()),
    subscriptionCount: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const { configured, publicKey } = readVapidConfig();

    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_PUSH_SUBSCRIPTIONS_PER_USER);

    return {
      configured,
      publicKey: configured ? publicKey : null,
      subscriptionCount: subscriptions.length,
    };
  },
});

export const upsertSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const endpoint = parsePushEndpoint(args.endpoint);
    const p256dh = parseRequiredKey(args.p256dh, "p256dh", MAX_P256DH_LENGTH);
    const auth = parseRequiredKey(args.auth, "auth", MAX_AUTH_LENGTH);
    const userAgent =
      args.userAgent !== undefined
        ? args.userAgent.trim().slice(0, MAX_USER_AGENT_LENGTH)
        : undefined;

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();

    const now = Date.now();
    let subscriptionId: Id<"pushSubscriptions">;

    if (existing !== null) {
      await ctx.db.patch("pushSubscriptions", existing._id, {
        userId,
        p256dh,
        auth,
        ...(userAgent !== undefined && userAgent.length > 0
          ? { userAgent }
          : {}),
        updatedAt: now,
      });
      subscriptionId = existing._id;
    } else {
      subscriptionId = await ctx.db.insert("pushSubscriptions", {
        userId,
        endpoint,
        p256dh,
        auth,
        ...(userAgent !== undefined && userAgent.length > 0
          ? { userAgent }
          : {}),
        updatedAt: now,
      });
    }

    await syncActiveWorkoutRestTimerPushSchedule(ctx, userId);
    return subscriptionId;
  },
});

export const removeSubscription = mutation({
  args: {
    endpoint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const endpoint = args.endpoint.trim();
    if (endpoint.length === 0) {
      return null;
    }

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();

    if (existing === null) {
      return null;
    }

    requireUserOwnedDoc(existing, userId, "pushSubscriptions");
    await ctx.db.delete("pushSubscriptions", existing._id);
    await syncActiveWorkoutRestTimerPushSchedule(ctx, userId);
    return null;
  },
});

export const getDeliveryContext = internalQuery({
  args: {
    workoutId: v.id("workouts"),
    expectedEndsAt: v.number(),
  },
  returns: v.union(
    v.object({
      workoutTitle: v.string(),
      subscriptions: v.array(
        v.object({
          _id: v.id("pushSubscriptions"),
          endpoint: v.string(),
          p256dh: v.string(),
          auth: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const workout = await ctx.db.get("workouts", args.workoutId);
    if (
      workout === null ||
      workout.status !== "in_progress" ||
      workout.restTimerEndsAt !== args.expectedEndsAt
    ) {
      return null;
    }

    const [settings, subscriptions] = await Promise.all([
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", workout.userId))
        .unique(),
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", workout.userId))
        .take(MAX_PUSH_SUBSCRIPTIONS_PER_USER),
    ]);

    if (
      settings?.restNotificationsEnabled !== true ||
      subscriptions.length === 0
    ) {
      return null;
    }

    return {
      workoutTitle: workout.title,
      subscriptions: subscriptions.map((sub) => ({
        _id: sub._id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      })),
    };
  },
});

export const deleteExpiredSubscriptions = internalMutation({
  args: {
    subscriptionIds: v.array(v.id("pushSubscriptions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const subscriptionId of args.subscriptionIds) {
      const existing = await ctx.db.get("pushSubscriptions", subscriptionId);
      if (existing !== null) {
        await ctx.db.delete("pushSubscriptions", subscriptionId);
      }
    }
    return null;
  },
});

export const sendRestTimerNotification = internalAction({
  args: {
    workoutId: v.id("workouts"),
    expectedEndsAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { configured, publicKey, privateKey, subject } = readVapidConfig();
    if (!configured) {
      return null;
    }

    const context = await ctx.runQuery(internal.push.getDeliveryContext, {
      workoutId: args.workoutId,
      expectedEndsAt: args.expectedEndsAt,
    });
    if (context === null || context.subscriptions.length === 0) {
      return null;
    }

    const payload = JSON.stringify({
      title: "Rest complete",
      body: `${context.workoutTitle}. Ready for your next set.`,
      tag: "rest-timer",
      url: `/workouts/${args.workoutId}`,
      workoutId: args.workoutId,
      endsAt: args.expectedEndsAt,
    });

    const results = await Promise.allSettled(
      context.subscriptions.map(async (subscription) => {
        const result = await sendWebPushMessage({
          subscription,
          payload,
          vapidPublicKey: publicKey,
          vapidPrivateKey: privateKey,
          vapidSubject: subject,
        });
        return { subscriptionId: subscription._id, result };
      }),
    );

    const expiredIds: Id<"pushSubscriptions">[] = [];
    for (const outcome of results) {
      if (outcome.status === "fulfilled" && outcome.value.result.gone) {
        expiredIds.push(outcome.value.subscriptionId);
      }
    }

    if (expiredIds.length > 0) {
      await ctx.runMutation(internal.push.deleteExpiredSubscriptions, {
        subscriptionIds: expiredIds,
      });
    }

    return null;
  },
});
