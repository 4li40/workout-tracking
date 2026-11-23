"use client";

import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Dumbbell,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ExercisePickerDialog } from "@/components/exercises/ExercisePickerDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatElapsedDuration,
  formatRestDuration,
  MAX_REST_SECONDS,
} from "@/convex/lib/settings";
import { reorderByIndex } from "@/convex/lib/templates";
import type { WeightUnit } from "@/convex/lib/validators";
import {
  computeWorkoutVolumeSummary,
  formatWeightFromKg,
  MAX_WORKOUT_EXERCISES,
  MAX_WORKOUT_NOTES_LENGTH,
  MAX_WORKOUT_TITLE_LENGTH,
  parseWorkoutNotes,
  parseWorkoutTitle,
  SET_TYPE_META,
} from "@/convex/lib/workouts";
import { getConvexErrorMessage } from "@/lib/convexError";
import {
  getEstimatedServerNowMs,
  primeRestTimerAudio,
  recordServerClockSample,
} from "@/lib/restTimerCue";
import { useScreenWakeLock } from "@/lib/wakeLock";
import {
  type ActiveWorkoutDraft,
  clearWorkoutDraft,
  clearWorkoutMetaDraft,
  clearWorkoutSetDraft,
  countDraftChanges,
  type LocalSetDraft,
  pruneStaleWorkoutDrafts,
  readWorkoutDraft,
  reconcileDraftWithServer,
  saveWorkoutMetaDraft,
  saveWorkoutSetDraft,
  writeWorkoutDraft,
} from "@/lib/workoutDraftStorage";
import {
  type ActiveWorkoutPickerTarget,
  getActiveWorkoutPickerConfig,
} from "./activeWorkoutPicker";
import { DiscardWorkoutDialog } from "./DiscardWorkoutDialog";
import { FinishWorkoutDialog } from "./FinishWorkoutDialog";
import { RestTimerBar } from "./RestTimerBar";
import type { WorkoutDetail, WorkoutExerciseDetail } from "./types";
import { WorkoutExerciseCard } from "./WorkoutExerciseCard";
import type { UpsertSetCommitPayload } from "./WorkoutSetRow";

function ElapsedHeaderTimer({ startedAt }: { readonly startedAt: number }) {
  const [nowMs, setNowMs] = useState(() => getEstimatedServerNowMs());

  useEffect(() => {
    const syncNow = () => {
      setNowMs(getEstimatedServerNowMs());
    };
    const intervalId = window.setInterval(syncNow, 1000);
    document.addEventListener("visibilitychange", syncNow);
    window.addEventListener("focus", syncNow);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", syncNow);
      window.removeEventListener("focus", syncNow);
    };
  }, []);

  return <>{formatElapsedDuration(nowMs - startedAt)}</>;
}

function createReorderExercisesOptimisticUpdate(workoutId: Id<"workouts">) {
  return (
    localStore: OptimisticLocalStore,
    args: FunctionArgs<typeof api.workouts.reorderWorkoutExercises>,
  ) => {
    const current = localStore.getQuery(api.workouts.get, { workoutId });
    if (current === undefined || current === null) {
      return;
    }
    const byId = new Map(current.exercises.map((item) => [item._id, item]));
    const reordered: WorkoutExerciseDetail[] = [];
    for (const [index, id] of args.orderedWorkoutExerciseIds.entries()) {
      const existing = byId.get(id);
      if (existing !== undefined) {
        reordered.push({ ...existing, orderIndex: index });
      }
    }
    if (reordered.length !== current.exercises.length) {
      return;
    }
    localStore.setQuery(
      api.workouts.get,
      { workoutId },
      { ...current, exercises: reordered },
    );
  };
}

