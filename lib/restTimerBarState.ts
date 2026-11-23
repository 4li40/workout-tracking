export const RECENT_EXPIRY_WINDOW_MS = 60_000;

export type RestTimerBarState =
  | { readonly phase: "hidden" }
  | {
      readonly phase: "running";
      readonly endsAt: number;
      readonly remainingMs: number;
    }
  | {
      readonly phase: "expired";
      readonly endsAt: number;
      readonly elapsedSinceExpiryMs: number;
    };

export function deriveRestTimerBarState(input: {
  readonly restTimerEndsAt: number | undefined;
  readonly nowMs: number;
  readonly dismissedEndsAt: number | null;
}): RestTimerBarState {
  const { restTimerEndsAt, nowMs, dismissedEndsAt } = input;
  if (restTimerEndsAt === undefined || dismissedEndsAt === restTimerEndsAt) {
    return { phase: "hidden" };
  }
  if (nowMs < restTimerEndsAt) {
    return {
      phase: "running",
      endsAt: restTimerEndsAt,
      remainingMs: restTimerEndsAt - nowMs,
    };
  }
  return {
    phase: "expired",
    endsAt: restTimerEndsAt,
    elapsedSinceExpiryMs: nowMs - restTimerEndsAt,
  };
}

export function shouldTriggerRestExpiryCue(input: {
  readonly restTimerEndsAt: number;
  readonly nowMs: number;
  readonly alreadyAlerted: boolean;
}): boolean {
  const { restTimerEndsAt, nowMs, alreadyAlerted } = input;
  if (alreadyAlerted || nowMs < restTimerEndsAt) {
    return false;
  }
  return nowMs - restTimerEndsAt <= RECENT_EXPIRY_WINDOW_MS;
}
