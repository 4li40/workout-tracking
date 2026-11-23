import { describe, expect, it } from "vitest";
import {
  deriveRestTimerBarState,
  RECENT_EXPIRY_WINDOW_MS,
  shouldTriggerRestExpiryCue,
} from "./restTimerBarState";

describe("deriveRestTimerBarState", () => {
  it("hides the bar when no rest timer is active", () => {
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: undefined,
        nowMs: 100_000,
        dismissedEndsAt: null,
      }),
    ).toEqual({ phase: "hidden" });
  });

  it("returns running state while nowMs is before restTimerEndsAt", () => {
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: 190_000,
        nowMs: 100_000,
        dismissedEndsAt: null,
      }),
    ).toEqual({
      phase: "running",
      endsAt: 190_000,
      remainingMs: 90_000,
    });
  });

  it("surfaces expired state immediately at expiry and keeps it visible >60s after expiry", () => {
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: 100_000,
        nowMs: 100_000,
        dismissedEndsAt: null,
      }),
    ).toEqual({
      phase: "expired",
      endsAt: 100_000,
      elapsedSinceExpiryMs: 0,
    });

    // Returning from lock screen 2 minutes after expiry must still surface "Rest complete"
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: 100_000,
        nowMs: 100_000 + RECENT_EXPIRY_WINDOW_MS + 60_000,
        dismissedEndsAt: null,
      }),
    ).toEqual({
      phase: "expired",
      endsAt: 100_000,
      elapsedSinceExpiryMs: 120_000,
    });
  });

  it("hides the bar only after the user explicitly dismisses that specific timer", () => {
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: 100_000,
        nowMs: 220_000,
        dismissedEndsAt: 100_000,
      }),
    ).toEqual({ phase: "hidden" });

    // A new timer with a different endsAt surfaces again
    expect(
      deriveRestTimerBarState({
        restTimerEndsAt: 310_000,
        nowMs: 220_000,
        dismissedEndsAt: 100_000,
      }),
    ).toEqual({
      phase: "running",
      endsAt: 310_000,
      remainingMs: 90_000,
    });
  });
});

describe("shouldTriggerRestExpiryCue", () => {
  it("triggers audio/vibration cue only within RECENT_EXPIRY_WINDOW_MS when not yet alerted", () => {
    expect(RECENT_EXPIRY_WINDOW_MS).toBe(60_000);

    // Not expired yet
    expect(
      shouldTriggerRestExpiryCue({
        restTimerEndsAt: 100_000,
        nowMs: 99_999,
        alreadyAlerted: false,
      }),
    ).toBe(false);

    // Just expired
    expect(
      shouldTriggerRestExpiryCue({
        restTimerEndsAt: 100_000,
        nowMs: 100_000,
        alreadyAlerted: false,
      }),
    ).toBe(true);

    // At boundary of recent expiry window
    expect(
      shouldTriggerRestExpiryCue({
        restTimerEndsAt: 100_000,
        nowMs: 100_000 + RECENT_EXPIRY_WINDOW_MS,
        alreadyAlerted: false,
      }),
    ).toBe(true);

    // Already alerted
    expect(
      shouldTriggerRestExpiryCue({
        restTimerEndsAt: 100_000,
        nowMs: 105_000,
        alreadyAlerted: true,
      }),
    ).toBe(false);

    // Too late after expiry (>60s) -> suppress delayed chime while keeping visual banner
    expect(
      shouldTriggerRestExpiryCue({
        restTimerEndsAt: 100_000,
        nowMs: 100_000 + RECENT_EXPIRY_WINDOW_MS + 1,
        alreadyAlerted: false,
      }),
    ).toBe(false);
  });
});
