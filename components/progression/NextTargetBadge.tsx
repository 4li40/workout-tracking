"use client";

import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { WeightUnit } from "@/convex/lib/validators";
import { formatWeightFromKg } from "@/convex/lib/workouts";
import type { ProgressionNextTarget } from "./types";

interface NextTargetBadgeProps {
  readonly target: ProgressionNextTarget;
  readonly unit: WeightUnit;
  readonly variant?: "compact" | "card";
}

function formatTargetDetails(target: ProgressionNextTarget, unit: WeightUnit) {
  if (target.kind === "weight") {
    const prefix = target.isAddedLoad ? "BW+" : "";
    const targetLabel = `${prefix}${formatWeightFromKg(target.targetWeightKg, unit)} ${unit}`;
    const incrementLabel = `+${target.incrementDisplay} ${unit}`;
    const previousLabel = `${prefix}${formatWeightFromKg(target.previousWeightKg, unit)} ${unit} × ${target.previousReps}`;
    return { targetLabel, incrementLabel, previousLabel };
  }

  const targetLabel = `BW × ${target.targetReps}`;
  const repDelta = target.targetReps - target.previousReps;
  const incrementLabel = repDelta > 0 ? `+${repDelta} rep` : "Maintain";
  const previousLabel = `BW × ${target.previousReps}`;
  return { targetLabel, incrementLabel, previousLabel };
}

export function NextTargetBadge({
  target,
  unit,
  variant = "compact",
}: NextTargetBadgeProps) {
  const { targetLabel, incrementLabel, previousLabel } = formatTargetDetails(
    target,
    unit,
  );

  if (variant === "card") {
    return (
      <Card asChild>
        <section
          aria-label="Next session target"
          className="border-primary/20 bg-accent/55 p-4 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Target className="size-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Next session target
                  </p>
                  <Badge variant="default" className="tabular-nums">
                    {incrementLabel}
                  </Badge>
                </div>
                <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
                  {targetLabel}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Up from your last top working set ({previousLabel})
                </p>
              </div>
            </div>
          </div>
        </section>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/15 bg-accent/60 px-3 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-primary tabular-nums">
        <Target className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Next target: {targetLabel} ({incrementLabel})
        </span>
      </span>
      <span className="text-muted-foreground tabular-nums">
        Last: {previousLabel}
      </span>
    </div>
  );
}
