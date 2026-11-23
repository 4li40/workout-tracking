"use client";

import { useMutation } from "convex/react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Lock,
  Minus,
  Plus,
  StickyNote,
  Target,
  Timer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EQUIPMENT_LABELS,
  MAX_EXERCISE_NOTE_LENGTH,
  MUSCLE_GROUP_LABELS,
  parseExerciseNote,
} from "@/convex/lib/exercises";
import {
  formatRestDuration,
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_TIMER_PRESETS,
} from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";
import {
  computeLinearWeightTargetKg,
  formatWeightFromKg,
  matchPreviousSetsForExercise,
  MAX_SETS_PER_EXERCISE,
  REST_ADJUST_STEP_SECONDS,
} from "@/convex/lib/workouts";
import { getConvexErrorMessage } from "@/lib/convexError";
import type { LocalSetDraft } from "@/lib/workoutDraftStorage";
import type { WorkoutExerciseDetail } from "./types";
import { type UpsertSetCommitPayload, WorkoutSetRow } from "./WorkoutSetRow";

interface WorkoutExerciseCardProps {
  readonly exercise: WorkoutExerciseDetail;
  readonly index: number;
  readonly totalCount: number;
  readonly unit: WeightUnit;
  readonly activeSetId: Id<"sets"> | null;
  readonly recoveredSetDrafts: Readonly<Record<string, LocalSetDraft>>;
  readonly listBusy: boolean;
  readonly addingSet: boolean;
  readonly deletingSetId: Id<"sets"> | null;
  readonly onActivateSet: (setId: Id<"sets">) => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onOpenSwap: () => void;
  readonly onRemoveExercise: () => Promise<void>;
  readonly onAddSet: (exercise: WorkoutExerciseDetail) => Promise<void>;
  readonly onCommitSet: (
    workoutExerciseId: Id<"workoutExercises">,
    payload: UpsertSetCommitPayload,
  ) => Promise<void>;
  readonly onDeleteSet: (setId: Id<"sets">) => Promise<void>;
  readonly onWriteLocalSetDraft: (draft: LocalSetDraft) => void;
  readonly onClearLocalSetDraft: (setId: Id<"sets">) => void;
}

