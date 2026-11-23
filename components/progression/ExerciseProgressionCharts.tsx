"use client";

import { BarChart3, TrendingUp, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PR_TYPE_LABELS } from "@/convex/lib/prEngine";
import type { PrType, WeightUnit } from "@/convex/lib/validators";
import { kgToDisplayWeight } from "@/convex/lib/workouts";
import {
  type ExerciseTimelinePoint,
  formatFullDate,
  formatMetricNumber,
  formatShortDate,
  PROGRESSION_TIME_RANGE_OPTIONS,
  type ProgressionTimeRange,
} from "./types";

interface ExerciseProgressionChartsProps {
  readonly timeline: readonly ExerciseTimelinePoint[];
  readonly unit: WeightUnit;
  readonly isBodyweight: boolean;
}

type TrendMetricKey = "e1rm" | "topWeight" | "bwMaxReps" | "maxReps";
type VolumeMetricKey = "volume" | "bwSessionReps";

interface ChartDatum {
  readonly xKey: string;
  readonly shortDate: string;
  readonly fullDate: string;
  readonly workoutTitle: string;
  readonly workingSetCount: number;
  readonly achievedPrs: readonly PrType[];
  readonly value: number;
}

interface MetricConfig {
  readonly label: string;
  readonly description: string;
  readonly unitLabel: string;
  readonly valuePrefix?: string;
  readonly color: string;
  readonly maxFractionDigits: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundDisplayValue(value: number, maxFractionDigits: number): number {
  const factor = 10 ** maxFractionDigits;
  return Math.round(value * factor) / factor;
}

function computeLineYDomain(data: readonly ChartDatum[]): [number, number] {
  if (data.length === 0) {
    return [0, 10];
  }
  let minVal = data[0].value;
  let maxVal = data[0].value;
  for (let i = 1; i < data.length; i += 1) {
    if (data[i].value < minVal) {
      minVal = data[i].value;
    }
    if (data[i].value > maxVal) {
      maxVal = data[i].value;
    }
  }
  if (minVal === maxVal) {
    const pad = Math.max(2, Math.ceil(maxVal * 0.15));
    return [Math.max(0, Math.floor(minVal - pad)), Math.ceil(maxVal + pad)];
  }
  const pad = Math.max(1, (maxVal - minVal) * 0.15);
  return [Math.max(0, Math.floor(minVal - pad)), Math.ceil(maxVal + pad)];
}

function computeBarYDomain(data: readonly ChartDatum[]): [number, number] {
  if (data.length === 0) {
    return [0, 10];
  }
  let maxVal = 0;
  for (const point of data) {
    if (point.value > maxVal) {
      maxVal = point.value;
    }
  }
  const top = maxVal <= 0 ? 10 : Math.ceil(maxVal * 1.15);
  return [0, top];
}

function formatAxisTick(value: number): string {
  if (value >= 10000) {
    return `${(value / 1000).toFixed(0)}k`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(value * 10) / 10);
}

function formatFormattedMetricValue(
  value: number,
  config: MetricConfig,
): string {
  const prefix = config.valuePrefix ?? "";
  return `${prefix}${formatMetricNumber(value, config.maxFractionDigits)} ${config.unitLabel}`;
}

function isChartDatum(value: unknown): value is ChartDatum {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "xKey" in value &&
    "fullDate" in value &&
    "workoutTitle" in value &&
    "value" in value &&
    typeof value.value === "number"
  );
}

