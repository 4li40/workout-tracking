"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  BookOpen,
  Dumbbell,
  History,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { formatRestDuration } from "@/convex/lib/settings";
import {
  isNavItemActive,
  PRIMARY_NAV_ITEMS,
  type NavItemId,
} from "@/lib/navigation";
import { ActiveWorkoutResumeBar } from "./ActiveWorkoutResumeBar";
import { deriveAppShellState } from "./appShellState";
import { OnboardingFlow } from "./OnboardingFlow";

const NAV_ICONS: Record<NavItemId, LucideIcon> = {
  workouts: Dumbbell,
  history: History,
  progress: TrendingUp,
  exercises: BookOpen,
  settings: Settings,
};

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const shellData = useQuery(
    api.userSettings.getAppShellState,
    isAuthenticated ? {} : "skip",
  );
  const pathname = usePathname();
  const router = useRouter();

  const state = deriveAppShellState({
    authLoading,
    isAuthenticated,
    shellData,
  });

  useEffect(() => {
    if (state.kind === "unauthenticated") {
      router.replace("/signin");
    }
  }, [state.kind, router]);

  switch (state.kind) {
    case "loading":
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
              <Dumbbell className="h-6 w-6 animate-pulse" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-ink-muted">
              Loading your workouts...
            </p>
          </div>
        </div>
      );

    case "unauthenticated":
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
          <p className="text-sm font-medium text-ink-muted">
            Redirecting to sign in...
          </p>
        </div>
      );

    case "needs_onboarding":
      return <OnboardingFlow initialUnit={state.initialUnit} />;

    case "ready": {
      const showResumeBar =
        state.activeWorkout !== null && pathname !== "/workouts/active";

      return (
        <div className="min-h-screen bg-canvas">
          <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex-col bg-surface border-r border-border z-30">
            <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                <Dumbbell className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="text-base font-bold tracking-tight text-ink">
                Workout Tracker
              </span>
            </div>

            <nav
              aria-label="Primary"
              className="flex-1 px-3 py-4 flex flex-col gap-1"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`min-h-11 flex items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                      active
                        ? "bg-brand-tint text-brand font-semibold"
                        : "text-ink-muted font-medium hover:bg-surface-subtle hover:text-ink"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-3">
              <Link
                href="/settings"
                className="min-h-11 flex items-center justify-between rounded-xl px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              >
                <span className="font-medium">Preferences</span>
                <span className="font-semibold text-ink">
                  {state.settings.unit} &middot;{" "}
                  {formatRestDuration(state.settings.defaultRestSeconds)} rest
                </span>
              </Link>
            </div>
          </aside>

          <div className="md:pl-60 min-h-screen bg-canvas flex flex-col">
            {showResumeBar && state.activeWorkout !== null && (
              <ActiveWorkoutResumeBar activeWorkout={state.activeWorkout} />
            )}
            <main
              className={`flex-1 ${showResumeBar ? "pb-44" : "pb-24"} md:pb-10`}
            >
              {children}
            </main>
          </div>

          <nav
            aria-label="Primary"
            className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-border pb-safe"
          >
            <div className="grid grid-cols-5">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`min-h-[56px] min-w-[44px] flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                      active
                        ? "text-brand font-semibold"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-full">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      );
    }

    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
