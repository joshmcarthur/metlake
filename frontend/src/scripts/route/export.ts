import { parquetUrlForMonth } from "../../lib/manifest";
import { rowsToCsv } from "../../lib/csv";

export function updateParquetLink(month: string): void {
  const link = document.querySelector<HTMLAnchorElement>("[data-parquet-link]");
  if (!link) return;
  const url = parquetUrlForMonth(month);
  link.href = url;
  link.textContent = `Parquet · ${month}`;
}

export function bindCsvExport(
  button: HTMLButtonElement,
  fetchRows: () => Promise<Record<string, unknown>[]>,
  filenameBase: string,
): void {
  button.disabled = false;
  button.addEventListener("click", async () => {
    try {
      button.disabled = true;
      const rows = await fetchRows();
      if (rows.length === 0) return;
      const csv = rowsToCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filenameBase}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      button.disabled = false;
    }
  });
}
