"use client";

import {
  Bell,
  CheckCircle2,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRestDuration } from "@/convex/lib/settings";
import { REST_ADJUST_STEP_SECONDS } from "@/convex/lib/workouts";
import {
  getPushCapability,
  type PushCapability,
} from "@/lib/pushNotifications";
import {
  deriveRestTimerBarState,
  shouldTriggerRestExpiryCue,
} from "@/lib/restTimerBarState";
import {
  getEstimatedServerNowMs,
  hasAlertedRestTimer,
  markRestTimerAlerted,
  primeRestTimerAudio,
  readRestSoundEnabled,
  triggerRestTimerCompletionCue,
  writeRestSoundEnabled,
} from "@/lib/restTimerCue";

const EXPIRED_SUBTITLE_DELAY_MS = 10_000;

interface RestTimerBarProps {
  readonly restTimerEndsAt: number | undefined;
  readonly referenceDurationSeconds: number;
  readonly restNotificationsEnabled: boolean;
  readonly pushConfigured: boolean;
  readonly onAdjust: (deltaSeconds: number) => void;
  readonly onSkip: () => void;
  readonly onRestart: (durationSeconds: number) => void;
  readonly busy: boolean;
}

function formatCountdownClock(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RestTimerBar({
  restTimerEndsAt,
  referenceDurationSeconds,
  restNotificationsEnabled,
  pushConfigured,
  onAdjust,
  onSkip,
  onRestart,
  busy,
}: RestTimerBarProps) {
  const [clock, setClock] = useState<{
    readonly forEndsAt: number | undefined;
    readonly nowMs: number;
  }>(() => ({
    forEndsAt: restTimerEndsAt,
    nowMs: getEstimatedServerNowMs(),
  }));
  const [soundEnabled, setSoundEnabled] = useState(() =>
    readRestSoundEnabled(),
  );
  const [dismissedEndsAt, setDismissedEndsAt] = useState<number | null>(null);
  const [pushCapability, setPushCapability] = useState<PushCapability | null>(
    null,
  );

  const soundEnabledRef = useRef(soundEnabled);
  const dismissedEndsAtRef = useRef(dismissedEndsAt);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    dismissedEndsAtRef.current = dismissedEndsAt;
  }, [dismissedEndsAt]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPushCapability(getPushCapability());
    }, 0);
    return () => {
      window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (restTimerEndsAt === undefined) {
      const clearId = window.setTimeout(() => {
        setClock({ forEndsAt: undefined, nowMs: getEstimatedServerNowMs() });
        setDismissedEndsAt(null);
      }, 0);
      return () => {
        window.clearTimeout(clearId);
      };
    }

    let intervalId: number | null = null;
    let intervalPeriodMs: number | null = null;

    const stopInterval = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
        intervalPeriodMs = null;
      }
    };

    const ensureInterval = (periodMs: number, callback: () => void) => {
      if (intervalId !== null && intervalPeriodMs === periodMs) {
        return;
      }
      stopInterval();
      intervalPeriodMs = periodMs;
      intervalId = window.setInterval(callback, periodMs);
    };

    const syncClock = () => {
      const currentNow = getEstimatedServerNowMs();
      setClock({ forEndsAt: restTimerEndsAt, nowMs: currentNow });

      if (currentNow < restTimerEndsAt) {
        ensureInterval(250, syncClock);
        return;
      }

      if (dismissedEndsAtRef.current === restTimerEndsAt) {
        stopInterval();
        return;
      }

      ensureInterval(1000, syncClock);
      const alreadyAlerted = hasAlertedRestTimer(restTimerEndsAt);
      if (
        shouldTriggerRestExpiryCue({
          restTimerEndsAt,
          nowMs: currentNow,
          alreadyAlerted,
        })
      ) {
        markRestTimerAlerted(restTimerEndsAt);
        triggerRestTimerCompletionCue(soundEnabledRef.current);
      } else if (!alreadyAlerted) {
        markRestTimerAlerted(restTimerEndsAt);
      }
    };

    const initialTickId = window.setTimeout(syncClock, 0);
    document.addEventListener("visibilitychange", syncClock);
    window.addEventListener("focus", syncClock);

    return () => {
      window.clearTimeout(initialTickId);
      stopInterval();
      document.removeEventListener("visibilitychange", syncClock);
      window.removeEventListener("focus", syncClock);
    };
  }, [restTimerEndsAt]);

  const effectiveNowMs =
    clock.forEndsAt === restTimerEndsAt
      ? clock.nowMs
      : getEstimatedServerNowMs();
  const barState = deriveRestTimerBarState({
    restTimerEndsAt,
    nowMs: effectiveNowMs,
    dismissedEndsAt,
  });

  if (barState.phase === "hidden") {
    return null;
  }

  function handleToggleSound() {
    const next = !soundEnabled;
    if (next) {
      primeRestTimerAudio();
    }
    setSoundEnabled(next);
    writeRestSoundEnabled(next);
  }

  const showBackgroundAlertsPrompt =
    pushConfigured &&
    !restNotificationsEnabled &&
    pushCapability !== null &&
    pushCapability.kind !== "unsupported";

  const backgroundAlertsStrip = showBackgroundAlertsPrompt ? (
    <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-secondary/40 px-3.5 py-1.5 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Bell className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {pushCapability.kind === "ios_install_required"
            ? "Add to Home Screen for lock-screen alerts"
            : pushCapability.permission === "denied"
              ? "Lock-screen alerts blocked in browser"
              : "Lock-screen alerts are off"}
        </span>
      </span>
      <Link
        href="/settings#workout-alerts"
        className="shrink-0 font-semibold text-primary hover:underline"
      >
        {pushCapability.kind === "ready" &&
        pushCapability.permission === "denied"
          ? "Settings"
          : "Enable"}
      </Link>
    </div>
  ) : null;

  if (barState.phase === "expired") {
    const elapsedSeconds = Math.floor(barState.elapsedSinceExpiryMs / 1000);
    const expiredSubtitle =
      barState.elapsedSinceExpiryMs > EXPIRED_SUBTITLE_DELAY_MS
        ? `Finished ${formatRestDuration(elapsedSeconds)} ago. Ready for your next set.`
        : "Ready for your next set.";

    return (
      <aside
        aria-live="polite"
        aria-label="Rest timer complete"
        className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-[calc(15rem+1.5rem)] md:right-6 z-30 pointer-events-none"
      >
        <div className="mx-auto max-w-2xl pointer-events-auto overflow-hidden rounded-2xl border border-success/35 bg-card shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-tint text-success">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Rest complete
                </p>
                <p className="text-xs text-muted-foreground">
                  {expiredSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  primeRestTimerAudio();
                  setDismissedEndsAt(null);
                  onRestart(referenceDurationSeconds);
                }}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                <span>{formatRestDuration(referenceDurationSeconds)}</span>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label="Dismiss rest complete notification"
                onClick={() => {
                  setDismissedEndsAt(barState.endsAt);
                  onSkip();
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {backgroundAlertsStrip}
        </div>
      </aside>
    );
  }

  const remainingMs = barState.remainingMs;
  const totalDurationMs = Math.max(
    referenceDurationSeconds * 1000,
    remainingMs,
    1000,
  );
  const progressPercent = Math.min(
    100,
    Math.max(0, (remainingMs / totalDurationMs) * 100),
  );

  return (
    <aside
      aria-label="Rest timer"
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-[calc(15rem+1.5rem)] md:right-6 z-30 pointer-events-none"
    >
      <div className="mx-auto max-w-2xl pointer-events-auto overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-lg">
        <div
          className="h-1.5 w-full bg-secondary"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Timer className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Rest timer
              </p>
              <p className="text-xl font-bold leading-tight text-foreground tabular-nums">
                {formatCountdownClock(remainingMs / 1000)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={
                soundEnabled ? "Mute timer sound" : "Enable timer sound"
              }
              aria-pressed={soundEnabled}
              onClick={handleToggleSound}
            >
              {soundEnabled ? (
                <Volume2 className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <VolumeX className="size-4" aria-hidden="true" />
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                primeRestTimerAudio();
                setDismissedEndsAt(null);
                onAdjust(-REST_ADJUST_STEP_SECONDS);
              }}
              className="tabular-nums"
            >
              -{REST_ADJUST_STEP_SECONDS}s
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                primeRestTimerAudio();
                onAdjust(REST_ADJUST_STEP_SECONDS);
              }}
              className="tabular-nums"
            >
              +{REST_ADJUST_STEP_SECONDS}s
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDismissedEndsAt(barState.endsAt);
                onSkip();
              }}
            >
              Skip
            </Button>
          </div>
        </div>
        {backgroundAlertsStrip}
      </div>
    </aside>
  );
}
