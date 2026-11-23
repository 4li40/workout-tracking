"use client";

import { Check, Copy, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Id } from "@/convex/_generated/dataModel";
import type { SetType, WeightUnit } from "@/convex/lib/validators";
import {
  evaluateSetProgression,
  formatSetPreviousLabel,
  formatWeightFromKg,
  MAX_REPS,
  parseRepsInputString,
  parseWeightInputString,
  type PreviousSetPerformance,
  SET_TYPE_META,
  SET_TYPE_ORDER,
  stepWeightKg,
  validateCompletedSet,
  WEIGHT_INCREMENT_BY_UNIT,
} from "@/convex/lib/workouts";
import { primeRestTimerAudio } from "@/lib/restTimerCue";
import type { LocalSetDraft } from "@/lib/workoutDraftStorage";
import type { WorkoutSetDetail } from "./types";

const SET_SAVE_DEBOUNCE_MS = 400;

const SET_TYPE_PILL_STYLES: Record<SetType, string> = {
  working: "border-border bg-secondary text-foreground hover:border-primary/40",
  warmup:
    "border-warning/30 bg-warning-tint text-warning hover:border-warning/60",
  drop: "border-primary/30 bg-accent text-primary hover:border-primary/60",
  failure:
    "border-destructive/30 bg-destructive-tint text-destructive hover:border-destructive/60",
};

const PROGRESSION_LABELS = {
  weight: "+Weight",
  reps: "+Reps",
  volume: "+Vol",
} as const;

export interface UpsertSetCommitPayload {
  readonly setId: Id<"sets">;
  readonly setType: SetType;
  readonly weightKg: number;
  readonly enteredUnit: WeightUnit;
  readonly reps: number;
  readonly completed: boolean;
}

interface WorkoutSetRowProps {
  readonly workoutExerciseId: Id<"workoutExercises">;
  readonly set: WorkoutSetDetail;
  readonly recoveredDraft: LocalSetDraft | undefined;
  readonly workingDisplayNumber: number | null;
  readonly previous: PreviousSetPerformance | null;
  readonly unit: WeightUnit;
  readonly isBodyweight: boolean;
  readonly isActiveRow: boolean;
  readonly deleting: boolean;
  readonly onActivate: () => void;
  readonly onWriteLocalDraft: (draft: LocalSetDraft) => void;
  readonly onClearLocalDraft: (setId: Id<"sets">) => void;
  readonly onCommitSet: (payload: UpsertSetCommitPayload) => Promise<void>;
  readonly onDeleteSet: (setId: Id<"sets">) => Promise<void>;
}

