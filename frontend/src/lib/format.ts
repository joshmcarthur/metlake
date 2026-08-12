const NZ_DATE = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Pacific/Auckland",
});

/** Format an ISO date for period labels (e.g. "1 Aug 2026"). */
export function formatNzDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return NZ_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatPeriodLabel(from: string, to: string): string {
  if (from === to) {
    return `${formatNzDate(from)} · NZST`;
  }
  return `${formatNzDate(from)} → ${formatNzDate(to)} · NZST`;
}

/** Stored metrics are 0–1 fractions; display as percent. */
export function formatPercent(fraction: number | null, digits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-NZ");
}

/** Mean departure variance is stored in minutes. */
export function formatMinutes(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}m`;
}

export function formatMinutesDelta(
  current: number | null,
  prior: number | null,
  label: string,
): MetricDelta {
  if (current === null || prior === null) {
    return { text: `— vs ${label}`, trend: "flat" };
  }
  const diff = current - prior;
  if (Math.abs(diff) < 0.05) {
    return { text: `flat vs ${label}`, trend: "flat" };
  }
  const sign = diff > 0 ? "+" : "−";
  const trend: DeltaTrend = diff < 0 ? "up" : "down";
  return {
    text: `${sign}${Math.abs(diff).toFixed(1)}m vs ${label}`,
    trend,
  };
}

export type DeltaTrend = "up" | "down" | "flat";

export interface MetricDelta {
  text: string;
  trend: DeltaTrend;
}

export function formatRateDelta(
  current: number | null,
  prior: number | null,
  label: string,
  higherIsBetter = true,
): MetricDelta {
  if (current === null || prior === null) {
    return { text: "— vs prior", trend: "flat" };
  }
  const diffPp = (current - prior) * 100;
  if (Math.abs(diffPp) < 0.05) {
    return { text: `flat vs ${label}`, trend: "flat" };
  }
  const sign = diffPp > 0 ? "+" : "−";
  const trend: DeltaTrend =
    higherIsBetter
      ? diffPp > 0
        ? "up"
        : "down"
      : diffPp < 0
        ? "up"
        : "down";
  return {
    text: `${sign}${Math.abs(diffPp).toFixed(1)} pp vs ${label}`,
    trend,
  };
}

export function formatCountDelta(
  current: number | null,
  prior: number | null,
  label: string,
): MetricDelta {
  if (current === null || prior === null) {
    return { text: `— vs ${label}`, trend: "flat" };
  }
  const diff = Math.round(current - prior);
  if (diff === 0) {
    return { text: `flat vs ${label}`, trend: "flat" };
  }
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(diff).toLocaleString("en-NZ")} vs ${label}`,
    trend: "flat",
  };
}
