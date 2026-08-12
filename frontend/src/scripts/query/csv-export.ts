import { rowsToCsv } from "../../lib/csv";
import type { QueryResult } from "./runner";

export function bindCsvDownload(
  button: HTMLButtonElement,
  getResult: () => QueryResult | null,
): void {
  button.addEventListener("click", () => {
    const result = getResult();
    if (!result || result.rows.length === 0) return;

    const csv = rowsToCsv(result.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "query-result.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}