export function WorkoutSetRow({
  workoutExerciseId,
  set,
  recoveredDraft,
  workingDisplayNumber,
  previous,
  unit,
  isBodyweight,
  isActiveRow,
  deleting,
  onActivate,
  onWriteLocalDraft,
  onClearLocalDraft,
  onCommitSet,
  onDeleteSet,
}: WorkoutSetRowProps) {
  const effectiveSetType = recoveredDraft?.setType ?? set.setType;
  const effectiveWeightKg = recoveredDraft?.weightKg ?? set.weightKg;
  const effectiveEnteredUnit = recoveredDraft?.enteredUnit ?? set.enteredUnit;
  const effectiveReps = recoveredDraft?.reps ?? set.reps;
  const effectiveCompleted = recoveredDraft?.completed ?? set.completed;

  const serverWeightText =
    effectiveWeightKg <= 0 ? "" : formatWeightFromKg(effectiveWeightKg, unit);
  const serverRepsText = effectiveReps <= 0 ? "" : String(effectiveReps);

  const [weightDraft, setWeightDraft] = useState<{
    readonly unit: WeightUnit;
    readonly value: string;
  } | null>(null);
  const [repsDraft, setRepsDraft] = useState<string | null>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSequenceRef = useRef(0);
  const weightFocusedRef = useRef(false);
  const repsFocusedRef = useRef(false);
  const latestPayloadRef = useRef<UpsertSetCommitPayload>({
    setId: set._id,
    setType: effectiveSetType,
    weightKg: effectiveWeightKg,
    enteredUnit: effectiveEnteredUnit,
    reps: effectiveReps,
    completed: effectiveCompleted,
  });

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const activeWeightDraft =
    weightDraft !== null && weightDraft.unit === unit ? weightDraft : null;
  const weightText =
    activeWeightDraft !== null ? activeWeightDraft.value : serverWeightText;
  const repsText = repsDraft !== null ? repsDraft : serverRepsText;

  function resolveCurrentValues(skip?: {
    readonly weight?: boolean;
    readonly reps?: boolean;
  }):
    | {
        readonly kind: "ok";
        readonly payload: UpsertSetCommitPayload;
      }
    | {
        readonly kind: "error";
        readonly message: string;
      } {
    let resolvedWeightKg = effectiveWeightKg;
    let resolvedEnteredUnit = effectiveEnteredUnit;
    if (!skip?.weight && activeWeightDraft !== null) {
      const parsedWeight = parseWeightInputString(
        activeWeightDraft.value,
        unit,
      );
      if (parsedWeight.kind === "error") {
        return parsedWeight;
      }
      resolvedWeightKg = parsedWeight.weightKg;
      resolvedEnteredUnit = unit;
    }

    let resolvedReps = effectiveReps;
    if (!skip?.reps && repsDraft !== null) {
      const parsedReps = parseRepsInputString(repsDraft);
      if (parsedReps.kind === "error") {
        return parsedReps;
      }
      resolvedReps = parsedReps.reps;
    }

    return {
      kind: "ok",
      payload: {
        setId: set._id,
        setType: effectiveSetType,
        weightKg: resolvedWeightKg,
        enteredUnit: resolvedEnteredUnit,
        reps: resolvedReps,
        completed: effectiveCompleted,
      },
    };
  }

  function clearDebounceTimer() {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function persistLocalDraft(payload: UpsertSetCommitPayload) {
    onWriteLocalDraft({
      setId: payload.setId,
      workoutExerciseId,
      setType: payload.setType,
      weightKg: payload.weightKg,
      enteredUnit: payload.enteredUnit,
      reps: payload.reps,
      completed: payload.completed,
    });
  }

  async function executeCommit(
    payload: UpsertSetCommitPayload,
    capturedWeightDraft: typeof weightDraft,
    capturedRepsDraft: typeof repsDraft,
    capturedSeq: number,
  ) {
    try {
      await onCommitSet(payload);
      if (editSequenceRef.current === capturedSeq) {
        onClearLocalDraft(payload.setId);
      }
      if (!weightFocusedRef.current) {
        setWeightDraft((current) =>
          current === capturedWeightDraft ? null : current,
        );
      }
      if (!repsFocusedRef.current) {
        setRepsDraft((current) =>
          current === capturedRepsDraft ? null : current,
        );
      }
    } catch {
      return;
    }
  }

  function scheduleDebouncedCommit(
    payload: UpsertSetCommitPayload,
    nextWeightDraft: typeof weightDraft,
    nextRepsDraft: typeof repsDraft,
    seq: number,
  ) {
    latestPayloadRef.current = payload;
    clearDebounceTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void executeCommit(payload, nextWeightDraft, nextRepsDraft, seq);
    }, SET_SAVE_DEBOUNCE_MS);
  }

  function flushPendingCommit(): boolean {
    if (debounceTimerRef.current === null) {
      return false;
    }
    clearDebounceTimer();
    const seq = editSequenceRef.current;
    void executeCommit(latestPayloadRef.current, weightDraft, repsDraft, seq);
    return true;
  }

  function commitImmediate(
    overrides: Partial<Omit<UpsertSetCommitPayload, "setId">>,
    options?: { readonly clearDraftInputs?: boolean },
  ) {
    clearDebounceTimer();
    const resolved = resolveCurrentValues({
      weight: overrides.weightKg !== undefined,
      reps: overrides.reps !== undefined,
    });
    if (resolved.kind === "error") {
      setInlineError(resolved.message);
      return;
    }

    const nextPayload: UpsertSetCommitPayload = {
      ...resolved.payload,
      ...overrides,
    };

    if (nextPayload.completed) {
      const completionCheck = validateCompletedSet({
        weightKg: nextPayload.weightKg,
        reps: nextPayload.reps,
        isBodyweight,
      });
      if (completionCheck.kind === "error") {
        setInlineError(completionCheck.message);
        return;
      }
    }

    setInlineError(null);
    const nextWeightDraft = options?.clearDraftInputs ? null : weightDraft;
    const nextRepsDraft = options?.clearDraftInputs ? null : repsDraft;
    if (options?.clearDraftInputs) {
      setWeightDraft(null);
      setRepsDraft(null);
    }

    editSequenceRef.current += 1;
    const seq = editSequenceRef.current;
    latestPayloadRef.current = nextPayload;
    persistLocalDraft(nextPayload);
    void executeCommit(nextPayload, nextWeightDraft, nextRepsDraft, seq);
  }

  function handleWeightChange(rawValue: string) {
    const nextWeightDraft =
      rawValue === serverWeightText ? null : { unit, value: rawValue };
    setWeightDraft(nextWeightDraft);
    editSequenceRef.current += 1;
    const seq = editSequenceRef.current;

    const parsedWeight = parseWeightInputString(rawValue, unit);
    if (parsedWeight.kind === "error") {
      clearDebounceTimer();
      setInlineError(parsedWeight.message);
      return;
    }

    let currentReps = effectiveReps;
    if (repsDraft !== null) {
      const parsedReps = parseRepsInputString(repsDraft);
      if (parsedReps.kind === "error") {
        setInlineError(parsedReps.message);
        return;
      }
      currentReps = parsedReps.reps;
    }

    const nextPayload: UpsertSetCommitPayload = {
      setId: set._id,
      setType: effectiveSetType,
      weightKg: parsedWeight.weightKg,
      enteredUnit: unit,
      reps: currentReps,
      completed: effectiveCompleted,
    };

    if (nextPayload.completed) {
      const check = validateCompletedSet({
        weightKg: nextPayload.weightKg,
        reps: nextPayload.reps,
        isBodyweight,
      });
      if (check.kind === "error") {
        clearDebounceTimer();
        setInlineError(check.message);
        return;
      }
    }

    setInlineError(null);
    persistLocalDraft(nextPayload);
    scheduleDebouncedCommit(nextPayload, nextWeightDraft, repsDraft, seq);
  }

  function handleRepsChange(rawValue: string) {
    const nextRepsDraft = rawValue === serverRepsText ? null : rawValue;
    setRepsDraft(nextRepsDraft);
    editSequenceRef.current += 1;
    const seq = editSequenceRef.current;

    const parsedReps = parseRepsInputString(rawValue);
    if (parsedReps.kind === "error") {
      clearDebounceTimer();
      setInlineError(parsedReps.message);
      return;
    }

    let currentWeightKg = effectiveWeightKg;
    let currentEnteredUnit = effectiveEnteredUnit;
    if (activeWeightDraft !== null) {
      const parsedWeight = parseWeightInputString(
        activeWeightDraft.value,
        unit,
      );
      if (parsedWeight.kind === "error") {
        setInlineError(parsedWeight.message);
        return;
      }
      currentWeightKg = parsedWeight.weightKg;
      currentEnteredUnit = unit;
    }

    const nextPayload: UpsertSetCommitPayload = {
      setId: set._id,
      setType: effectiveSetType,
      weightKg: currentWeightKg,
      enteredUnit: currentEnteredUnit,
      reps: parsedReps.reps,
      completed: effectiveCompleted,
    };

    if (nextPayload.completed) {
      const check = validateCompletedSet({
        weightKg: nextPayload.weightKg,
        reps: nextPayload.reps,
        isBodyweight,
      });
      if (check.kind === "error") {
        clearDebounceTimer();
        setInlineError(check.message);
        return;
      }
    }

    setInlineError(null);
    persistLocalDraft(nextPayload);
    scheduleDebouncedCommit(nextPayload, weightDraft, nextRepsDraft, seq);
  }

  function handleCopyPrevious() {
    if (previous === null) {
      return;
    }
    onActivate();
    commitImmediate(
      {
        weightKg: previous.weightKg,
        enteredUnit: previous.enteredUnit,
        reps: previous.reps,
      },
      { clearDraftInputs: true },
    );
  }

  function handleToggleComplete() {
    onActivate();
    const nextCompleted = !effectiveCompleted;
    if (nextCompleted) {
      primeRestTimerAudio();
    }
    commitImmediate({ completed: nextCompleted });
  }

  const parsedWeightNow =
    activeWeightDraft !== null
      ? parseWeightInputString(activeWeightDraft.value, unit)
      : { kind: "ok" as const, weightKg: effectiveWeightKg };
  const parsedRepsNow =
    repsDraft !== null
      ? parseRepsInputString(repsDraft)
      : { kind: "ok" as const, reps: effectiveReps };

  const liveWeightKg =
    parsedWeightNow.kind === "ok"
      ? parsedWeightNow.weightKg
      : effectiveWeightKg;
  const liveReps =
    parsedRepsNow.kind === "ok" ? parsedRepsNow.reps : effectiveReps;

  const progression = evaluateSetProgression({
    setType: effectiveSetType,
    weightKg: liveWeightKg,
    reps: liveReps,
    completed: effectiveCompleted,
    isBodyweight,
    previous,
  });

  const setLabel =
    effectiveSetType === "working"
      ? String(workingDisplayNumber ?? set.setNumber)
      : SET_TYPE_META[effectiveSetType].shortLabel;

  const increment = WEIGHT_INCREMENT_BY_UNIT[unit];
  const previousLabel =
    previous !== null
      ? formatSetPreviousLabel(previous, unit, isBodyweight)
      : null;

  return (
    <div
      className={`rounded-xl px-1.5 py-1.5 transition-colors ${
        effectiveCompleted
          ? "bg-success-tint/85"
          : isActiveRow
            ? "bg-accent/55"
            : ""
      }`}
    >
      <div className="grid grid-cols-[44px_minmax(0,1.25fr)_minmax(62px,0.9fr)_minmax(52px,0.75fr)_44px] items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={() => {
            onActivate();
            setTagMenuOpen((open) => !open);
          }}
          aria-expanded={tagMenuOpen}
          aria-label={`Set ${setLabel} type (${SET_TYPE_META[effectiveSetType].label})`}
          className={`inline-flex min-h-11 w-11 items-center justify-center rounded-xl border text-xs font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            effectiveCompleted && effectiveSetType === "working"
              ? "border-success/35 bg-success/15 text-success"
              : SET_TYPE_PILL_STYLES[effectiveSetType]
          }`}
        >
          {setLabel}
        </button>

        <div className="min-w-0">
          {previousLabel !== null ? (
            <button
              type="button"
              onClick={handleCopyPrevious}
              title={`Copy previous (${previousLabel})`}
              aria-label={`Copy previous set ${previousLabel}`}
              className="flex min-h-11 w-full items-center justify-center truncate rounded-xl px-1.5 text-center text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{previousLabel}</span>
            </button>
          ) : (
            <span className="flex min-h-11 items-center justify-center text-xs text-muted-foreground">
              &mdash;
            </span>
          )}
        </div>

        <Input
          type="text"
          inputMode="decimal"
          aria-label={`Set ${setLabel} weight in ${unit}`}
          aria-invalid={inlineError !== null}
          placeholder="0"
          value={weightText}
          onFocus={() => {
            weightFocusedRef.current = true;
            onActivate();
          }}
          onBlur={() => {
            weightFocusedRef.current = false;
            const flushed = flushPendingCommit();
            if (
              !flushed &&
              inlineError === null &&
              activeWeightDraft !== null &&
              parseWeightInputString(activeWeightDraft.value, unit).kind ===
                "ok"
            ) {
              setWeightDraft(null);
            }
          }}
          onChange={(event) => handleWeightChange(event.target.value)}
          className={`px-2 text-center text-sm font-semibold tabular-nums ${
            effectiveCompleted
              ? "bg-card/90 border-success/25"
              : "bg-secondary focus-visible:bg-card"
          }`}
        />

        <Input
          type="text"
          inputMode="numeric"
          aria-label={`Set ${setLabel} reps`}
          aria-invalid={inlineError !== null}
          placeholder="0"
          value={repsText}
          onFocus={() => {
            repsFocusedRef.current = true;
            onActivate();
          }}
          onBlur={() => {
            repsFocusedRef.current = false;
            const flushed = flushPendingCommit();
            if (
              !flushed &&
              inlineError === null &&
              repsDraft !== null &&
              parseRepsInputString(repsDraft).kind === "ok"
            ) {
              setRepsDraft(null);
            }
          }}
          onChange={(event) => handleRepsChange(event.target.value)}
          className={`px-2 text-center text-sm font-semibold tabular-nums ${
            effectiveCompleted
              ? "bg-card/90 border-success/25"
              : "bg-secondary focus-visible:bg-card"
          }`}
        />

        <button
          type="button"
          aria-pressed={effectiveCompleted}
          aria-label={
            effectiveCompleted
              ? `Mark set ${setLabel} incomplete`
              : `Complete set ${setLabel}`
          }
          onClick={handleToggleComplete}
          className={`inline-flex min-h-11 w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            effectiveCompleted
              ? "border-success bg-success text-white shadow-xs"
              : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
          }`}
        >
          <Check className="size-4 stroke-[2.5]" aria-hidden="true" />
        </button>
      </div>

      {progression.kind === "improved" && (
        <div className="mt-1.5 flex items-center justify-end gap-1.5 pr-1">
          <Badge variant="success" className="gap-1 py-0.5 text-[11px]">
            <TrendingUp className="size-3" aria-hidden="true" />
            <span>{PROGRESSION_LABELS[progression.reason]} vs prev</span>
          </Badge>
        </div>
      )}

      {inlineError !== null && (
        <p
          role="alert"
          className="mt-1.5 px-1 text-xs font-medium text-destructive"
        >
          {inlineError}
        </p>
      )}

      {tagMenuOpen && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-border bg-card p-2 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {SET_TYPE_ORDER.map((option) => {
              const selected = effectiveSetType === option;
              return (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "secondary"}
                  onClick={() => {
                    setTagMenuOpen(false);
                    if (option !== effectiveSetType) {
                      commitImmediate({ setType: option });
                    }
                  }}
                  className="px-3 text-xs"
                >
                  {SET_TYPE_META[option].label}
                </Button>
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={deleting}
            onClick={() => {
              clearDebounceTimer();
              setTagMenuOpen(false);
              void onDeleteSet(set._id);
            }}
            className="text-destructive hover:bg-destructive-tint hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span>{deleting ? "Removing..." : "Delete set"}</span>
          </Button>
        </div>
      )}

      {isActiveRow && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-0.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              commitImmediate(
                {
                  weightKg: stepWeightKg(liveWeightKg, unit, -1),
                  enteredUnit: unit,
                },
                { clearDraftInputs: true },
              );
            }}
            className="px-2.5 text-xs tabular-nums"
          >
            -{increment} {unit}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              commitImmediate(
                {
                  weightKg: stepWeightKg(liveWeightKg, unit, 1),
                  enteredUnit: unit,
                },
                { clearDraftInputs: true },
              );
            }}
            className="px-2.5 text-xs tabular-nums"
          >
            +{increment} {unit}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              commitImmediate(
                { reps: Math.max(0, liveReps - 1) },
                { clearDraftInputs: true },
              );
            }}
            className="px-2.5 text-xs tabular-nums"
          >
            -1 rep
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              commitImmediate(
                { reps: Math.min(MAX_REPS, liveReps + 1) },
                { clearDraftInputs: true },
              );
            }}
            className="px-2.5 text-xs tabular-nums"
          >
            +1 rep
          </Button>
          {previousLabel !== null && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyPrevious}
              className="ml-auto px-2.5 text-xs text-primary"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              <span>Copy Prev</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
