"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, Plus, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ExerciseFormDialog } from "@/components/exercises/ExerciseFormDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  type ExerciseScopeFilter,
  filterExercises,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
} from "@/convex/lib/exercises";
import type { Equipment, MuscleGroup } from "@/convex/lib/validators";
import { getConvexErrorMessage } from "@/lib/convexError";

const SCOPE_OPTIONS: ReadonlyArray<{
  readonly value: ExerciseScopeFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "global", label: "Global" },
];

interface ExercisePickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly templateId: Id<"workoutTemplates">;
  readonly existingExerciseIds: ReadonlySet<Id<"exercises">>;
}

function ExercisePickerBody({
  templateId,
  existingExerciseIds,
}: {
  readonly templateId: Id<"workoutTemplates">;
  readonly existingExerciseIds: ReadonlySet<Id<"exercises">>;
}) {
  const { isAuthenticated } = useConvexAuth();
  const exercises = useQuery(api.exercises.list, isAuthenticated ? {} : "skip");
  const addExercise = useMutation(api.templates.addExercise);

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ExerciseScopeFilter>("all");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | "all">("all");
  const [equipment, setEquipment] = useState<Equipment | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [highlightedExerciseId, setHighlightedExerciseId] =
    useState<Id<"exercises"> | null>(null);
  const [addingExerciseId, setAddingExerciseId] =
    useState<Id<"exercises"> | null>(null);
  const [addedThisSession, setAddedThisSession] = useState<
    ReadonlySet<Id<"exercises">>
  >(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const hasActiveFilters =
    search.trim().length > 0 ||
    scope !== "all" ||
    muscleGroup !== "all" ||
    equipment !== "all";

  const filteredExercises = useMemo(() => {
    if (exercises === undefined) {
      return [];
    }
    const filtered = filterExercises(exercises, {
      search,
      scope,
      muscleGroup,
      equipment,
    });
    if (highlightedExerciseId === null) {
      return filtered;
    }
    const highlighted = filtered.find(
      (item) => item._id === highlightedExerciseId,
    );
    if (highlighted === undefined) {
      return filtered;
    }
    return [
      highlighted,
      ...filtered.filter((item) => item._id !== highlightedExerciseId),
    ];
  }, [exercises, search, scope, muscleGroup, equipment, highlightedExerciseId]);

  function resetFilters() {
    setSearch("");
    setScope("all");
    setMuscleGroup("all");
    setEquipment("all");
  }

  async function handleAdd(exerciseId: Id<"exercises">) {
    if (addingExerciseId !== null) {
      return;
    }

    setAddingExerciseId(exerciseId);
    setError(null);
    try {
      await addExercise({ templateId, exerciseId });
      setAddedThisSession((previous) => {
        const next = new Set(previous);
        next.add(exerciseId);
        return next;
      });
    } catch (err) {
      setError(
        getConvexErrorMessage(
          err,
          "Could not add exercise to routine. Please try again.",
        ),
      );
    } finally {
      setAddingExerciseId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreateOpen(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="size-4 text-primary" aria-hidden="true" />
          <span>Create custom exercise</span>
        </Button>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-primary hover:bg-accent hover:text-primary"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>Reset filters</span>
          </Button>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exercises..."
            aria-label="Search exercises to add"
            className="pl-10 pr-11"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear exercise search"
              className="absolute top-1/2 right-0.5 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Exercise source"
          className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1"
        >
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                aria-pressed={active}
                onClick={() => setScope(option.value)}
                className={
                  active
                    ? "rounded-lg px-3 shadow-xs"
                    : "rounded-lg px-3 hover:bg-card/70"
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <NativeSelect
            aria-label="Filter picker by muscle group"
            value={muscleGroup}
            onChange={(event) => {
              if (event.target.value === "all") {
                setMuscleGroup("all");
                return;
              }
              const match = MUSCLE_GROUP_OPTIONS.find(
                (option) => option.value === event.target.value,
              );
              if (match !== undefined) {
                setMuscleGroup(match.value);
              }
            }}
          >
            <option value="all">All muscles</option>
            {MUSCLE_GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="Filter picker by equipment"
            value={equipment}
            onChange={(event) => {
              if (event.target.value === "all") {
                setEquipment("all");
                return;
              }
              const match = EQUIPMENT_OPTIONS.find(
                (option) => option.value === event.target.value,
              );
              if (match !== undefined) {
                setEquipment(match.value);
              }
            }}
          >
            <option value="all">All equipment</option>
            {EQUIPMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {exercises === undefined ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-11 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredExercises.length === 0 ? (
          <div className="rounded-xl border border-border bg-secondary/40 p-5 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              No matching exercises
            </p>
            <p className="text-xs text-muted-foreground">
              Adjust your search or create a custom exercise above.
            </p>
          </div>
        ) : (
          filteredExercises.map((exercise) => {
            const isAdding = addingExerciseId === exercise._id;
            const inRoutine = existingExerciseIds.has(exercise._id);
            const addedNow = addedThisSession.has(exercise._id);
            const isNew = highlightedExerciseId === exercise._id;

            return (
              <div
                key={exercise._id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                  isNew
                    ? "border-primary/40 bg-accent/40"
                    : "border-border bg-card"
                }`}
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {exercise.name}
                    </p>
                    {isNew && <Badge variant="accent">New</Badge>}
                    {addedNow ? (
                      <Badge variant="success">
                        <Check className="size-3" aria-hidden="true" />
                        Added
                      </Badge>
                    ) : (
                      inRoutine && <Badge variant="secondary">In routine</Badge>
                    )}
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
                    {exercise.isCustom && (
                      <Badge variant="outline">Custom</Badge>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant={inRoutine ? "secondary" : "default"}
                  disabled={addingExerciseId !== null}
                  onClick={() => {
                    void handleAdd(exercise._id);
                  }}
                  className="shrink-0"
                >
                  {isAdding ? "Adding..." : inRoutine ? "Add again" : "Add"}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <ExerciseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={{ kind: "create" }}
        onCreated={(exerciseId) => {
          resetFilters();
          setHighlightedExerciseId(exerciseId);
        }}
      />
    </div>
  );
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  templateId,
  existingExerciseIds,
}: ExercisePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add exercises</DialogTitle>
          <DialogDescription>
            Tap Add on as many exercises as you need for this routine.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <ExercisePickerBody
            key={templateId}
            templateId={templateId}
            existingExerciseIds={existingExerciseIds}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
