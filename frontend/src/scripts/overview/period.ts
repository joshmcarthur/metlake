import { formatPeriodLabel } from "../../lib/format";
import type { DateRange } from "../../lib/types";

export type PeriodKey = "day" | "yesterday" | "week" | "month" | "all";

export interface PeriodState {
  key: PeriodKey | "custom";
  range: DateRange;
  compare: boolean;
}

export interface PeriodBounds {
  asOf: string;
  allFrom: string;
  allTo: string;
}

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function daysInclusive(from: string, to: string): number {
  const start = parseIso(from).getTime();
  const end = parseIso(to).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNum, 0));
  return toIso(last);
}

export function boundsFromManifest(
  months: readonly string[],
  updatedAt: string,
): PeriodBounds {
  const asOf = updatedAt.slice(0, 10);
  const firstMonth = months[0] ?? asOf.slice(0, 7);
  const lastMonth = months[months.length - 1] ?? asOf.slice(0, 7);
  return {
    asOf,
    allFrom: `${firstMonth}-01`,
    allTo: endOfMonth(lastMonth),
  };
}

export function rangeForPeriod(
  key: PeriodKey,
  bounds: PeriodBounds,
): DateRange {
  const { asOf } = bounds;
  switch (key) {
    case "day":
      return { from: asOf, to: asOf };
    case "yesterday": {
      const yesterday = addDays(asOf, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week":
      return { from: addDays(asOf, -6), to: asOf };
    case "month":
      return { from: startOfMonth(asOf), to: asOf };
    case "all":
      return { from: bounds.allFrom, to: bounds.allTo };
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

export function priorRange(range: DateRange): DateRange | null {
  const span = daysInclusive(range.from, range.to);
  if (span <= 0) return null;
  const to = addDays(range.from, -1);
  const from = addDays(to, -(span - 1));
  return { from, to };
}

export function priorLabel(key: PeriodKey | "custom"): string {
  switch (key) {
    case "day":
      return "prior day";
    case "yesterday":
      return "prior day";
    case "week":
      return "prior week";
    case "month":
      return "prior month window";
    case "all":
      return "prior window";
    case "custom":
      return "prior period";
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

export interface PeriodElements {
  root: HTMLElement;
  rangeMeta: HTMLElement;
  fromInput: HTMLInputElement;
  toInput: HTMLInputElement;
  compareBtn: HTMLButtonElement | null;
  compareNote: HTMLElement | null;
  periodButtons: NodeListOf<HTMLButtonElement>;
}

export function getPeriodElements(root: ParentNode): PeriodElements | null {
  const rangeMeta = root.querySelector<HTMLElement>("[data-period-meta]");
  const fromInput = root.querySelector<HTMLInputElement>("[data-period-from]");
  const toInput = root.querySelector<HTMLInputElement>("[data-period-to]");
  if (!rangeMeta || !fromInput || !toInput) return null;

  const host = rangeMeta.closest(".period") as HTMLElement | null;
  if (!host) return null;

  return {
    root: host,
    rangeMeta,
    fromInput,
    toInput,
    compareBtn: root.querySelector<HTMLButtonElement>("[data-compare]"),
    compareNote: root.querySelector<HTMLElement>("[data-compare-note]"),
    periodButtons: root.querySelectorAll<HTMLButtonElement>("[data-period]"),
  };
}

export function bindPeriodControls(
  elements: PeriodElements,
  bounds: PeriodBounds,
  onChange: (state: PeriodState) => void,
): () => PeriodState {
  let state: PeriodState = {
    key: "month",
    range: rangeForPeriod("month", bounds),
    compare: false,
  };

  function applyUi() {
    elements.rangeMeta.textContent = formatPeriodLabel(
      state.range.from,
      state.range.to,
    );
    elements.fromInput.value = state.range.from;
    elements.toInput.value = state.range.to;
    elements.periodButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.period === state.key));
    });
    if (elements.compareBtn) {
      elements.compareBtn.setAttribute("aria-pressed", String(state.compare));
    }
    if (elements.compareNote) {
      elements.compareNote.hidden = !state.compare;
    }
    document.querySelectorAll<HTMLElement>("[data-delta]").forEach((el) => {
      el.style.visibility = state.compare ? "visible" : "hidden";
    });
  }

  function emit() {
    applyUi();
    onChange(state);
  }

  elements.periodButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.period as PeriodKey | undefined;
      if (!key) return;
      state = {
        ...state,
        key,
        range: rangeForPeriod(key, bounds),
      };
      emit();
    });
  });

  elements.compareBtn?.addEventListener("click", () => {
    state = { ...state, compare: !state.compare };
    emit();
  });

  const onDateInput = () => {
    const from = elements.fromInput.value;
    const to = elements.toInput.value;
    if (!from || !to || from > to) return;
    state = { key: "custom", range: { from, to }, compare: state.compare };
    elements.periodButtons.forEach((btn) => btn.setAttribute("aria-pressed", "false"));
    emit();
  };

  elements.fromInput.addEventListener("change", onDateInput);
  elements.toInput.addEventListener("change", onDateInput);

  applyUi();
  onChange(state);
  return () => state;
}

export { priorRange as getPriorRange };
