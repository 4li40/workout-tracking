import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { WeightUnit } from "@/convex/lib/validators";
import { formatWeightFromKg, kgToDisplayWeight } from "@/convex/lib/workouts";

export type ProgressionOverview = FunctionReturnType<
  typeof api.progression.listOverview
>;

export type ProgressionOverviewExercise =
  ProgressionOverview["exercises"][number];

export type ExerciseProgressionDetail = NonNullable<
  FunctionReturnType<typeof api.progression.getExerciseDetail>
>;

export type ExerciseRecordSummary = NonNullable<
  ExerciseProgressionDetail["record"]
>;

export type ExerciseTimelinePoint =
  ExerciseProgressionDetail["timeline"][number];

export type ProgressionNextTarget = NonNullable<
  ExerciseProgressionDetail["nextTarget"]
>;

export type ProgressionTimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

export const PROGRESSION_TIME_RANGE_OPTIONS: ReadonlyArray<{
  readonly value: ProgressionTimeRange;
  readonly label: string;
  readonly days: number | null;
}> = [
  { value: "1M", label: "1M", days: 30 },
  { value: "3M", label: "3M", days: 90 },
  { value: "6M", label: "6M", days: 180 },
  { value: "1Y", label: "1Y", days: 365 },
  { value: "ALL", label: "All", days: null },
];

export function formatWeightDisplay(
  weightKg: number,
  unit: WeightUnit,
  isAddedLoad = false,
): string {
  const prefix = isAddedLoad ? "BW+" : "";
  return `${prefix}${formatWeightFromKg(weightKg, unit)} ${unit}`;
}

export function formatMetricNumber(
  value: number,
  maxFractionDigits = 1,
): string {
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}

export function formatE1rmDisplay(e1rmKg: number, unit: WeightUnit): string {
  return `${formatMetricNumber(kgToDisplayWeight(e1rmKg, unit), 1)} ${unit}`;
}

export function formatVolumeDisplay(
  volumeKg: number,
  unit: WeightUnit,
): string {
  return `${formatMetricNumber(kgToDisplayWeight(volumeKg, unit), 1)} ${unit}`;
}

export function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
