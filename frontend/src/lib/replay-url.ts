export interface ReplayUrlState {
  from?: string;
  to?: string;
  t?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isIsoInstant(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/** Parse `/replay/?from=&to=&t=` query string. */
export function parseReplaySearch(search: string): ReplayUrlState {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const fromRaw = params.get("from")?.trim() ?? "";
  const toRaw = params.get("to")?.trim() ?? "";
  const tRaw = params.get("t")?.trim() ?? "";
  return {
    from: fromRaw && isIsoDate(fromRaw) ? fromRaw : undefined,
    to: toRaw && isIsoDate(toRaw) ? toRaw : undefined,
    t: tRaw && isIsoInstant(tRaw) ? tRaw : undefined,
  };
}

/** Serialize replay state to a query string (no leading `?`). */
export function serializeReplaySearch(state: ReplayUrlState): string {
  const params = new URLSearchParams();
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.t) params.set("t", state.t);
  return params.toString();
}

/** Floor an ISO instant to UTC hour key `YYYY-MM-DDTHH`. */
export function utcHourKey(isoInstant: string): string {
  const date = new Date(isoInstant);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

/**
 * Midnight Pacific/Auckland for a calendar day as ISO-8601 with offset.
 * Uses the offset that applies on that local calendar day.
 */
export function nzDayStartIso(yyyyMmDd: string): string {
  if (!isIsoDate(yyyyMmDd)) {
    throw new Error(`Invalid NZ date: ${yyyyMmDd}`);
  }
  // Probe noon UTC on that calendar label, then read Auckland offset for that
  // local day and reconstruct local midnight.
  const probe = new Date(`${yyyyMmDd}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(probe);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const offsetRaw = get("timeZoneName"); // e.g. GMT+12 or GMT+13
  const match = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(offsetRaw);
  const hours = match ? Number(match[1]) : 12;
  const mins = match?.[2] ? Number(match[2]) : 0;
  const sign = hours < 0 || Object.is(hours, -0) ? "-" : "+";
  const absH = String(Math.abs(hours)).padStart(2, "0");
  const absM = String(Math.abs(mins)).padStart(2, "0");
  return `${yyyyMmDd}T00:00:00${sign}${absH}:${absM}`;
}

/** Add one UTC hour to an hour key. */
export function nextUtcHourKey(hourKey: string): string {
  const [datePart, hh] = hourKey.split("T");
  const date = new Date(`${datePart}T${hh}:00:00Z`);
  date.setUTCHours(date.getUTCHours() + 1);
  return utcHourKey(date.toISOString());
}

/** Parse `YYYY-MM-DDTHH` into path segments. */
export function splitUtcHourKey(hourKey: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
} {
  const [datePart, hour] = hourKey.split("T");
  const [year, month, day] = datePart.split("-");
  return { year, month, day, hour };
}

const CAPTURE_STEP_MS = 5 * 60 * 1000;

/**
 * 5-minute tick unix-ms values spanning NZ calendar days `[from, to]` inclusive.
 */
export function buildPeriodTicks(from: string, to: string): number[] {
  const start = Date.parse(nzDayStartIso(from));
  const endDayStart = Date.parse(nzDayStartIso(to));
  const endExclusive = endDayStart + 24 * 60 * 60 * 1000;
  const ticks: number[] = [];
  for (let t = start; t < endExclusive; t += CAPTURE_STEP_MS) {
    ticks.push(t);
  }
  return ticks;
}
