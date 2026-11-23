import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function cancelPendingScheduledJob(
  ctx: MutationCtx,
  scheduledJobId: Id<"_scheduled_functions"> | undefined,
): Promise<void> {
  if (scheduledJobId === undefined) {
    return;
  }
  const scheduled = await ctx.db.system.get(
    "_scheduled_functions",
    scheduledJobId,
  );
  if (scheduled !== null && scheduled.state.kind === "pending") {
    await ctx.scheduler.cancel(scheduledJobId);
  }
}

export async function syncRestTimerPushSchedule(
  ctx: MutationCtx,
  params: {
    readonly workoutId: Id<"workouts">;
    readonly userId: Id<"users">;
    readonly previousJobId: Id<"_scheduled_functions"> | undefined;
    readonly restTimerEndsAt: number | undefined;
    readonly now?: number;
    readonly workoutDeleted?: boolean;
  },
): Promise<Id<"_scheduled_functions"> | undefined> {
  await cancelPendingScheduledJob(ctx, params.previousJobId);

  if (params.workoutDeleted === true) {
    return undefined;
  }

  const now = params.now ?? Date.now();
  let nextJobId: Id<"_scheduled_functions"> | undefined;

  if (params.restTimerEndsAt !== undefined && params.restTimerEndsAt > now) {
    const [settings, firstSubscription] = await Promise.all([
      ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", params.userId))
        .unique(),
      ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", params.userId))
        .first(),
    ]);

    if (
      settings?.restNotificationsEnabled === true &&
      firstSubscription !== null
    ) {
      nextJobId = await ctx.scheduler.runAt(
        params.restTimerEndsAt,
        internal.push.sendRestTimerNotification,
        {
          workoutId: params.workoutId,
          expectedEndsAt: params.restTimerEndsAt,
        },
      );
    }
  }

  if (nextJobId !== params.previousJobId) {
    await ctx.db.patch("workouts", params.workoutId, {
      restTimerScheduledJobId: nextJobId,
    });
  }

  return nextJobId;
}

export async function syncActiveWorkoutRestTimerPushSchedule(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const activeWorkout = await ctx.db
    .query("workouts")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "in_progress"),
    )
    .order("desc")
    .first();

  if (activeWorkout === null) {
    return;
  }

  await syncRestTimerPushSchedule(ctx, {
    workoutId: activeWorkout._id,
    userId,
    previousJobId: activeWorkout.restTimerScheduledJobId,
    restTimerEndsAt: activeWorkout.restTimerEndsAt,
  });
}
