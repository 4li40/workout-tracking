export const DEFAULT_WEIGHT_UNIT = "kg" as const;
export const DEFAULT_REST_SECONDS = 90;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
export const REST_TIMER_PRESETS = [60, 90, 120, 150, 180] as const;

export type ParseRestSecondsResult =
  | { readonly kind: "ok"; readonly seconds: number }
  | { readonly kind: "error"; readonly message: string };

export function parseRestSeconds(value: number): ParseRestSecondsResult {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return {
      kind: "error",
      message: "Rest timer must be a whole number of seconds.",
    };
  }
  if (value < MIN_REST_SECONDS || value > MAX_REST_SECONDS) {
    return {
      kind: "error",
      message: `Rest timer must be between ${MIN_REST_SECONDS} and ${MAX_REST_SECONDS} seconds.`,
    };
  }
  return { kind: "ok", seconds: value };
}

export function formatRestDuration(seconds: number): string {
  const totalSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.round(seconds))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.floor(elapsedMs / 1000))
    : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${paddedMinutes}:${paddedSeconds}`;
}
