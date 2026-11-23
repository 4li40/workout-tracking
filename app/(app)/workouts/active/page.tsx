"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ArrowLeft, Dumbbell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

export default function ActiveWorkoutRedirectPage() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const activeWorkout = useQuery(
    api.workouts.getActive,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (activeWorkout !== undefined && activeWorkout !== null) {
      router.replace(`/workouts/${activeWorkout._id}`);
    }
  }, [activeWorkout, router]);

  if (activeWorkout === undefined || activeWorkout !== null) {
    return (
      <div
        className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-4"
        aria-busy="true"
        aria-label="Opening active workout"
      >
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-56" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <Card asChild>
        <section className="p-6 sm:p-8 space-y-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
            <Dumbbell className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">
              No active workout
            </h1>
            <p className="text-sm text-muted-foreground">
              You do not have an in-progress session right now. Head back to
              Workouts to launch a freestyle session or start from a routine.
            </p>
          </div>
          <div>
            <Button asChild>
              <Link href="/workouts">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Workouts</span>
              </Link>
            </Button>
          </div>
        </section>
      </Card>
    </div>
  );
}
