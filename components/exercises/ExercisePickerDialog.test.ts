import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => [
    {
      _id: "ex_bench" as Id<"exercises">,
      name: "Barbell Bench Press",
      muscleGroup: "chest",
      equipment: "barbell",
      isBodyweight: false,
      isCustom: false,
    },
  ],
}));

vi.mock("@/components/exercises/ExerciseFormDialog", () => ({
  ExerciseFormDialog: () => null,
}));

vi.mock("radix-ui", () => ({
  Dialog: {
    Root: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open
        ? createElement("div", { "data-mock-dialog": "root" }, children)
        : null,
    Trigger: ({ children }: { children?: ReactNode }) =>
      createElement("button", { type: "button" }, children),
    Portal: ({ children }: { children?: ReactNode }) => children ?? null,
    Overlay: () => null,
    Content: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) =>
      createElement(
        "div",
        { "data-slot": "dialog-content", className },
        children,
      ),
    Title: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => createElement("h2", { className }, children),
    Description: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => createElement("p", { className }, children),
    Close: ({
      children,
      className,
      disabled,
    }: {
      children?: ReactNode;
      className?: string;
      disabled?: boolean;
    }) =>
      createElement(
        "button",
        { type: "button", className, disabled },
        children,
      ),
  },
}));

import {
  completeExerciseSelection,
  ExercisePickerDialog,
} from "@/components/exercises/ExercisePickerDialog";
import { getActiveWorkoutPickerConfig } from "@/components/workout/activeWorkoutPicker";

describe("active workout exercise picker config", () => {
  const workoutId = "workout_1" as Id<"workouts">;

  it("uses single-add mode and singular copy when adding an exercise in active workout", () => {
    const config = getActiveWorkoutPickerConfig({ kind: "add" }, workoutId);

    expect(config).toEqual({
      mode: "single",
      resetKey: "add-workout_1",
      title: "Add exercise",
      description: "Choose an exercise to add to this workout.",
      actionLabel: "Add",
      busyActionLabel: "Adding...",
      excludeExerciseId: undefined,
      errorFallback: "Could not add exercise to workout. Please try again.",
    });
  });

  it("uses single mode and target exclusion when swapping an exercise", () => {
    const config = getActiveWorkoutPickerConfig(
      {
        kind: "swap",
        workoutExerciseId: "we_1" as Id<"workoutExercises">,
        currentExerciseId: "ex_squat" as Id<"exercises">,
        currentExerciseName: "Back Squat",
      },
      workoutId,
    );

    expect(config).toEqual({
      mode: "single",
      resetKey: "swap-we_1",
      title: "Swap Back Squat",
      description:
        "Choose a replacement movement. Existing sets stay ready for the new lift.",
      actionLabel: "Swap",
      busyActionLabel: "Swapping...",
      excludeExerciseId: "ex_squat",
      errorFallback: "Could not swap exercise. Please try again.",
    });
  });
});

describe("ExercisePickerDialog", () => {
  const baseProps = {
    open: true,
    onOpenChange: () => {},
    resetKey: "test-picker",
    title: "Add exercise",
    description: "Choose an exercise.",
    actionLabel: "Add",
    existingExerciseIds: new Set<Id<"exercises">>(),
    onSelectExercise: async () => {},
    errorFallback: "Failed",
  };

  it("renders a thumb-reach Done button inside DialogFooter in multi mode", () => {
    const html = renderToStaticMarkup(
      createElement(ExercisePickerDialog, {
        ...baseProps,
        mode: "multi",
      }),
    );

    expect(html).toContain('data-slot="dialog-footer"');
    expect(html).toMatch(
      /<div data-slot="dialog-footer"[^>]*>.*<button[^>]*type="button"[^>]*>Done<\/button>.*<\/div>/,
    );
    expect(html).toContain("w-full sm:w-auto");
  });

  it("does not render a DialogFooter Done button in single mode", () => {
    const html = renderToStaticMarkup(
      createElement(ExercisePickerDialog, {
        ...baseProps,
        mode: "single",
      }),
    );

    expect(html).not.toContain('data-slot="dialog-footer"');
    expect(html).not.toContain(">Done</button>");
  });
});

describe("completeExerciseSelection", () => {
  const exerciseId = "ex_bench" as Id<"exercises">;

  it("closes immediately after selection in single mode", async () => {
    const onSelectExercise = vi.fn(async () => {});
    const onClose = vi.fn();
    const onSelectedInMulti = vi.fn();

    await completeExerciseSelection({
      mode: "single",
      exerciseId,
      onSelectExercise,
      onClose,
      onSelectedInMulti,
    });

    expect(onSelectExercise).toHaveBeenCalledWith(exerciseId);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectedInMulti).not.toHaveBeenCalled();
  });

  it("stays open and records session selection in multi mode", async () => {
    const onSelectExercise = vi.fn(async () => {});
    const onClose = vi.fn();
    const onSelectedInMulti = vi.fn();

    await completeExerciseSelection({
      mode: "multi",
      exerciseId,
      onSelectExercise,
      onClose,
      onSelectedInMulti,
    });

    expect(onSelectExercise).toHaveBeenCalledWith(exerciseId);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelectedInMulti).toHaveBeenCalledWith(exerciseId);
  });

  it("does not close or mark added when selection fails", async () => {
    const onSelectExercise = vi.fn(async () => {
      throw new Error("network error");
    });
    const onClose = vi.fn();
    const onSelectedInMulti = vi.fn();

    await expect(
      completeExerciseSelection({
        mode: "single",
        exerciseId,
        onSelectExercise,
        onClose,
        onSelectedInMulti,
      }),
    ).rejects.toThrow("network error");

    expect(onClose).not.toHaveBeenCalled();
    expect(onSelectedInMulti).not.toHaveBeenCalled();
  });
});
