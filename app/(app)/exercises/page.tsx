import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function ExercisesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Exercises
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse the shared lift library and manage your custom movements.
        </p>
      </header>

      <Card asChild>
        <section className="p-6 sm:p-8 space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Exercise library management coming soon
            </h2>
            <p className="text-sm text-muted-foreground">
              Search and filter seeded lifts by muscle group and equipment, add
              custom exercises, and save private sticky cues per movement.
            </p>
          </div>
        </section>
      </Card>
    </div>
  );
}
