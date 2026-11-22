"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  BookOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DeleteExerciseDialog } from "@/components/exercises/DeleteExerciseDialog";
import {
  ExerciseFormDialog,
  type ExerciseFormMode,
} from "@/components/exercises/ExerciseFormDialog";
import { ExerciseNoteDialog } from "@/components/exercises/ExerciseNoteDialog";
import type { ExerciseListItem } from "@/components/exercises/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  type ExerciseScopeFilter,
  filterExercises,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
} from "@/convex/lib/exercises";
import type { Equipment, MuscleGroup } from "@/convex/lib/validators";

const SCOPE_OPTIONS: ReadonlyArray<{
  readonly value: ExerciseScopeFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "global", label: "Global" },
];

export default function ExercisesPage() {
  const { isAuthenticated } = useConvexAuth();
  const exercises = useQuery(api.exercises.list, isAuthenticated ? {} : "skip");

  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ExerciseScopeFilter>("all");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | "all">("all");
  const [equipment, setEquipment] = useState<Equipment | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<ExerciseFormMode>({
    kind: "create",
  });
  const [noteExercise, setNoteExercise] = useState<ExerciseListItem | null>(
    null,
  );
  const [deleteExercise, setDeleteExercise] = useState<ExerciseListItem | null>(
    null,
  );

  const hasActiveFilters =
    search.trim().length > 0 ||
    scope !== "all" ||
    muscleGroup !== "all" ||
    equipment !== "all";

  const filteredExercises = useMemo(() => {
    if (exercises === undefined) {
      return [];
    }
    return filterExercises(exercises, {
      search,
      scope,
      muscleGroup,
      equipment,
    });
  }, [exercises, search, scope, muscleGroup, equipment]);

  function resetFilters() {
    setSearch("");
    setScope("all");
    setMuscleGroup("all");
    setEquipment("all");
  }

  function openCreateDialog() {
    setFormMode({ kind: "create" });
    setFormOpen(true);
  }

  function openEditDialog(exercise: ExerciseListItem) {
    setFormMode({ kind: "edit", exercise });
    setFormOpen(true);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Exercises
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse the shared lift library, create custom movements, and keep
            private sticky notes.
          </p>
        </div>

        <Button
          type="button"
          onClick={openCreateDialog}
          className="self-start sm:self-auto"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>New exercise</span>
        </Button>
      </header>

      <Card asChild>
        <section className="p-4 sm:p-5 space-y-4" aria-label="Filter exercises">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search exercises or sticky notes..."
                aria-label="Search exercises"
                className="pl-10 pr-11"
              />
              {search.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
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
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NativeSelect
              aria-label="Filter by muscle group"
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
              aria-label="Filter by equipment"
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {exercises === undefined
                ? "Loading exercise library..."
                : hasActiveFilters
                  ? `Showing ${filteredExercises.length} of ${exercises.length} exercises`
                  : `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`}
            </span>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="min-h-11 px-3 text-xs font-semibold text-primary hover:bg-accent hover:text-primary"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                <span>Reset filters</span>
              </Button>
            )}
          </div>
        </section>
      </Card>

      {exercises === undefined ? (
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label="Loading exercises"
        >
          {[0, 1, 2, 3].map((index) => (
            <Card key={index}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-10 w-24 rounded-xl" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8 flex flex-col items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {scope === "custom" && !hasActiveFilters
                  ? "No custom exercises yet"
                  : "No matching exercises"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {scope === "custom" && !hasActiveFilters
                  ? "Create a weighted or bodyweight custom movement to use across your routines."
                  : "Try clearing one of your filters or create a custom exercise."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasActiveFilters && (
                <Button type="button" variant="outline" onClick={resetFilters}>
                  Reset filters
                </Button>
              )}
              <Button type="button" onClick={openCreateDialog}>
                <Plus className="size-4" aria-hidden="true" />
                <span>New exercise</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredExercises.map((exercise) => {
            const hasNote =
              exercise.notes !== undefined && exercise.notes.length > 0;

            return (
              <Card asChild key={exercise._id}>
                <article className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <h2 className="text-base font-semibold text-foreground">
                        {exercise.name}
                      </h2>
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

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant={hasNote ? "outline" : "secondary"}
                        onClick={() => setNoteExercise(exercise)}
                      >
                        <StickyNote
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        <span>{hasNote ? "Edit note" : "Add note"}</span>
                      </Button>

                      {exercise.isCustom && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Edit ${exercise.name}`}
                            onClick={() => openEditDialog(exercise)}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Delete ${exercise.name}`}
                            onClick={() => setDeleteExercise(exercise)}
                            className="text-destructive hover:border-destructive/40 hover:bg-destructive-tint hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {hasNote && (
                    <div className="rounded-xl border border-primary/15 bg-accent/60 px-3.5 py-2.5 text-sm">
                      <p className="text-xs font-semibold text-primary">
                        Private note
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground">
                        {exercise.notes}
                      </p>
                    </div>
                  )}
                </article>
              </Card>
            );
          })}
        </div>
      )}

      <ExerciseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
      />

      <ExerciseNoteDialog
        exercise={noteExercise}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setNoteExercise(null);
          }
        }}
      />

      <DeleteExerciseDialog
        exercise={deleteExercise}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteExercise(null);
          }
        }}
      />
    </div>
  );
}
