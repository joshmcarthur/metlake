import { ROUTE_PERFORMANCE_BASE } from "../../lib/types";
import { parquetUrlForMonth } from "../../lib/manifest";

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
