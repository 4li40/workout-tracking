import { History } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function HistoryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          History
        </h1>
        <p className="text-sm text-muted-foreground">
          Review completed workouts, session volume, and personal records.
        </p>
      </header>

      <Card asChild>
        <section className="p-6 sm:p-8 space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
            <History className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              No completed workouts yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Completed sessions will appear here in reverse chronological order
              with duration, working set counts, total volume, and PR
              highlights.
            </p>
          </div>
        </section>
      </Card>
    </div>
  );
}