function createUpsertSetOptimisticUpdate(workoutId: Id<"workouts">) {
  return (
    localStore: OptimisticLocalStore,
    args: FunctionArgs<typeof api.workouts.upsertSet>,
  ) => {
    if (args.setId === undefined) {
      return;
    }
    const now = getEstimatedServerNowMs();
    const current = localStore.getQuery(api.workouts.get, { workoutId });
    if (current === undefined || current === null) {
      return;
    }

    let startedRestTimerEndsAt: number | undefined;
    const nextExercises = current.exercises.map((exercise) => {
      if (exercise._id !== args.workoutExerciseId) {
        return exercise;
      }
      const nextSets = exercise.sets.map((setDoc) => {
        if (setDoc._id !== args.setId) {
          return setDoc;
        }
        const wasCompleted = setDoc.completed;
        if (
          !wasCompleted &&
          args.completed &&
          SET_TYPE_META[args.setType].autoStartsRestTimer &&
          args.autoStartRestTimer !== false
        ) {
          startedRestTimerEndsAt = now + exercise.restSeconds * 1000;
        }
        return {
          ...setDoc,
          setType: args.setType,
          weightKg: args.weightKg,
          enteredUnit: args.enteredUnit,
          reps: args.reps,
          completed: args.completed,
          completedAt: args.completed
            ? wasCompleted
              ? (setDoc.completedAt ?? now)
              : now
            : undefined,
        };
      });
      return { ...exercise, sets: nextSets };
    });

    localStore.setQuery(
      api.workouts.get,
      { workoutId },
      {
        ...current,
        exercises: nextExercises,
        ...(startedRestTimerEndsAt !== undefined
          ? { restTimerEndsAt: startedRestTimerEndsAt }
          : {}),
      },
    );

    if (startedRestTimerEndsAt !== undefined) {
      const shellState = localStore.getQuery(
        api.userSettings.getAppShellState,
        {},
      );
      if (
        shellState !== undefined &&
        shellState.activeWorkout !== null &&
        shellState.activeWorkout._id === workoutId
      ) {
        localStore.setQuery(
          api.userSettings.getAppShellState,
          {},
          {
            ...shellState,
            activeWorkout: {
              ...shellState.activeWorkout,
              restTimerEndsAt: startedRestTimerEndsAt,
            },
          },
        );
      }
    }
  };
}

function createDeleteSetOptimisticUpdate(workoutId: Id<"workouts">) {
  return (
    localStore: OptimisticLocalStore,
    args: FunctionArgs<typeof api.workouts.deleteSet>,
  ) => {
    const current = localStore.getQuery(api.workouts.get, { workoutId });
    if (current === undefined || current === null) {
      return;
    }

    const nextExercises = current.exercises.map((exercise) => {
      const remaining = exercise.sets.filter(
        (setDoc) => setDoc._id !== args.setId,
      );
      if (remaining.length === exercise.sets.length) {
        return exercise;
      }
      return {
        ...exercise,
        sets: remaining.map((setDoc, index) => ({
          ...setDoc,
          setNumber: index + 1,
        })),
      };
    });

    localStore.setQuery(
      api.workouts.get,
      { workoutId },
      { ...current, exercises: nextExercises },
    );
  };
}

function createRestTimerOptimisticUpdate(workoutId: Id<"workouts">) {
  return (
    localStore: OptimisticLocalStore,
    args: FunctionArgs<typeof api.workouts.updateRestTimer>,
  ) => {
    const now = getEstimatedServerNowMs();
    const current = localStore.getQuery(api.workouts.get, { workoutId });
    if (current === undefined || current === null) {
      return;
    }

    let nextEndsAt: number | undefined;
    switch (args.action.kind) {
      case "start":
        nextEndsAt = now + args.action.durationSeconds * 1000;
        break;
      case "adjust": {
        const base = Math.max(now, current.restTimerEndsAt ?? now);
        const candidate = base + args.action.deltaSeconds * 1000;
        nextEndsAt =
          candidate <= now
            ? undefined
            : Math.min(candidate, now + MAX_REST_SECONDS * 1000);
        break;
      }
      case "skip":
        nextEndsAt = undefined;
        break;
    }

    const nextWorkout = { ...current };
    if (nextEndsAt === undefined) {
      delete nextWorkout.restTimerEndsAt;
    } else {
      nextWorkout.restTimerEndsAt = nextEndsAt;
    }

    localStore.setQuery(api.workouts.get, { workoutId }, nextWorkout);

    const shellState = localStore.getQuery(
      api.userSettings.getAppShellState,
      {},
    );
    if (
      shellState !== undefined &&
      shellState.activeWorkout !== null &&
      shellState.activeWorkout._id === workoutId
    ) {
      const nextActiveSummary = { ...shellState.activeWorkout };
      if (nextEndsAt === undefined) {
        delete nextActiveSummary.restTimerEndsAt;
      } else {
        nextActiveSummary.restTimerEndsAt = nextEndsAt;
      }
      localStore.setQuery(
        api.userSettings.getAppShellState,
        {},
        { ...shellState, activeWorkout: nextActiveSummary },
      );
    }
  };
}

interface ActiveWorkoutLoggerProps {
  readonly workout: WorkoutDetail;
  readonly draftScopeId: string;
  readonly unit: WeightUnit;
  readonly defaultRestSeconds: number;
  readonly restNotificationsEnabled: boolean;
  readonly keepScreenAwake: boolean;
  readonly onDiscardingChange: (discarding: boolean) => void;
  readonly onDiscardedRedirecting: () => void;
}

