"use client";

import {
  CheckCircle2,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRestDuration } from "@/convex/lib/settings";
import { REST_ADJUST_STEP_SECONDS } from "@/convex/lib/workouts";
import {
  getEstimatedServerNowMs,
  hasAlertedRestTimer,
  markRestTimerAlerted,
  primeRestTimerAudio,
  readRestSoundEnabled,
  triggerRestTimerCompletionCue,
  writeRestSoundEnabled,
} from "@/lib/restTimerCue";

const RECENT_EXPIRY_WINDOW_MS = 60_000;
const COMPLETED_BANNER_DURATION_MS = 6000;

interface RestTimerBarProps {
  readonly restTimerEndsAt: number | undefined;
  readonly referenceDurationSeconds: number;
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
  const [completedAlertEndsAt, setCompletedAlertEndsAt] = useState<
    number | null
  >(null);

  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if (restTimerEndsAt === undefined) {
      const clearId = window.setTimeout(() => {
        setClock({ forEndsAt: undefined, nowMs: getEstimatedServerNowMs() });
        setCompletedAlertEndsAt(null);
      }, 0);
      return () => {
        window.clearTimeout(clearId);
      };
    }

    let intervalId: number | null = null;
    const stopInterval = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const syncClock = () => {
      const currentNow = getEstimatedServerNowMs();
      setClock({ forEndsAt: restTimerEndsAt, nowMs: currentNow });
      if (currentNow < restTimerEndsAt) {
        if (intervalId === null) {
          intervalId = window.setInterval(syncClock, 250);
        }
        setCompletedAlertEndsAt((previous) =>
          previous !== null && previous !== restTimerEndsAt ? null : previous,
        );
        return;
      }
      stopInterval();
      if (!hasAlertedRestTimer(restTimerEndsAt)) {
        markRestTimerAlerted(restTimerEndsAt);
        if (currentNow - restTimerEndsAt <= RECENT_EXPIRY_WINDOW_MS) {
          triggerRestTimerCompletionCue(soundEnabledRef.current);
          setCompletedAlertEndsAt(restTimerEndsAt);
        }
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

  useEffect(() => {
    if (completedAlertEndsAt === null) {
      return;
    }
    const dismissTimer = window.setTimeout(() => {
      setCompletedAlertEndsAt(null);
    }, COMPLETED_BANNER_DURATION_MS);

    return () => {
      window.clearTimeout(dismissTimer);
    };
  }, [completedAlertEndsAt]);

  const clockFreshForNewTimer =
    clock.forEndsAt === restTimerEndsAt ||
    (clock.forEndsAt !== undefined && clock.forEndsAt > clock.nowMs);
  const remainingMs =
    restTimerEndsAt !== undefined && clockFreshForNewTimer
      ? Math.max(0, restTimerEndsAt - clock.nowMs)
      : 0;
  const isRunning = restTimerEndsAt !== undefined && remainingMs > 0;
  const showCompletedBanner =
    !isRunning &&
    completedAlertEndsAt !== null &&
    restTimerEndsAt === completedAlertEndsAt;

  if (!isRunning && !showCompletedBanner) {
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

  if (showCompletedBanner) {
    return (
      <aside
        aria-live="polite"
        aria-label="Rest timer complete"
        className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-[calc(15rem+1.5rem)] md:right-6 z-30 pointer-events-none"
      >
        <div className="mx-auto max-w-2xl pointer-events-auto rounded-2xl border border-success/35 bg-card p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-tint text-success">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Rest complete
                </p>
                <p className="text-xs text-muted-foreground">
                  Ready for your next set.
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
                  setCompletedAlertEndsAt(null);
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
                aria-label="Dismiss rest complete notification"
                onClick={() => setCompletedAlertEndsAt(null)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
    );
  }

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
                setCompletedAlertEndsAt(null);
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
                setCompletedAlertEndsAt(null);
                onSkip();
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
