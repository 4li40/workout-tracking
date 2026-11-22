"use client";

import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, Check, Minus, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/convex/lib/exercises";
import {
  formatRestDuration,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  parseRestSeconds,
  REST_TIMER_PRESETS,
} from "@/convex/lib/settings";
import {
  MAX_TARGET_REPS_LENGTH,
  MAX_TARGET_SETS,
  MIN_TARGET_SETS,
  parseTargetReps,
  parseTargetSets,
} from "@/convex/lib/templates";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { TemplateExerciseItem } from "./types";

const REST_STEP_SECONDS = 15;
const SAVED_BADGE_MS = 2500;

interface TemplateExerciseRowProps {
  readonly item: TemplateExerciseItem;
  readonly index: number;
  readonly totalCount: number;
  readonly reordering: boolean;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
  readonly removing: boolean;
}

export function TemplateExerciseRow({
  item,
  index,
  totalCount,
  reordering,
  onMoveUp,
  onMoveDown,
  onRemove,
  removing,
}: TemplateExerciseRowProps) {
  const updateExercise = useMutation(api.templates.updateExercise);

  const [draftSets, setDraftSets] = useState<number | null>(null);
  const [draftReps, setDraftReps] = useState<string | null>(null);
  const [draftRest, setDraftRest] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repsInputId = useId();
  const restInputId = useId();

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const currentSets = draftSets ?? item.targetSets;
  const serverReps = item.targetReps ?? "";
  const currentReps = draftReps ?? serverReps;
  const serverRest = String(item.restSeconds);
  const currentRest = draftRest ?? serverRest;

  const isDirty =
    (draftSets !== null && draftSets !== item.targetSets) ||
    (draftReps !== null && draftReps.trim() !== serverReps) ||
    (draftRest !== null && draftRest.trim() !== serverRest);

  const busy = saving || removing || reordering;

  function showSavedBadge() {
    setSaved(true);
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      setSaved(false);
    }, SAVED_BADGE_MS);
  }

  function clearDrafts() {
    setDraftSets(null);
    setDraftReps(null);
    setDraftRest(null);
  }

  async function commitValues(next: {
    targetSets: number;
    repsRaw: string;
    restRaw: string;
  }) {
    if (saving || removing) {
      return;
    }

    const parsedSets = parseTargetSets(next.targetSets);
    if (parsedSets.kind === "error") {
      setError(parsedSets.message);
      setSaved(false);
      return;
    }

    const parsedReps = parseTargetReps(next.repsRaw);
    if (parsedReps.kind === "error") {
      setError(parsedReps.message);
      setSaved(false);
      return;
    }

    const trimmedRest = next.restRaw.trim();
    const parsedRest = parseRestSeconds(
      trimmedRest === "" ? Number.NaN : Number(trimmedRest),
    );
    if (parsedRest.kind === "error") {
      setError(parsedRest.message);
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateExercise({
        templateExerciseId: item._id,
        targetSets: parsedSets.targetSets,
        targetReps: parsedReps.targetReps,
        restSeconds: parsedRest.seconds,
      });
      clearDrafts();
      showSavedBadge();
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not update exercise targets. Please try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleStepSets(delta: number) {
    const nextSets = Math.min(
      MAX_TARGET_SETS,
      Math.max(MIN_TARGET_SETS, currentSets + delta),
    );
    if (nextSets === currentSets) {
      return;
    }

    setError(null);
    setSaved(false);

    const parsedReps = parseTargetReps(currentReps);
    const trimmedRest = currentRest.trim();
    const parsedRest = parseRestSeconds(
      trimmedRest === "" ? Number.NaN : Number(trimmedRest),
    );
    if (parsedReps.kind === "ok" && parsedRest.kind === "ok") {
      setDraftSets(nextSets);
      void commitValues({
        targetSets: nextSets,
        repsRaw: currentReps,
        restRaw: currentRest,
      });
      return;
    }

    setDraftSets(nextSets === item.targetSets ? null : nextSets);
  }

  function handleSelectRestPreset(seconds: number) {
    setError(null);
    setSaved(false);

    const parsedReps = parseTargetReps(currentReps);
    if (parsedReps.kind === "ok") {
      setDraftRest(String(seconds));
      void commitValues({
        targetSets: currentSets,
        repsRaw: currentReps,
        restRaw: String(seconds),
      });
      return;
    }

    setDraftRest(seconds === item.restSeconds ? null : String(seconds));
  }

  function handleStepRest(delta: number) {
    const trimmed = currentRest.trim();
    const numeric = trimmed === "" ? Number.NaN : Number(trimmed);
    const baseSeconds = Number.isFinite(numeric)
      ? Math.round(numeric)
      : item.restSeconds;
    const nextSeconds = Math.min(
      MAX_REST_SECONDS,
      Math.max(MIN_REST_SECONDS, baseSeconds + delta),
    );
    setError(null);
    setSaved(false);
    setDraftRest(nextSeconds === item.restSeconds ? null : String(nextSeconds));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void commitValues({
      targetSets: currentSets,
      repsRaw: currentReps,
      restRaw: currentRest,
    });
  }

  return (
    <Card asChild>
      <article className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="accent" className="tabular-nums">
                #{index + 1}
              </Badge>
              <h3 className="truncate text-base font-semibold text-foreground">
                {item.exerciseName}
              </h3>
              {saved && (
                <Badge role="status" variant="success" className="shrink-0">
                  <Check className="size-3" aria-hidden="true" />
                  Saved
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">
                {MUSCLE_GROUP_LABELS[item.muscleGroup]}
              </Badge>
              <Badge variant="secondary">
                {EQUIPMENT_LABELS[item.equipment]}
              </Badge>
              {item.isBodyweight && <Badge variant="accent">Bodyweight</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy || index === 0}
              onClick={onMoveUp}
              aria-label={`Move ${item.exerciseName} up`}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy || index === totalCount - 1}
              onClick={onMoveDown}
              aria-label={`Move ${item.exerciseName} down`}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              onClick={onRemove}
              aria-label={`Remove ${item.exerciseName}`}
              className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Default sets
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  disabled={busy || currentSets <= MIN_TARGET_SETS}
                  onClick={() => handleStepSets(-1)}
                  aria-label={`Decrease target sets for ${item.exerciseName}`}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <span className="min-w-12 text-center text-base font-semibold text-foreground tabular-nums">
                  {currentSets}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  disabled={busy || currentSets >= MAX_TARGET_SETS}
                  onClick={() => handleStepSets(1)}
                  aria-label={`Increase target sets for ${item.exerciseName}`}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor={repsInputId}
                className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Target reps
              </Label>
              <Input
                id={repsInputId}
                value={currentReps}
                maxLength={MAX_TARGET_REPS_LENGTH}
                disabled={busy}
                placeholder="e.g. 8-10"
                onChange={(event) => {
                  const next = event.target.value;
                  setError(null);
                  setSaved(false);
                  setDraftReps(next.trim() === serverReps ? null : next);
                }}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={restInputId}
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Rest timer (seconds)
              </Label>
              <Badge variant="accent" className="tabular-nums">
                {formatRestDuration(item.restSeconds)}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {REST_TIMER_PRESETS.map((preset) => {
                const isActive =
                  draftRest === null && item.restSeconds === preset;
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "secondary"}
                    disabled={busy}
                    onClick={() => handleSelectRestPreset(preset)}
                    className="tabular-nums"
                  >
                    {formatRestDuration(preset)}
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => handleStepRest(-REST_STEP_SECONDS)}
                aria-label={`Decrease rest timer for ${item.exerciseName} by ${REST_STEP_SECONDS} seconds`}
                className="gap-1 px-3"
              >
                <Minus className="size-4" aria-hidden="true" />
                <span>{REST_STEP_SECONDS}s</span>
              </Button>

              <Input
                id={restInputId}
                type="number"
                inputMode="numeric"
                min={MIN_REST_SECONDS}
                max={MAX_REST_SECONDS}
                step={1}
                disabled={busy}
                value={currentRest}
                onChange={(event) => {
                  const next = event.target.value;
                  setError(null);
                  setSaved(false);
                  setDraftRest(next.trim() === serverRest ? null : next);
                }}
                className="w-24 flex-1 bg-secondary text-center text-base font-semibold tabular-nums focus-visible:bg-card sm:flex-none"
              />

              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => handleStepRest(REST_STEP_SECONDS)}
                aria-label={`Increase rest timer for ${item.exerciseName} by ${REST_STEP_SECONDS} seconds`}
                className="gap-1 px-3"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>{REST_STEP_SECONDS}s</span>
              </Button>

              {isDirty && (
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={busy}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      clearDrafts();
                      setError(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </div>

          {error !== null && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </article>
    </Card>
  );
}