export function WorkoutExerciseCard({
  exercise,
  index,
  totalCount,
  unit,
  activeSetId,
  recoveredSetDrafts,
  listBusy,
  addingSet,
  deletingSetId,
  onActivateSet,
  onMoveUp,
  onMoveDown,
  onOpenSwap,
  onRemoveExercise,
  onAddSet,
  onCommitSet,
  onDeleteSet,
  onWriteLocalSetDraft,
  onClearLocalSetDraft,
}: WorkoutExerciseCardProps) {
  const upsertNote = useMutation(api.exercises.upsertNote);
  const updateExerciseRest = useMutation(
    api.workouts.updateWorkoutExerciseRest,
  );

  const [restEditorOpen, setRestEditorOpen] = useState(false);
  const [restSaving, setRestSaving] = useState(false);
  const [restError, setRestError] = useState<string | null>(null);

  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const effectiveSets = exercise.sets.map((set) => {
    const draft = recoveredSetDrafts[set._id];
    if (draft === undefined) {
      return set;
    }
    return {
      ...set,
      setType: draft.setType,
      weightKg: draft.weightKg,
      enteredUnit: draft.enteredUnit,
      reps: draft.reps,
      completed: draft.completed,
    };
  });

  const matchedSets = matchPreviousSetsForExercise(
    effectiveSets,
    exercise.previousSets,
  );
  const completedCount = effectiveSets.filter((set) => set.completed).length;
  const linearTargetKg = computeLinearWeightTargetKg(
    exercise.previousSets,
    unit,
    exercise.isBodyweight,
  );

  const hasSavedNote =
    exercise.stickyNote !== undefined && exercise.stickyNote.trim().length > 0;
  const currentNoteText = noteDraft ?? exercise.stickyNote ?? "";

  async function handleSaveRestSeconds(seconds: number) {
    if (restSaving) {
      return;
    }
    const clamped = Math.min(
      MAX_REST_SECONDS,
      Math.max(MIN_REST_SECONDS, Math.round(seconds)),
    );
    if (clamped === exercise.restSeconds) {
      setRestEditorOpen(false);
      return;
    }

    setRestSaving(true);
    setRestError(null);
    try {
      await updateExerciseRest({
        workoutExerciseId: exercise._id,
        restSeconds: clamped,
      });
    } catch (err) {
      setRestError(
        getConvexErrorMessage(err, "Could not update rest duration."),
      );
    } finally {
      setRestSaving(false);
    }
  }

  async function handleSaveNote(nextRaw: string) {
    if (noteSaving) {
      return;
    }
    const parsed = parseExerciseNote(nextRaw);
    if (parsed.kind === "error") {
      setNoteError(parsed.message);
      return;
    }

    setNoteSaving(true);
    setNoteError(null);
    try {
      await upsertNote({
        exerciseId: exercise.exerciseId,
        notes: parsed.notes,
      });
      setNoteDraft(null);
      setNoteEditorOpen(false);
    } catch (err) {
      setNoteError(getConvexErrorMessage(err, "Could not save sticky note."));
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleRemove() {
    if (removing) {
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemoveExercise();
    } catch (err) {
      setRemoveError(
        getConvexErrorMessage(err, "Could not remove exercise from workout."),
      );
      setRemoving(false);
    }
  }

  const cardBusy = listBusy || removing;

  return (
    <Card asChild>
      <article className="p-3.5 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent" className="tabular-nums">
                #{index + 1}
              </Badge>
              <h2 className="text-base font-semibold text-foreground">
                {exercise.exerciseName}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">
                {MUSCLE_GROUP_LABELS[exercise.muscleGroup]}
              </Badge>
              <Badge variant="secondary">
                {EQUIPMENT_LABELS[exercise.equipment]}
              </Badge>
              {exercise.isBodyweight && (
                <Badge variant="accent">Bodyweight</Badge>
              )}
              {linearTargetKg !== null && (
                <Badge variant="accent" className="gap-1 tabular-nums">
                  <Target className="size-3" aria-hidden="true" />
                  <span>
                    Target {formatWeightFromKg(linearTargetKg, unit)} {unit}
                  </span>
                </Badge>
              )}
              <button
                type="button"
                onClick={() => {
                  setRestError(null);
                  setRestEditorOpen((open) => !open);
                }}
                aria-expanded={restEditorOpen}
                aria-label={`Rest timer ${formatRestDuration(exercise.restSeconds)} for ${exercise.exerciseName}`}
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground tabular-nums transition-colors hover:border-primary/40 hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Timer className="size-3 text-primary" aria-hidden="true" />
                <span>Rest {formatRestDuration(exercise.restSeconds)}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant={hasSavedNote || noteEditorOpen ? "secondary" : "outline"}
              disabled={cardBusy}
              aria-label={`Sticky note for ${exercise.exerciseName}`}
              onClick={() => {
                setNoteError(null);
                setNoteEditorOpen((open) => !open);
              }}
            >
              <StickyNote
                className={`size-4 ${hasSavedNote ? "text-primary" : ""}`}
                aria-hidden="true"
              />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={cardBusy || index === 0}
              aria-label={`Move ${exercise.exerciseName} up`}
              onClick={onMoveUp}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={cardBusy || index === totalCount - 1}
              aria-label={`Move ${exercise.exerciseName} down`}
              onClick={onMoveDown}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={cardBusy}
              aria-label={`Swap ${exercise.exerciseName}`}
              onClick={onOpenSwap}
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={cardBusy}
              aria-label={`Remove ${exercise.exerciseName}`}
              onClick={() => {
                if (completedCount > 0) {
                  setConfirmRemoveOpen((open) => !open);
                } else {
                  void handleRemove();
                }
              }}
              className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {restEditorOpen && (
          <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rest between sets
              </span>
              <span className="text-xs font-semibold text-primary tabular-nums">
                {formatRestDuration(exercise.restSeconds)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {REST_TIMER_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={
                    exercise.restSeconds === preset ? "default" : "secondary"
                  }
                  disabled={restSaving}
                  onClick={() => {
                    void handleSaveRestSeconds(preset);
                  }}
                  className="tabular-nums"
                >
                  {formatRestDuration(preset)}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  restSaving || exercise.restSeconds <= MIN_REST_SECONDS
                }
                onClick={() => {
                  void handleSaveRestSeconds(
                    exercise.restSeconds - REST_ADJUST_STEP_SECONDS,
                  );
                }}
              >
                <Minus className="size-3.5" aria-hidden="true" />
                <span>{REST_ADJUST_STEP_SECONDS}s</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  restSaving || exercise.restSeconds >= MAX_REST_SECONDS
                }
                onClick={() => {
                  void handleSaveRestSeconds(
                    exercise.restSeconds + REST_ADJUST_STEP_SECONDS,
                  );
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>{REST_ADJUST_STEP_SECONDS}s</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRestEditorOpen(false)}
                className="ml-auto"
              >
                Done
              </Button>
            </div>

            {restError !== null && (
              <Alert variant="destructive">
                <AlertDescription>{restError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {(hasSavedNote || noteEditorOpen) && (
          <div className="rounded-xl border border-primary/20 bg-accent/45 p-3 space-y-2.5">
            {!noteEditorOpen ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Lock
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {exercise.stickyNote}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNoteDraft(exercise.stickyNote ?? "");
                    setNoteError(null);
                    setNoteEditorOpen(true);
                  }}
                  className="shrink-0 text-xs text-primary"
                >
                  Edit cue
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Lock
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    Private sticky note
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {currentNoteText.trim().length} / {MAX_EXERCISE_NOTE_LENGTH}
                  </span>
                </div>

                <Textarea
                  rows={2}
                  maxLength={MAX_EXERCISE_NOTE_LENGTH}
                  disabled={noteSaving}
                  value={currentNoteText}
                  placeholder="e.g. Seat pin 4, control eccentric 2s..."
                  onChange={(event) => {
                    setNoteDraft(event.target.value);
                    if (noteError !== null) {
                      setNoteError(null);
                    }
                  }}
                />

                {noteError !== null && (
                  <Alert variant="destructive">
                    <AlertDescription>{noteError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {hasSavedNote && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={noteSaving}
                        onClick={() => {
                          void handleSaveNote("");
                        }}
                        className="text-destructive hover:bg-destructive-tint hover:text-destructive"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={noteSaving}
                      onClick={() => {
                        setNoteDraft(null);
                        setNoteError(null);
                        setNoteEditorOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={noteSaving}
                      onClick={() => {
                        void handleSaveNote(currentNoteText);
                      }}
                    >
                      {noteSaving ? "Saving..." : "Save cue"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {confirmRemoveOpen && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Remove {exercise.exerciseName} and its {completedCount}{" "}
                completed {completedCount === 1 ? "set" : "sets"}?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={removing}
                  onClick={() => setConfirmRemoveOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={removing}
                  onClick={() => {
                    void handleRemove();
                  }}
                >
                  {removing ? "Removing..." : "Remove"}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {removeError !== null && (
          <Alert variant="destructive">
            <AlertDescription>{removeError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1">
          <div className="grid grid-cols-[44px_minmax(0,1.25fr)_minmax(62px,0.9fr)_minmax(52px,0.75fr)_44px] items-center gap-1.5 px-1.5 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-2.5">
            <span>Set</span>
            <span>Prev</span>
            <span>{exercise.isBodyweight ? `+${unit}` : unit}</span>
            <span>Reps</span>
            <span>Done</span>
          </div>

          {matchedSets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
              No sets yet. Tap Add set below to start logging.
            </p>
          ) : (
            <div className="space-y-1">
              {matchedSets.map((matched) => (
                <WorkoutSetRow
                  key={matched.set._id}
                  workoutExerciseId={exercise._id}
                  set={matched.set}
                  recoveredDraft={recoveredSetDrafts[matched.set._id]}
                  workingDisplayNumber={matched.workingDisplayNumber}
                  previous={matched.previous}
                  unit={unit}
                  isBodyweight={exercise.isBodyweight}
                  isActiveRow={activeSetId === matched.set._id}
                  deleting={deletingSetId === matched.set._id}
                  onActivate={() => onActivateSet(matched.set._id)}
                  onWriteLocalDraft={onWriteLocalSetDraft}
                  onClearLocalDraft={onClearLocalSetDraft}
                  onCommitSet={(payload) => onCommitSet(exercise._id, payload)}
                  onDeleteSet={onDeleteSet}
                />
              ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={
            cardBusy ||
            addingSet ||
            exercise.sets.length >= MAX_SETS_PER_EXERCISE
          }
          onClick={() => {
            void onAddSet(exercise);
          }}
          className="w-full"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>{addingSet ? "Adding set..." : "Add set"}</span>
        </Button>
      </article>
    </Card>
  );
}
