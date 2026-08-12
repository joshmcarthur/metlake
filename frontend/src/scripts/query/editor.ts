import { ROUTE_PERFORMANCE_BASE } from "../../lib/types";
import { parquetUrlForMonth } from "../../lib/manifest";
import { DEFAULT_ROUTE } from "../../lib/site";

export function buildSampleSql(month: string, from: string, to: string, route = DEFAULT_ROUTE): string {
  const safeRoute = route.replace(/'/g, "''");
  // Prefer the registered `route_performance` view — DuckDB-WASM cannot
  // `read_parquet('/data/...')` as a bare path (local VFS, not HTTP).
  void month;
  return `SELECT
  day,
  route,
  route_long_name,
  punctuality,
  reliability,
  cancellations_rate
FROM route_performance
WHERE day BETWEEN DATE '${from}' AND DATE '${to}'
  AND route = '${safeRoute}'
ORDER BY day;`;
}

export function getDefaultSampleSql(
  months: readonly string[],
  updatedAt: string,
  route = DEFAULT_ROUTE,
): string {
  const latestMonth = months[months.length - 1] ?? updatedAt.slice(0, 7);
  const from = `${latestMonth}-01`;
  const to = updatedAt.slice(0, 10);
  return buildSampleSql(latestMonth, from, to, route);
}

export function bindSqlEditor(
  textarea: HTMLTextAreaElement,
  resetButton: HTMLButtonElement | null,
  sampleSql: string,
): void {
  resetButton?.addEventListener("click", () => {
    textarea.value = sampleSql;
  });
}

export function renderFileLinks(months: readonly string[], container: HTMLElement): void {
  const latestMonth = months[months.length - 1];
  const monthLinks = months
    .slice()
    .reverse()
    .map(
      (month) =>
        `<li><a href="${parquetUrlForMonth(month)}">${ROUTE_PERFORMANCE_BASE}/${month}.parquet</a></li>`,
    )
    .join("");

  container.innerHTML = `
    ${monthLinks}
    <li><a href="${ROUTE_PERFORMANCE_BASE}/_manifest.json">${ROUTE_PERFORMANCE_BASE}/_manifest.json</a></li>
    <li><a href="/data/curated/performance/daily/">/data/curated/performance/daily/</a></li>
    <li><a href="/data/curated/performance/monthly/">/data/curated/performance/monthly/</a></li>`;

  if (latestMonth) {
    const note = container.closest(".result-panel")?.querySelector<HTMLElement>("[data-files-note]");
    if (note) {
      note.textContent = `Latest month: ${latestMonth}. Paths match /data/ archive layout.`;
    }
  }
}
