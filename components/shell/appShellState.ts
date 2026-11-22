import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { DEFAULT_WEIGHT_UNIT } from "@/convex/lib/settings";
import type { WeightUnit } from "@/convex/lib/validators";

export type AppShellQueryData = FunctionReturnType<
  typeof api.userSettings.getAppShellState
>;
export type UserSettingsSnapshot = NonNullable<AppShellQueryData["settings"]>;
export type ActiveWorkoutSummary = NonNullable<
  AppShellQueryData["activeWorkout"]
>;

export type AppShellState =
  | { readonly kind: "loading" }
  | { readonly kind: "signing_out" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "needs_onboarding"; readonly initialUnit: WeightUnit }
  | {
      readonly kind: "ready";
      readonly settings: UserSettingsSnapshot;
      readonly activeWorkout: ActiveWorkoutSummary | null;
    };

export interface DeriveAppShellStateInput {
  readonly authLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly hasAuthToken: boolean;
  readonly signingOut: boolean;
  readonly shellData: AppShellQueryData | undefined;
}

export function deriveAppShellState({
  authLoading,
  isAuthenticated,
  hasAuthToken,
  signingOut,
  shellData,
}: DeriveAppShellStateInput): AppShellState {
  if (signingOut) {
    return { kind: "signing_out" };
  }
  if (authLoading || (hasAuthToken && !isAuthenticated)) {
    return { kind: "loading" };
  }
  if (!isAuthenticated) {
    return { kind: "unauthenticated" };
  }
  if (shellData === undefined) {
    return { kind: "loading" };
  }
  if (shellData.settings === null || !shellData.settings.onboardingCompleted) {
    return {
      kind: "needs_onboarding",
      initialUnit: shellData.settings?.unit ?? DEFAULT_WEIGHT_UNIT,
    };
  }
  return {
    kind: "ready",
    settings: shellData.settings,
    activeWorkout: shellData.activeWorkout,
  };
}