export function ActiveWorkoutLogger({
  workout,
  draftScopeId,
  unit,
  defaultRestSeconds,
  restNotificationsEnabled,
  keepScreenAwake,
  onDiscardingChange,
  onDiscardedRedirecting,
}: ActiveWorkoutLoggerProps) {
  useScreenWakeLock(keepScreenAwake);
  const { isAuthenticated } = useConvexAuth();
  const pushConfig = useQuery(
    api.push.getPushConfig,
    isAuthenticated ? {} : "skip",
  );
  const [recoveredDraft, setRecoveredDraft] =
    useState<ActiveWorkoutDraft | null>(() => {
      pruneStaleWorkoutDrafts(draftScopeId, workout._id);
      const stored = readWorkoutDraft(draftScopeId, workout._id);
      if (stored === null) {
        return null;
      }
      const reconciled = reconcileDraftWithServer(stored, workout);
      writeWorkoutDraft(draftScopeId, workout._id, reconciled);
      return reconciled;
    });

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [syncingDraft, setSyncingDraft] = useState(false);
  const [draftResetVersion, setDraftResetVersion] = useState(0);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(() => {
    const recoveredTitle = recoveredDraft?.title;
    return recoveredTitle !== undefined && recoveredTitle.trim().length > 0
      ? recoveredTitle
      : null;
  });
  const [titleSaving, setTitleSaving] = useState(false);

  const [notesOpen, setNotesOpen] = useState(
    () =>
      (workout.notes !== undefined && workout.notes.length > 0) ||
      recoveredDraft?.notes !== undefined,
  );
  const [notesDraft, setNotesDraft] = useState<string | null>(
    () => recoveredDraft?.notes ?? null,
  );
  const [notesSaving, setNotesSaving] = useState(false);
  const resetNotesButtonRef = useRef<HTMLButtonElement | null>(null);
  const skipNextNotesBlurRef = useRef(false);

  const [selectedSetId, setSelectedSetId] = useState<Id<"sets"> | null>(null);
  const [addingExerciseSetId, setAddingExerciseSetId] =
    useState<Id<"workoutExercises"> | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<Id<"sets"> | null>(null);
  const [removingExerciseId, setRemovingExerciseId] =
    useState<Id<"workoutExercises"> | null>(null);
  const [reordering, setReordering] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<ActiveWorkoutPickerTarget>({
    kind: "add",
  });
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const updateWorkoutDetails = useMutation(api.workouts.updateWorkoutDetails);
  const addWorkoutExercise = useMutation(api.workouts.addWorkoutExercise);
  const swapWorkoutExercise = useMutation(api.workouts.swapWorkoutExercise);
  const removeWorkoutExercise = useMutation(api.workouts.removeWorkoutExercise);

  const reorderWorkoutExercises = useMutation(
    api.workouts.reorderWorkoutExercises,
  ).withOptimisticUpdate(createReorderExercisesOptimisticUpdate(workout._id));

  const upsertSet = useMutation(api.workouts.upsertSet).withOptimisticUpdate(
    createUpsertSetOptimisticUpdate(workout._id),
  );

  const deleteSet = useMutation(api.workouts.deleteSet).withOptimisticUpdate(
    createDeleteSetOptimisticUpdate(workout._id),
  );

  const updateRestTimer = useMutation(
    api.workouts.updateRestTimer,
  ).withOptimisticUpdate(createRestTimerOptimisticUpdate(workout._id));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const currentTitle = titleDraft ?? workout.title;
  const currentNotes = notesDraft ?? workout.notes ?? "";

  const recoveredSetDrafts = recoveredDraft?.sets ?? {};

  const effectiveExercisesForSummary = workout.exercises.map((exercise) => ({
    isBodyweight: exercise.isBodyweight,
    sets: exercise.sets.map((setDoc) => {
      const draft = recoveredSetDrafts[setDoc._id];
      if (draft === undefined) {
        return setDoc;
      }
      return {
        ...setDoc,
        setType: draft.setType,
        weightKg: draft.weightKg,
        enteredUnit: draft.enteredUnit,
        reps: draft.reps,
        completed: draft.completed,
      };
    }),
  }));

  const volumeSummary = computeWorkoutVolumeSummary(
    effectiveExercisesForSummary,
  );
  const volumeLabel =
    volumeSummary.workingVolumeKg > 0
      ? `${formatWeightFromKg(volumeSummary.workingVolumeKg, unit)} ${unit}`
      : volumeSummary.bodyweightWorkingReps > 0
        ? `${volumeSummary.bodyweightWorkingReps} BW reps`
        : `0 ${unit}`;

  let activeSetId: Id<"sets"> | null = null;
  let activeExerciseRestSeconds: number | null = null;

  if (selectedSetId !== null) {
    for (const exercise of workout.exercises) {
      if (exercise.sets.some((setDoc) => setDoc._id === selectedSetId)) {
        activeSetId = selectedSetId;
        activeExerciseRestSeconds = exercise.restSeconds;
        break;
      }
    }
  }

  if (activeSetId === null) {
    for (const exercise of workout.exercises) {
      const nextUncompleted = exercise.sets.find((setDoc) => {
        const draft = recoveredSetDrafts[setDoc._id];
        return !(draft?.completed ?? setDoc.completed);
      });
      if (nextUncompleted !== undefined) {
        activeSetId = nextUncompleted._id;
        activeExerciseRestSeconds = exercise.restSeconds;
        break;
      }
    }
  }

  const referenceRestSeconds =
    activeExerciseRestSeconds ??
    workout.exercises[workout.exercises.length - 1]?.restSeconds ??
    defaultRestSeconds;

  const existingExerciseIds = new Set(
    workout.exercises.map((item) => item.exerciseId),
  );

  function refreshRecoveredDraftState() {
    const stored = readWorkoutDraft(draftScopeId, workout._id);
    if (stored === null) {
      setRecoveredDraft(null);
      return;
    }
    const reconciled = reconcileDraftWithServer(stored, workout);
    writeWorkoutDraft(draftScopeId, workout._id, reconciled);
    setRecoveredDraft(reconciled);
  }

  function clearRecoveredDraftMeta(fields: {
    readonly title?: boolean;
    readonly notes?: boolean;
  }) {
    clearWorkoutMetaDraft(draftScopeId, workout._id, fields);
    setRecoveredDraft((current) => {
      if (current === null) {
        return null;
      }
      const nextTitle = fields.title ? undefined : current.title;
      const nextNotes = fields.notes ? undefined : current.notes;
      const next: ActiveWorkoutDraft = {
        version: 1,
        workoutId: current.workoutId,
        updatedAt: current.updatedAt,
        ...(nextTitle !== undefined ? { title: nextTitle } : {}),
        ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
        sets: current.sets,
      };
      return countDraftChanges(next) === 0 ? null : next;
    });
  }

  function clearRecoveredDraftSetState(setId: Id<"sets">) {
    setRecoveredDraft((current) => {
      if (current === null || !(setId in current.sets)) {
        return current;
      }
      const nextSets = { ...current.sets };
      delete nextSets[setId];
      const next: ActiveWorkoutDraft = {
        ...current,
        sets: nextSets,
      };
      return countDraftChanges(next) === 0 ? null : next;
    });
  }

  function clearRecoveredDraftSet(setId: Id<"sets">) {
    clearWorkoutSetDraft(draftScopeId, workout._id, setId);
    clearRecoveredDraftSetState(setId);
  }

  async function syncPendingSetDrafts() {
    const stored = readWorkoutDraft(draftScopeId, workout._id);
    if (stored === null) {
      setRecoveredDraft(null);
      return;
    }
    const reconciled = reconcileDraftWithServer(stored, workout);
    if (reconciled === null) {
      writeWorkoutDraft(draftScopeId, workout._id, null);
      setRecoveredDraft(null);
      return;
    }

    for (const setDraft of Object.values(reconciled.sets)) {
      const result = await upsertSet({
        workoutExerciseId: setDraft.workoutExerciseId as Id<"workoutExercises">,
        setId: setDraft.setId as Id<"sets">,
        setType: setDraft.setType,
        weightKg: setDraft.weightKg,
        enteredUnit: setDraft.enteredUnit,
        reps: setDraft.reps,
        completed: setDraft.completed,
        autoStartRestTimer: false,
      });
      recordServerClockSample(result.serverNow);
      clearRecoveredDraftSet(setDraft.setId as Id<"sets">);
    }
  }

  async function handleSyncRecoveredDraft() {
    if (recoveredDraft === null || syncingDraft) {
      return;
    }

    const stored = readWorkoutDraft(draftScopeId, workout._id);
    if (stored === null) {
      setRecoveredDraft(null);
      return;
    }
    const currentDraft = reconcileDraftWithServer(stored, workout);
    if (currentDraft === null) {
      writeWorkoutDraft(draftScopeId, workout._id, null);
      setRecoveredDraft(null);
      return;
    }

    setSyncingDraft(true);
    setActionError(null);
    try {
      if (
        currentDraft.title !== undefined ||
        currentDraft.notes !== undefined
      ) {
        const titleCheck =
          currentDraft.title !== undefined
            ? parseWorkoutTitle(currentDraft.title)
            : null;
        const notesCheck =
          currentDraft.notes !== undefined
            ? parseWorkoutNotes(currentDraft.notes)
            : null;

        const hasValidMetaUpdate =
          titleCheck?.kind === "ok" || notesCheck?.kind === "ok";
        if (hasValidMetaUpdate) {
          await updateWorkoutDetails({
            workoutId: workout._id,
            ...(titleCheck?.kind === "ok" ? { title: titleCheck.title } : {}),
            ...(notesCheck?.kind === "ok"
              ? { notes: notesCheck.notes ?? "" }
              : {}),
          });
        }

        clearRecoveredDraftMeta({
          title: currentDraft.title !== undefined,
          notes: currentDraft.notes !== undefined,
        });
        if (currentDraft.title !== undefined) {
          setTitleDraft(null);
        }
        if (currentDraft.notes !== undefined) {
          setNotesDraft(null);
        }
      }

      await syncPendingSetDrafts();
      setRecoveredDraft(null);
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not sync offline changes yet. Your draft stays safely stored locally.",
        ),
      );
      refreshRecoveredDraftState();
    } finally {
      setSyncingDraft(false);
    }
  }

  function handleDiscardLocalDraft() {
    clearWorkoutDraft(draftScopeId, workout._id);
    setRecoveredDraft(null);
    setTitleDraft(null);
    setNotesDraft(null);
    setActionError(null);
    setDraftResetVersion((version) => version + 1);
  }

  async function handleSaveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (titleSaving) {
      return;
    }

    const parsed = parseWorkoutTitle(currentTitle);
    if (parsed.kind === "error") {
      setActionError(parsed.message);
      return;
    }

    if (parsed.title === workout.title) {
      clearRecoveredDraftMeta({ title: true });
      setTitleDraft(null);
      setEditingTitle(false);
      return;
    }

    setTitleSaving(true);
    setActionError(null);
    try {
      await updateWorkoutDetails({
        workoutId: workout._id,
        title: parsed.title,
      });
      clearRecoveredDraftMeta({ title: true });
      setTitleDraft(null);
      setEditingTitle(false);
    } catch (err) {
      saveWorkoutMetaDraft(draftScopeId, workout._id, { title: parsed.title });
      refreshRecoveredDraftState();
      setActionError(
        getConvexErrorMessage(err, "Could not update workout title."),
      );
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleSaveNotes(nextRaw: string) {
    if (notesSaving) {
      return;
    }
    const parsed = parseWorkoutNotes(nextRaw);
    if (parsed.kind === "error") {
      setActionError(parsed.message);
      return;
    }

    const normalizedNext = parsed.notes ?? "";
    const serverNotes = workout.notes ?? "";
    if (normalizedNext === serverNotes) {
      clearRecoveredDraftMeta({ notes: true });
      setNotesDraft(null);
      return;
    }

    setNotesSaving(true);
    setActionError(null);
    try {
      await updateWorkoutDetails({
        workoutId: workout._id,
        notes: normalizedNext,
      });
      clearRecoveredDraftMeta({ notes: true });
      setNotesDraft(null);
    } catch (err) {
      saveWorkoutMetaDraft(draftScopeId, workout._id, { notes: nextRaw });
      refreshRecoveredDraftState();
      setActionError(
        getConvexErrorMessage(err, "Could not save session notes."),
      );
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleCommitSet(
    workoutExerciseId: Id<"workoutExercises">,
    payload: UpsertSetCommitPayload,
  ) {
    const existingExercise = workout.exercises.find(
      (item) => item._id === workoutExerciseId,
    );
    const existingSet = existingExercise?.sets.find(
      (item) => item._id === payload.setId,
    );
    const existingDraft = recoveredSetDrafts[payload.setId];
    const wasCompleted = existingDraft?.completed ?? existingSet?.completed;
    const transitionedToCompleted =
      wasCompleted !== undefined && !wasCompleted && payload.completed;

    clearRecoveredDraftSetState(payload.setId);
    setActionError(null);
    try {
      const result = await upsertSet({
        workoutExerciseId,
        setId: payload.setId,
        setType: payload.setType,
        weightKg: payload.weightKg,
        enteredUnit: payload.enteredUnit,
        reps: payload.reps,
        completed: payload.completed,
      });
      recordServerClockSample(result.serverNow);

      if (transitionedToCompleted) {
        setSelectedSetId((current) =>
          current === payload.setId ? null : current,
        );
      }
    } catch (err) {
      setActionError(
        getConvexErrorMessage(
          err,
          "Could not sync set right now. Saved locally for recovery.",
        ),
      );
      refreshRecoveredDraftState();
      throw err;
    }
  }

  async function handleAddSet(exercise: WorkoutExerciseDetail) {
    if (addingExerciseSetId !== null) {
      return;
    }

    const lastSet = exercise.sets[exercise.sets.length - 1];
    const lastDraft =
      lastSet !== undefined ? recoveredSetDrafts[lastSet._id] : undefined;

    setAddingExerciseSetId(exercise._id);
    setActionError(null);
    try {
      const result = await upsertSet({
        workoutExerciseId: exercise._id,
        setType: "working",
        weightKg: lastDraft?.weightKg ?? lastSet?.weightKg ?? 0,
        enteredUnit: lastDraft?.enteredUnit ?? lastSet?.enteredUnit ?? unit,
        reps: lastDraft?.reps ?? lastSet?.reps ?? 0,
        completed: false,
      });
      recordServerClockSample(result.serverNow);
      setSelectedSetId(result.setId);
    } catch (err) {
      setActionError(
        getConvexErrorMessage(err, "Could not add set. Please try again."),
      );
    } finally {
      setAddingExerciseSetId(null);
    }
  }

  async function handleDeleteSet(setId: Id<"sets">) {
    if (deletingSetId !== null) {
      return;
    }
    setDeletingSetId(setId);
    setActionError(null);
    try {
      await deleteSet({ setId });
      clearRecoveredDraftSet(setId);
      setSelectedSetId((current) => (current === setId ? null : current));
    } catch (err) {
      setActionError(
        getConvexErrorMessage(err, "Could not delete set. Please try again."),
      );
    } finally {
      setDeletingSetId(null);
    }
  }

  async function handleReorderExercise(fromIndex: number, toIndex: number) {
    if (reordering || removingExerciseId !== null) {
      return;
    }
    const nextList = reorderByIndex(workout.exercises, fromIndex, toIndex);
    setReordering(true);
    setActionError(null);
    try {
      await reorderWorkoutExercises({
        workoutId: workout._id,
        orderedWorkoutExerciseIds: nextList.map((item) => item._id),
      });
    } catch (err) {
      setActionError(
        getConvexErrorMessage(err, "Could not reorder exercises."),
      );
    } finally {
      setReordering(false);
    }
  }

  async function handleRemoveExercise(workoutExercise: WorkoutExerciseDetail) {
    if (reordering || removingExerciseId !== null) {
      return;
    }
    setRemovingExerciseId(workoutExercise._id);
    setActionError(null);
    try {
      await removeWorkoutExercise({ workoutExerciseId: workoutExercise._id });
      for (const setDoc of workoutExercise.sets) {
        clearRecoveredDraftSet(setDoc._id);
      }
    } finally {
      setRemovingExerciseId(null);
    }
  }

  function handleRestTimerAction(
    action:
      | { readonly kind: "start"; readonly durationSeconds: number }
      | { readonly kind: "adjust"; readonly deltaSeconds: number }
      | { readonly kind: "skip" },
  ) {
    if (timerBusy) {
      return;
    }
    setTimerBusy(true);
    setActionError(null);
    void updateRestTimer({ workoutId: workout._id, action })
      .then((result) => {
        recordServerClockSample(result.serverNow);
      })
      .catch((err: unknown) => {
        setActionError(
          getConvexErrorMessage(err, "Could not update rest timer."),
        );
      })
      .finally(() => {
        setTimerBusy(false);
      });
  }

  const draftChangeCount =
    recoveredDraft !== null ? countDraftChanges(recoveredDraft) : 0;
  const pickerConfig = getActiveWorkoutPickerConfig(pickerTarget, workout._id);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 sm:px-6 sm:pt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/workouts">
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Workouts</span>
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={timerBusy}
            onClick={() => {
              primeRestTimerAudio();
              handleRestTimerAction({
                kind: "start",
                durationSeconds: referenceRestSeconds,
              });
            }}
          >
            <Timer className="size-4 text-primary" aria-hidden="true" />
            <span>Rest {formatRestDuration(referenceRestSeconds)}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDiscardOpen(true)}
            className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Discard</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={volumeSummary.completedSets === 0}
            onClick={() => setFinishOpen(true)}
          >
            <Check className="size-4" aria-hidden="true" />
            <span>Finish</span>
          </Button>
        </div>
      </div>

      <Card asChild>
        <section className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="success" className="gap-1">
                <Activity className="size-3.5" aria-hidden="true" />
                <span>In progress</span>
              </Badge>
              <Badge variant="secondary">
                {workout.templateId !== undefined ? "Routine" : "Freestyle"}
              </Badge>
              <Badge variant="outline" className="uppercase">
                {unit}
              </Badge>
            </div>

            <Badge
              variant="accent"
              className="gap-1.5 px-3 py-1 text-sm tabular-nums"
            >
              <Clock className="size-4" aria-hidden="true" />
              <ElapsedHeaderTimer
                key={workout._id}
                startedAt={workout.startedAt}
              />
            </Badge>
          </div>

          {editingTitle ? (
            <form
              noValidate
              onSubmit={(event) => {
                void handleSaveTitle(event);
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Input
                value={currentTitle}
                maxLength={MAX_WORKOUT_TITLE_LENGTH}
                disabled={titleSaving}
                autoFocus
                aria-label="Workout title"
                onChange={(event) => {
                  const next = event.target.value;
                  setTitleDraft(next === workout.title ? null : next);
                  if (next === workout.title || next.trim().length === 0) {
                    clearRecoveredDraftMeta({ title: true });
                  } else {
                    saveWorkoutMetaDraft(draftScopeId, workout._id, {
                      title: next,
                    });
                  }
                }}
                className="text-base font-semibold"
              />
              <div className="flex items-center gap-2 shrink-0">
                <Button type="submit" size="sm" disabled={titleSaving}>
                  {titleSaving ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={titleSaving}
                  onClick={() => {
                    clearRecoveredDraftMeta({ title: true });
                    setTitleDraft(null);
                    setEditingTitle(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {currentTitle}
              </h1>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Rename workout"
                onClick={() => setEditingTitle(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground tabular-nums">
              <span>
                <strong className="font-semibold text-foreground">
                  {volumeSummary.completedSets}
                </strong>{" "}
                / {volumeSummary.totalSets} sets done
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>
                Volume{" "}
                <strong className="font-semibold text-foreground">
                  {volumeLabel}
                </strong>
              </span>
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNotesOpen((open) => !open)}
              className="px-2.5 text-xs text-primary"
            >
              <NotebookPen className="size-3.5" aria-hidden="true" />
              <span>{notesOpen ? "Hide session notes" : "Session notes"}</span>
            </Button>
          </div>

          {notesOpen && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Session notes</span>
                <span className="tabular-nums">
                  {currentNotes.trim().length} / {MAX_WORKOUT_NOTES_LENGTH}
                </span>
              </div>
              <Textarea
                rows={2}
                maxLength={MAX_WORKOUT_NOTES_LENGTH}
                disabled={notesSaving}
                value={currentNotes}
                placeholder="Sleep, warmup feel, belt or strap notes for today..."
                onChange={(event) => {
                  const next = event.target.value;
                  const serverNotes = workout.notes ?? "";
                  setNotesDraft(next === serverNotes ? null : next);
                  if (next === serverNotes) {
                    clearRecoveredDraftMeta({ notes: true });
                  } else {
                    saveWorkoutMetaDraft(draftScopeId, workout._id, {
                      notes: next,
                    });
                  }
                }}
                onBlur={(event) => {
                  if (skipNextNotesBlurRef.current) {
                    skipNextNotesBlurRef.current = false;
                    return;
                  }
                  if (
                    resetNotesButtonRef.current !== null &&
                    event.relatedTarget === resetNotesButtonRef.current
                  ) {
                    return;
                  }
                  if (notesDraft !== null) {
                    void handleSaveNotes(notesDraft);
                  }
                }}
              />
              {notesDraft !== null && (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    ref={resetNotesButtonRef}
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={notesSaving}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") {
                        skipNextNotesBlurRef.current = true;
                      }
                    }}
                    onPointerUp={() => {
                      skipNextNotesBlurRef.current = false;
                    }}
                    onPointerLeave={() => {
                      skipNextNotesBlurRef.current = false;
                    }}
                    onPointerCancel={() => {
                      skipNextNotesBlurRef.current = false;
                    }}
                    onClick={() => {
                      skipNextNotesBlurRef.current = false;
                      clearRecoveredDraftMeta({ notes: true });
                      setNotesDraft(null);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={notesSaving}
                    onClick={() => {
                      void handleSaveNotes(currentNotes);
                    }}
                  >
                    {notesSaving ? "Saving..." : "Save notes"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </Card>

      {!isOnline && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <WifiOff
              className="size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>
              You are offline. Edits stay cached locally on this device until
              signal returns.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {draftChangeCount > 0 && (
        <Alert>
          <AlertDescription className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle
                className="size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span>
                Unsynced local draft recovered ({draftChangeCount}{" "}
                {draftChangeCount === 1 ? "change" : "changes"}).
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncingDraft}
                onClick={handleDiscardLocalDraft}
              >
                Discard draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={syncingDraft || !isOnline}
                onClick={() => {
                  void handleSyncRecoveredDraft();
                }}
              >
                <RefreshCw
                  className={`size-3.5 ${syncingDraft ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>{syncingDraft ? "Syncing..." : "Sync now"}</span>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {actionError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {workout.exercises.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Add your first exercise
              </h2>
              <p className="text-sm text-muted-foreground">
                Pick lifts from the library or create a custom movement to start
                logging sets.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setPickerTarget({ kind: "add" });
                setPickerOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Add exercise</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div key={draftResetVersion} className="space-y-4">
          {workout.exercises.map((exercise, index) => (
            <WorkoutExerciseCard
              key={`${exercise._id}-${exercise.exerciseId}`}
              exercise={exercise}
              index={index}
              totalCount={workout.exercises.length}
              unit={unit}
              activeSetId={activeSetId}
              recoveredSetDrafts={recoveredSetDrafts}
              listBusy={reordering || removingExerciseId !== null}
              removing={removingExerciseId === exercise._id}
              addingSet={addingExerciseSetId === exercise._id}
              deletingSetId={deletingSetId}
              onActivateSet={(setId) => setSelectedSetId(setId)}
              onMoveUp={() => {
                void handleReorderExercise(index, index - 1);
              }}
              onMoveDown={() => {
                void handleReorderExercise(index, index + 1);
              }}
              onOpenSwap={() => {
                setPickerTarget({
                  kind: "swap",
                  workoutExerciseId: exercise._id,
                  currentExerciseId: exercise.exerciseId,
                  currentExerciseName: exercise.exerciseName,
                });
                setPickerOpen(true);
              }}
              onRemoveExercise={() => handleRemoveExercise(exercise)}
              onAddSet={handleAddSet}
              onCommitSet={handleCommitSet}
              onDeleteSet={handleDeleteSet}
              onWriteLocalSetDraft={(draft: LocalSetDraft) => {
                saveWorkoutSetDraft(draftScopeId, workout._id, draft);
              }}
              onClearLocalSetDraft={(setId: Id<"sets">) => {
                clearRecoveredDraftSet(setId);
              }}
            />
          ))}
        </div>
      )}

      {workout.exercises.length > 0 &&
        workout.exercises.length < MAX_WORKOUT_EXERCISES && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPickerTarget({ kind: "add" });
              setPickerOpen(true);
            }}
            className="w-full"
          >
            <Plus className="size-4 text-primary" aria-hidden="true" />
            <span>Add exercise</span>
          </Button>
        )}

      <RestTimerBar
        restTimerEndsAt={workout.restTimerEndsAt}
        referenceDurationSeconds={referenceRestSeconds}
        restNotificationsEnabled={restNotificationsEnabled}
        pushConfigured={pushConfig?.configured ?? false}
        onAdjust={(deltaSeconds) =>
          handleRestTimerAction({ kind: "adjust", deltaSeconds })
        }
        onSkip={() => handleRestTimerAction({ kind: "skip" })}
        onRestart={(durationSeconds) =>
          handleRestTimerAction({ kind: "start", durationSeconds })
        }
        busy={timerBusy}
      />

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode={pickerConfig.mode}
        resetKey={pickerConfig.resetKey}
        title={pickerConfig.title}
        description={pickerConfig.description}
        actionLabel={pickerConfig.actionLabel}
        busyActionLabel={pickerConfig.busyActionLabel}
        existingLabel="In workout"
        existingExerciseIds={existingExerciseIds}
        excludeExerciseId={pickerConfig.excludeExerciseId}
        onSelectExercise={async (exerciseId) => {
          if (pickerTarget.kind === "swap") {
            const targetWorkoutExercise = workout.exercises.find(
              (item) => item._id === pickerTarget.workoutExerciseId,
            );
            await swapWorkoutExercise({
              workoutExerciseId: pickerTarget.workoutExerciseId,
              newExerciseId: exerciseId,
            });
            if (targetWorkoutExercise !== undefined) {
              for (const setDoc of targetWorkoutExercise.sets) {
                clearRecoveredDraftSet(setDoc._id);
              }
            }
            return;
          }
          const created = await addWorkoutExercise({
            workoutId: workout._id,
            exerciseId,
          });
          setSelectedSetId(created.setId);
        }}
        errorFallback={pickerConfig.errorFallback}
      />

      <FinishWorkoutDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        workout={workout}
        recoveredSetDrafts={recoveredSetDrafts}
        initialTitle={currentTitle}
        initialNotes={currentNotes}
        unit={unit}
        onSyncPendingSetDrafts={syncPendingSetDrafts}
        onFinished={() => {
          clearWorkoutDraft(draftScopeId, workout._id);
          setRecoveredDraft(null);
        }}
      />

      <DiscardWorkoutDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        workoutId={workout._id}
        workoutTitle={currentTitle}
        onDiscardingChange={onDiscardingChange}
        onDiscarded={() => {
          clearWorkoutDraft(draftScopeId, workout._id);
          onDiscardedRedirecting();
        }}
      />
    </div>
  );
}
