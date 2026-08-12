import type { NetworkDailyPoint } from "../../../lib/types";

export function renderCancellationsSparkline(
  root: HTMLElement,
  series: NetworkDailyPoint[],
): void {
  if (series.length === 0) {
    root.innerHTML = `<p class="period-meta">No cancellation data in this period.</p>`;
    return;
  }

  const vals = series.map((p) =>
    p.cancellations_rate === null ? 0 : p.cancellations_rate * 100,
  );
  const w = 280;
  const h = 56;
  const max = Math.max(...vals, 0.1);
  const pts = vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * (w - 4) + 2;
      const y = h - 4 - (v / max) * (h - 10);
      return `${x},${y}`;
    })
    .join(" ");

  const spikes = vals
    .map((v, i) => ({ v, i }))
    .filter((entry) => entry.v >= max * 0.85)
    .map((entry) => entry.i + 1);

  const spikeNote =
    spikes.length > 0
      ? ` · spikes on day${spikes.length > 1 ? "s" : ""} ${spikes.join(", ")}`
      : "";

  root.innerHTML = `
    <svg class="spark" viewBox="0 0 ${w} ${h}" width="100%" height="56" role="img" aria-label="Cancellation rate sparkline">
      <polyline fill="none" stroke="#b86a00" stroke-width="2" points="${pts}" />
    </svg>
    <p class="period-meta" style="margin:0.35rem 0 0">Daily network cancellation %${spikeNote}</p>`;
}
