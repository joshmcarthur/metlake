const NZ_DATE = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Pacific/Auckland",
});

const NZ_DAY_MONTH = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  timeZone: "Pacific/Auckland",
});

function utcDateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format an ISO date for period labels (e.g. "1 Aug 2026"). */
export function formatNzDate(iso: string): string {
  return NZ_DATE.format(utcDateFromIso(iso));
}

/** Short axis label (e.g. "1 Aug"). */
export function formatNzDayMonth(iso: string): string {
  return NZ_DAY_MONTH.format(utcDateFromIso(iso));
}

export function formatPeriodLabel(
  from: string,
  to: string,
  estimated = false,
): string {
  const estimateSuffix = estimated ? " · some days estimated from live feed" : "";
  if (from === to) {
    return `${formatNzDate(from)} · NZST${estimateSuffix}`;
  }
  return `${formatNzDate(from)} → ${formatNzDate(to)} · NZST${estimateSuffix}`;
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

/** Last-stop delay is stored in seconds; display as minutes. */
export function formatDelayMinutes(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = seconds / 60;
  if (minutes < 10 && Math.abs(minutes - Math.round(minutes)) >= 0.05) {
    return `${minutes.toFixed(1)} min`;
  }
  return `${Math.round(minutes)} min`;
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
