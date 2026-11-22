import { TrendingUp } from "lucide-react";

export default function ProgressPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Progress
        </h1>
        <p className="text-sm text-ink-muted">
          Track strength trends and personal records across every lift.
        </p>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">
            Progression charts coming soon
          </h2>
          <p className="text-sm text-ink-muted">
            Per-exercise charts for estimated 1RM, top-set weight, session
            volume, and bodyweight rep records will populate as you log
            workouts.
          </p>
        </div>
      </section>
    </div>
  );
}
