/// <reference types="vite/client" />

import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function createTestConvex() {
  const t = convexTest(schema, modules);
  registerCore(t);
  return t;
}

async function createOnboardedUser(
  t: ReturnType<typeof createTestConvex>,
  username: string,
) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const tokens = await t.mutation(
    components.auth.public._internal_dangerous_signIn,
    {
      claims: { method: "usernamePassword", profile: { username } },
      componentPath: "authPassword",
      userId,
      accessTokenTtlSeconds: 60,
      refreshInactivityTimeoutSeconds: 3600,
      sessionMaxLifetimeSeconds: 3600,
    },
  );
  const authed = t.withIdentity(sessionIdentity(tokens));
  await authed.mutation(api.userSettings.completeOnboarding, {
    unit: "kg",
    defaultRestSeconds: 90,
  });
  return { authed, userId };
}

async function seedExercise(
  t: ReturnType<typeof createTestConvex>,
): Promise<Id<"exercises">> {
  return await t.run((ctx) =>
    ctx.db.insert("exercises", {
      slug: "push-test-bench",
      name: "Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
    }),
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function generateTestVapidEnv() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return {
    VAPID_PUBLIC_KEY: base64UrlEncode(rawPublic),
    VAPID_PRIVATE_KEY: jwk.d!,
    VAPID_SUBJECT: "mailto:test@example.com",
  };
}

async function generateTestSubscriptionKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const auth = new Uint8Array(16);
  crypto.getRandomValues(auth);
  return {
    p256dh: base64UrlEncode(rawPublic),
    auth: base64UrlEncode(auth),
  };
}