function ProgressionTooltip({
  active,
  payload,
  config,
}: Pick<TooltipContentProps, "active" | "payload"> & {
  readonly config: MetricConfig;
}) {
  if (!active || payload.length === 0) {
    return null;
  }

  const rawPayload: unknown = payload[0]?.payload;
  if (!isChartDatum(rawPayload)) {
    return null;
  }

  return (
    <div className="max-w-[240px] rounded-xl border border-border bg-card px-3 py-2.5 text-xs shadow-md space-y-1.5">
      <div>
        <p className="font-semibold text-foreground leading-snug">
          {rawPayload.workoutTitle}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {rawPayload.fullDate} &middot; {rawPayload.workingSetCount}{" "}
          {rawPayload.workingSetCount === 1 ? "working set" : "working sets"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5">
        <span className="text-muted-foreground">{config.label}</span>
        <span className="font-bold text-foreground tabular-nums">
          {formatFormattedMetricValue(rawPayload.value, config)}
        </span>
      </div>

      {rawPayload.achievedPrs.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {rawPayload.achievedPrs.map((prType) => (
            <Badge
              key={prType}
              variant="warning"
              className="px-2 py-0 text-[10px]"
            >
              <Trophy className="size-2.5" aria-hidden="true" />
              <span>{PR_TYPE_LABELS[prType]}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartEmptyState({
  message,
  canResetRange,
  onResetRange,
}: {
  readonly message: string;
  readonly canResetRange: boolean;
  readonly onResetRange: () => void;
}) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/35 px-4 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      {canResetRange && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetRange}
        >
          Show all time
        </Button>
      )}
    </div>
  );
}

export function ExerciseProgressionCharts({
  timeline,
  unit,
  isBodyweight,
}: ExerciseProgressionChartsProps) {
  const [referenceNowMs] = useState(() => Date.now());
  const [timeRange, setTimeRange] = useState<ProgressionTimeRange>("ALL");
  const [selectedTrend, setSelectedTrend] = useState<TrendMetricKey | null>(
    null,
  );
  const [selectedVolume, setSelectedVolume] = useState<VolumeMetricKey | null>(
    null,
  );

  const hasBodyweightData = useMemo(
    () =>
      timeline.some(
        (point) =>
          point.bestBodyweightReps !== null ||
          point.bodyweightSessionReps !== null,
      ),
    [timeline],
  );

  const hasWeightedData = useMemo(
    () =>
      timeline.some(
        (point) =>
          point.bestWeightKg !== null ||
          point.bestE1rmKg !== null ||
          point.sessionVolumeKg !== null,
      ),
    [timeline],
  );

  const trendOptions = useMemo<
    ReadonlyArray<{ readonly key: TrendMetricKey; readonly label: string }>
  >(() => {
    if (isBodyweight) {
      const options: Array<{
        readonly key: TrendMetricKey;
        readonly label: string;
      }> = [{ key: "bwMaxReps", label: "Max BW Reps" }];
      if (hasWeightedData) {
        options.push(
          { key: "e1rm", label: "Est. 1RM" },
          { key: "topWeight", label: "Added Weight" },
        );
      }
      return options;
    }

    return [
      { key: "e1rm", label: "Est. 1RM" },
      { key: "topWeight", label: "Top-Set Weight" },
      { key: "maxReps", label: "Max Reps / Set" },
    ];
  }, [isBodyweight, hasWeightedData]);

  const defaultTrend: TrendMetricKey = isBodyweight
    ? hasBodyweightData || !hasWeightedData
      ? "bwMaxReps"
      : "e1rm"
    : "e1rm";

  const activeTrend: TrendMetricKey =
    selectedTrend !== null &&
    trendOptions.some((option) => option.key === selectedTrend)
      ? selectedTrend
      : defaultTrend;

  const volumeOptions = useMemo<
    ReadonlyArray<{ readonly key: VolumeMetricKey; readonly label: string }>
  >(() => {
    if (!isBodyweight) {
      return [{ key: "volume", label: "Working Volume" }];
    }
    if (hasWeightedData && hasBodyweightData) {
      return [
        { key: "bwSessionReps", label: "BW Reps" },
        { key: "volume", label: "Added Volume" },
      ];
    }
    if (hasWeightedData) {
      return [{ key: "volume", label: "Added Volume" }];
    }
    return [{ key: "bwSessionReps", label: "BW Reps" }];
  }, [isBodyweight, hasWeightedData, hasBodyweightData]);

  const defaultVolume: VolumeMetricKey = isBodyweight
    ? hasBodyweightData || !hasWeightedData
      ? "bwSessionReps"
      : "volume"
    : "volume";

  const activeVolume: VolumeMetricKey =
    selectedVolume !== null &&
    volumeOptions.some((option) => option.key === selectedVolume)
      ? selectedVolume
      : defaultVolume;

  const filteredTimeline = useMemo(() => {
    const rangeOption = PROGRESSION_TIME_RANGE_OPTIONS.find(
      (option) => option.value === timeRange,
    );
    if (rangeOption === undefined || rangeOption.days === null) {
      return timeline;
    }
    const latestPointMs =
      timeline.length > 0 ? timeline[timeline.length - 1].completedAt : 0;
    const anchorMs = Math.max(referenceNowMs, latestPointMs);
    const cutoffMs = anchorMs - rangeOption.days * MS_PER_DAY;
    return timeline.filter((point) => point.completedAt >= cutoffMs);
  }, [timeline, timeRange, referenceNowMs]);

  const trendConfig = useMemo<MetricConfig>(() => {
    switch (activeTrend) {
      case "e1rm":
        return {
          label: "Estimated 1RM",
          description: `Best Epley estimated 1-rep max per session (${unit})`,
          unitLabel: unit,
          color: "var(--chart-1)",
          maxFractionDigits: 1,
        };
      case "topWeight":
        return {
          label: isBodyweight ? "Top-Set Added Weight" : "Top-Set Weight",
          description: isBodyweight
            ? `Heaviest added load lifted per session (${unit})`
            : `Heaviest working set weight per session (${unit})`,
          unitLabel: unit,
          valuePrefix: isBodyweight ? "BW+" : undefined,
          color: "var(--chart-4)",
          maxFractionDigits: 2,
        };
      case "bwMaxReps":
        return {
          label: "Max Bodyweight Reps",
          description: "Highest reps completed in a single bodyweight set",
          unitLabel: "reps",
          color: "var(--chart-1)",
          maxFractionDigits: 0,
        };
      case "maxReps":
        return {
          label: "Max Reps / Set",
          description: "Highest reps completed in a single working set",
          unitLabel: "reps",
          color: "var(--chart-3)",
          maxFractionDigits: 0,
        };
    }
  }, [activeTrend, unit, isBodyweight]);

  const volumeConfig = useMemo<MetricConfig>(() => {
    if (activeVolume === "bwSessionReps") {
      return {
        label: "Working BW Reps",
        description: "Total completed bodyweight working reps per session",
        unitLabel: "reps",
        color: "var(--chart-2)",
        maxFractionDigits: 0,
      };
    }
    return {
      label: isBodyweight ? "Added-Load Volume" : "Working Volume",
      description: isBodyweight
        ? `Total added weight × reps per session (${unit})`
        : `Total working weight × reps per session (${unit})`,
      unitLabel: unit,
      color: "var(--chart-2)",
      maxFractionDigits: 1,
    };
  }, [activeVolume, unit, isBodyweight]);

  const trendData = useMemo<ChartDatum[]>(() => {
    const items: ChartDatum[] = [];
    for (const point of filteredTimeline) {
      let rawValue: number | null = null;
      if (activeTrend === "e1rm" && point.bestE1rmKg !== null) {
        rawValue = roundDisplayValue(
          kgToDisplayWeight(point.bestE1rmKg, unit),
          1,
        );
      } else if (activeTrend === "topWeight" && point.bestWeightKg !== null) {
        rawValue = roundDisplayValue(
          kgToDisplayWeight(point.bestWeightKg, unit),
          2,
        );
      } else if (
        activeTrend === "bwMaxReps" &&
        point.bestBodyweightReps !== null
      ) {
        rawValue = point.bestBodyweightReps;
      } else if (activeTrend === "maxReps" && point.maxRepsPerSet !== null) {
        rawValue = point.maxRepsPerSet;
      }

      if (rawValue !== null) {
        items.push({
          xKey: `${point.completedAt}-${point.workoutId}`,
          shortDate: formatShortDate(point.completedAt),
          fullDate: formatFullDate(point.completedAt),
          workoutTitle: point.workoutTitle,
          workingSetCount: point.workingSetCount,
          achievedPrs: point.achievedPrs,
          value: rawValue,
        });
      }
    }
    return items;
  }, [filteredTimeline, activeTrend, unit]);

  const volumeData = useMemo<ChartDatum[]>(() => {
    const items: ChartDatum[] = [];
    for (const point of filteredTimeline) {
      let rawValue: number | null = null;
      if (
        activeVolume === "bwSessionReps" &&
        point.bodyweightSessionReps !== null
      ) {
        rawValue = point.bodyweightSessionReps;
      } else if (activeVolume === "volume" && point.sessionVolumeKg !== null) {
        rawValue = roundDisplayValue(
          kgToDisplayWeight(point.sessionVolumeKg, unit),
          1,
        );
      }

      if (rawValue !== null) {
        items.push({
          xKey: `${point.completedAt}-${point.workoutId}`,
          shortDate: formatShortDate(point.completedAt),
          fullDate: formatFullDate(point.completedAt),
          workoutTitle: point.workoutTitle,
          workingSetCount: point.workingSetCount,
          achievedPrs: point.achievedPrs,
          value: rawValue,
        });
      }
    }
    return items;
  }, [filteredTimeline, activeVolume, unit]);

  const trendLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const datum of trendData) {
      map.set(datum.xKey, datum.shortDate);
    }
    return map;
  }, [trendData]);

  const volumeLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const datum of volumeData) {
      map.set(datum.xKey, datum.shortDate);
    }
    return map;
  }, [volumeData]);

  const trendDomain = useMemo(() => computeLineYDomain(trendData), [trendData]);
  const volumeDomain = useMemo(
    () => computeBarYDomain(volumeData),
    [volumeData],
  );

  const latestTrendValue =
    trendData.length > 0 ? trendData[trendData.length - 1].value : null;
  const bestTrendValue = useMemo(() => {
    if (trendData.length === 0) {
      return null;
    }
    let best = trendData[0].value;
    for (let i = 1; i < trendData.length; i += 1) {
      if (trendData[i].value > best) {
        best = trendData[i].value;
      }
    }
    return best;
  }, [trendData]);

  const latestVolumeValue =
    volumeData.length > 0 ? volumeData[volumeData.length - 1].value : null;

  return (
    <section aria-label="Progression charts" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-foreground">
            Progression charts
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing {filteredTimeline.length} of {timeline.length}{" "}
            {timeline.length === 1 ? "session" : "sessions"}
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart time range"
          className="grid grid-cols-5 gap-1 rounded-xl bg-secondary p-1 sm:inline-grid"
        >
          {PROGRESSION_TIME_RANGE_OPTIONS.map((option) => {
            const active = timeRange === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                aria-pressed={active}
                onClick={() => setTimeRange(option.value)}
                className={
                  active
                    ? "rounded-lg px-3 shadow-xs"
                    : "rounded-lg px-3 hover:bg-card/70"
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <Card asChild>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TrendingUp
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                <h3 className="text-sm font-semibold text-foreground">
                  {trendConfig.label}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {trendConfig.description}
              </p>
            </div>

            {trendOptions.length > 1 && (
              <div
                role="group"
                aria-label="Strength chart metric"
                className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1"
              >
                {trendOptions.map((option) => {
                  const active = activeTrend === option.key;
                  return (
                    <Button
                      key={option.key}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "ghost"}
                      aria-pressed={active}
                      onClick={() => setSelectedTrend(option.key)}
                      className={
                        active
                          ? "rounded-lg px-3 shadow-xs"
                          : "rounded-lg px-3 hover:bg-card/70"
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {latestTrendValue !== null && bestTrendValue !== null && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground">Latest:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatFormattedMetricValue(latestTrendValue, trendConfig)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground">Range best:</span>
                <span className="font-semibold text-primary tabular-nums">
                  {formatFormattedMetricValue(bestTrendValue, trendConfig)}
                </span>
              </div>
            </div>
          )}

          {trendData.length === 0 ? (
            <ChartEmptyState
              message={
                timeRange !== "ALL" && timeline.length > 0
                  ? `No ${trendConfig.label.toLowerCase()} data recorded in this time range.`
                  : `No ${trendConfig.label.toLowerCase()} data logged yet.`
              }
              canResetRange={timeRange !== "ALL" && timeline.length > 0}
              onResetRange={() => setTimeRange("ALL")}
            />
          ) : (
            <div className="h-[250px] sm:h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart
                  data={trendData}
                  margin={{ top: 10, right: 12, left: -8, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="xKey"
                    tickFormatter={(value: string) =>
                      trendLabelByKey.get(value) ?? ""
                    }
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={trendDomain}
                    tickFormatter={formatAxisTick}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    content={(props) => (
                      <ProgressionTooltip
                        active={props.active}
                        payload={props.payload}
                        config={trendConfig}
                      />
                    )}
                    cursor={{
                      stroke: "var(--border)",
                      strokeWidth: 1,
                      strokeDasharray: "3 3",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={trendConfig.label}
                    stroke={trendConfig.color}
                    strokeWidth={2.5}
                    dot={{
                      r: trendData.length === 1 ? 6 : 4,
                      fill: trendConfig.color,
                      stroke: "#ffffff",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: trendConfig.color,
                      stroke: "#ffffff",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      <Card asChild>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-success" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">
                  {volumeConfig.label}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {volumeConfig.description}
              </p>
            </div>

            {volumeOptions.length > 1 && (
              <div
                role="group"
                aria-label="Volume chart metric"
                className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1"
              >
                {volumeOptions.map((option) => {
                  const active = activeVolume === option.key;
                  return (
                    <Button
                      key={option.key}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "ghost"}
                      aria-pressed={active}
                      onClick={() => setSelectedVolume(option.key)}
                      className={
                        active
                          ? "rounded-lg px-3 shadow-xs"
                          : "rounded-lg px-3 hover:bg-card/70"
                      }
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          {latestVolumeValue !== null && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground">Latest session:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatFormattedMetricValue(latestVolumeValue, volumeConfig)}
                </span>
              </div>
            </div>
          )}

          {volumeData.length === 0 ? (
            <ChartEmptyState
              message={
                timeRange !== "ALL" && timeline.length > 0
                  ? `No ${volumeConfig.label.toLowerCase()} recorded in this time range.`
                  : `No ${volumeConfig.label.toLowerCase()} logged yet.`
              }
              canResetRange={timeRange !== "ALL" && timeline.length > 0}
              onResetRange={() => setTimeRange("ALL")}
            />
          ) : (
            <div className="h-[240px] sm:h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={volumeData}
                  margin={{ top: 10, right: 12, left: -8, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="xKey"
                    tickFormatter={(value: string) =>
                      volumeLabelByKey.get(value) ?? ""
                    }
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={volumeDomain}
                    tickFormatter={formatAxisTick}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    content={(props) => (
                      <ProgressionTooltip
                        active={props.active}
                        payload={props.payload}
                        config={volumeConfig}
                      />
                    )}
                    cursor={{ fill: "var(--secondary)", opacity: 0.6 }}
                  />
                  <Bar
                    dataKey="value"
                    name={volumeConfig.label}
                    fill={volumeConfig.color}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