describe("Web Push subscriptions, auth, and rest timer scheduling", () => {
  it("enforces auth, validation, ownership, and secret protection on push endpoints", async () => {
    const t = createTestConvex();
    const { authed: alice } = await createOnboardedUser(t, "alice_push");
    const { authed: bob } = await createOnboardedUser(t, "bob_push");
    const subKeys = await generateTestSubscriptionKeys();

    await expect(t.query(api.push.getPushConfig, {})).rejects.toThrow(
      /UNAUTHENTICATED|signed in/i,
    );
    await expect(
      t.mutation(api.push.upsertSubscription, {
        endpoint: "https://push.example.com/unauth",
        p256dh: subKeys.p256dh,
        auth: subKeys.auth,
      }),
    ).rejects.toThrow(/UNAUTHENTICATED|signed in/i);
    await expect(
      t.mutation(api.push.removeSubscription, {
        endpoint: "https://push.example.com/unauth",
      }),
    ).rejects.toThrow(/UNAUTHENTICATED|signed in/i);

    await expect(
      alice.mutation(api.push.upsertSubscription, {
        endpoint: "http://insecure.example.com/sub",
        p256dh: subKeys.p256dh,
        auth: subKeys.auth,
      }),
    ).rejects.toThrow(/INVALID_ARGUMENT|https/i);

    await expect(
      alice.mutation(api.push.upsertSubscription, {
        endpoint: "https://push.example.com/sub-empty-keys",
        p256dh: "   ",
        auth: subKeys.auth,
      }),
    ).rejects.toThrow(/INVALID_ARGUMENT/i);

    const originalEnv = {
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    };
    const vapidEnv = await generateTestVapidEnv();
    process.env.VAPID_PUBLIC_KEY = vapidEnv.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = vapidEnv.VAPID_PRIVATE_KEY;
    process.env.VAPID_SUBJECT = vapidEnv.VAPID_SUBJECT;

    try {
      const endpoint = "https://push.example.com/alice-device-1";
      await alice.mutation(api.push.upsertSubscription, {
        endpoint,
        p256dh: subKeys.p256dh,
        auth: subKeys.auth,
        userAgent: "TestBrowser/1.0",
      });
      // Upserting the same endpoint updates in place instead of duplicating
      await alice.mutation(api.push.upsertSubscription, {
        endpoint,
        p256dh: subKeys.p256dh,
        auth: subKeys.auth,
        userAgent: "TestBrowser/2.0",
      });

      const config = await alice.query(api.push.getPushConfig, {});
      expect(config).toEqual({
        configured: true,
        publicKey: vapidEnv.VAPID_PUBLIC_KEY,
        subscriptionCount: 1,
      });
      expect(JSON.stringify(config)).not.toContain(vapidEnv.VAPID_PRIVATE_KEY);

      await expect(
        bob.mutation(api.push.removeSubscription, { endpoint }),
      ).rejects.toThrow(/FORBIDDEN|do not have access/i);

      await alice.mutation(api.push.removeSubscription, { endpoint });
      const configAfterRemove = await alice.query(api.push.getPushConfig, {});
      expect(configAfterRemove.subscriptionCount).toBe(0);
    } finally {
      process.env.VAPID_PUBLIC_KEY = originalEnv.VAPID_PUBLIC_KEY;
      process.env.VAPID_PRIVATE_KEY = originalEnv.VAPID_PRIVATE_KEY;
      process.env.VAPID_SUBJECT = originalEnv.VAPID_SUBJECT;
    }
  });

  it("schedules, adjusts, cancels, and safely skips completed jobs across workout mutations", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
      const t = createTestConvex();
      const { authed, userId } = await createOnboardedUser(t, "alice_schedule");
      const benchId = await seedExercise(t);
      const subKeys = await generateTestSubscriptionKeys();

      const initialShell = await authed.query(
        api.userSettings.getAppShellState,
        {},
      );
      expect(initialShell.settings?.restNotificationsEnabled).toBe(false);
      expect(initialShell.settings?.keepScreenAwake).toBe(false);

      await authed.mutation(api.userSettings.updateSettings, {
        restNotificationsEnabled: true,
        keepScreenAwake: true,
      });
      await authed.mutation(api.push.upsertSubscription, {
        endpoint: "https://push.example.com/schedule-device",
        p256dh: subKeys.p256dh,
        auth: subKeys.auth,
      });

      const started = await authed.mutation(api.workouts.startWorkout, {
        title: "Push Session",
      });
      if (started.kind !== "started") throw new Error("Expected started");
      const added = await authed.mutation(api.workouts.addWorkoutExercise, {
        workoutId: started.workoutId,
        exerciseId: benchId,
        restSeconds: 90,
      });

      // Completing a working set schedules the push job
      const setRes = await authed.mutation(api.workouts.upsertSet, {
        workoutExerciseId: added.workoutExerciseId,
        setId: added.setId,
        setType: "working",
        weightKg: 80,
        enteredUnit: "kg",
        reps: 8,
        completed: true,
      });
      expect(setRes.restTimerEndsAt).toBeDefined();

      const workoutAfterSet = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      const firstJobId = workoutAfterSet?.restTimerScheduledJobId;
      expect(firstJobId).toBeDefined();

      const firstJob = await t.run((ctx) =>
        ctx.db.system.get("_scheduled_functions", firstJobId!),
      );
      expect(firstJob?.state.kind).toBe("pending");
      expect(firstJob?.name).toContain("sendRestTimerNotification");

      // Adjusting +15s cancels the prior pending job and schedules a new one
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "adjust", deltaSeconds: 15 },
      });

      const workoutAfterAdjust = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      const secondJobId = workoutAfterAdjust?.restTimerScheduledJobId;
      expect(secondJobId).toBeDefined();
      expect(secondJobId).not.toBe(firstJobId);

      const [firstJobAfterAdjust, secondJob] = await t.run(async (ctx) => [
        await ctx.db.system.get("_scheduled_functions", firstJobId!),
        await ctx.db.system.get("_scheduled_functions", secondJobId!),
      ]);
      expect(firstJobAfterAdjust?.state.kind).toBe("canceled");
      expect(secondJob?.state.kind).toBe("pending");

      // Adjusting <= 0 cancels pending job and clears restTimerScheduledJobId
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "adjust", deltaSeconds: -300 },
      });

      const workoutAfterExpireAdjust = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      expect(workoutAfterExpireAdjust?.restTimerEndsAt).toBeUndefined();
      expect(workoutAfterExpireAdjust?.restTimerScheduledJobId).toBeUndefined();

      const secondJobAfterExpire = await t.run((ctx) =>
        ctx.db.system.get("_scheduled_functions", secondJobId!),
      );
      expect(secondJobAfterExpire?.state.kind).toBe("canceled");

      // Start via updateRestTimer, then skip
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "start", durationSeconds: 60 },
      });
      const workoutAfterStart = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      const thirdJobId = workoutAfterStart?.restTimerScheduledJobId;
      expect(thirdJobId).toBeDefined();

      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "skip" },
      });
      const [workoutAfterSkip, thirdJobAfterSkip] = await t.run(async (ctx) => [
        await ctx.db.get("workouts", started.workoutId),
        await ctx.db.system.get("_scheduled_functions", thirdJobId!),
      ]);
      expect(workoutAfterSkip?.restTimerScheduledJobId).toBeUndefined();
      expect(thirdJobAfterSkip?.state.kind).toBe("canceled");

      // Critical edge case: if the prior scheduled job already completed,
      // subsequent skip / adjust / finishWorkout / discardWorkout must NOT throw!
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "start", durationSeconds: 45 },
      });
      const workoutWithCompletedJob = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      const completedJobId = workoutWithCompletedJob!.restTimerScheduledJobId!;
      await t.run(async (ctx) => {
        // Simulate Convex having already executed the scheduled job
        await ctx.db.patch(
          completedJobId as unknown as Id<"_scheduled_functions">,
          { state: { kind: "success" } } as never,
        );
      });

      await expect(
        authed.mutation(api.workouts.updateRestTimer, {
          workoutId: started.workoutId,
          action: { kind: "skip" },
        }),
      ).resolves.not.toThrow();

      // Start timer then finishWorkout cancels the pending job
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started.workoutId,
        action: { kind: "start", durationSeconds: 90 },
      });
      const beforeFinish = await t.run((ctx) =>
        ctx.db.get("workouts", started.workoutId),
      );
      const finishJobId = beforeFinish!.restTimerScheduledJobId!;
      await authed.mutation(api.workouts.finishWorkout, {
        workoutId: started.workoutId,
      });
      const [afterFinish, finishJobAfter] = await t.run(async (ctx) => [
        await ctx.db.get("workouts", started.workoutId),
        await ctx.db.system.get("_scheduled_functions", finishJobId),
      ]);
      expect(afterFinish?.restTimerScheduledJobId).toBeUndefined();
      expect(finishJobAfter?.state.kind).toBe("canceled");

      // Start second workout + timer, test toggling restNotificationsEnabled and discardWorkout
      const started2 = await authed.mutation(api.workouts.startWorkout, {
        title: "Pull Session",
      });
      if (started2.kind !== "started") throw new Error("Expected started2");

      await authed.mutation(api.userSettings.updateSettings, {
        restNotificationsEnabled: false,
      });
      await authed.mutation(api.workouts.updateRestTimer, {
        workoutId: started2.workoutId,
        action: { kind: "start", durationSeconds: 120 },
      });
      const workoutWhileDisabled = await t.run((ctx) =>
        ctx.db.get("workouts", started2.workoutId),
      );
      expect(workoutWhileDisabled?.restTimerScheduledJobId).toBeUndefined();

      // Re-enabling restNotificationsEnabled mid-timer schedules the job
      await authed.mutation(api.userSettings.updateSettings, {
        restNotificationsEnabled: true,
      });
      const workoutAfterReenable = await t.run((ctx) =>
        ctx.db.get("workouts", started2.workoutId),
      );
      const discardJobId = workoutAfterReenable?.restTimerScheduledJobId;
      expect(discardJobId).toBeDefined();

      // Discarding cancels the pending job cleanly
      await authed.mutation(api.workouts.discardWorkout, {
        workoutId: started2.workoutId,
      });
      const discardJobAfter = await t.run((ctx) =>
        ctx.db.system.get("_scheduled_functions", discardJobId!),
      );
      expect(discardJobAfter?.state.kind).toBe("canceled");

      const remainingSubs = await t.run((ctx) =>
        ctx.db
          .query("pushSubscriptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(10),
      );
      expect(remainingSubs).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("delivers encrypted push via sendRestTimerNotification and deletes 410 gone subscriptions", async () => {
    const t = createTestConvex();
    const { authed } = await createOnboardedUser(t, "alice_deliver");
    const subKeys = await generateTestSubscriptionKeys();

    await authed.mutation(api.userSettings.updateSettings, {
      restNotificationsEnabled: true,
    });
    await authed.mutation(api.push.upsertSubscription, {
      endpoint: "https://push.example.com/active-sub",
      p256dh: subKeys.p256dh,
      auth: subKeys.auth,
    });
    await authed.mutation(api.push.upsertSubscription, {
      endpoint: "https://push.example.com/gone-sub",
      p256dh: subKeys.p256dh,
      auth: subKeys.auth,
    });

    const started = await authed.mutation(api.workouts.startWorkout, {
      title: "Upper Body",
    });
    if (started.kind !== "started") throw new Error("Expected started");
    const timerRes = await authed.mutation(api.workouts.updateRestTimer, {
      workoutId: started.workoutId,
      action: { kind: "start", durationSeconds: 60 },
    });

    const originalEnv = {
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    };
    const vapidEnv = await generateTestVapidEnv();
    process.env.VAPID_PUBLIC_KEY = vapidEnv.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = vapidEnv.VAPID_PRIVATE_KEY;
    process.env.VAPID_SUBJECT = vapidEnv.VAPID_SUBJECT;

    const sentEndpoints: string[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        sentEndpoints.push(url);
        if (url.endsWith("/gone-sub")) {
          return new Response(null, { status: 410 });
        }
        return new Response(null, { status: 201 });
      });

    try {
      await t.action(internal.push.sendRestTimerNotification, {
        workoutId: started.workoutId,
        expectedEndsAt: timerRes.restTimerEndsAt!,
      });

      expect(sentEndpoints.sort()).toEqual([
        "https://push.example.com/active-sub",
        "https://push.example.com/gone-sub",
      ]);

      const configAfter = await authed.query(api.push.getPushConfig, {});
      expect(configAfter.subscriptionCount).toBe(1);
    } finally {
      fetchSpy.mockRestore();
      process.env.VAPID_PUBLIC_KEY = originalEnv.VAPID_PUBLIC_KEY;
      process.env.VAPID_PRIVATE_KEY = originalEnv.VAPID_PRIVATE_KEY;
      process.env.VAPID_SUBJECT = originalEnv.VAPID_SUBJECT;
    }
  });
});
