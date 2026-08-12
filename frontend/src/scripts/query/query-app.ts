import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import { RoutePerformanceSession } from "../../lib/performance";
import { isArchiveError } from "../../lib/types";
import { bindCsvDownload } from "./csv-export";
import {
  bindSqlEditor,
  getDefaultSampleSql,
  renderFileLinks,
} from "./editor";
import { runUserQuery, renderResultTable, type QueryResult } from "./runner";

let session: RoutePerformanceSession | null = null;
let lastResult: QueryResult | null = null;

function showStatus(message: string, isError = false): void {
  const status = document.getElementById("query-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

export async function initQueryApp(): Promise<void> {
  const root = document.getElementById("query-root");
  if (!root) return;

  const textarea = root.querySelector<HTMLTextAreaElement>("#sql");
  const runButton = root.querySelector<HTMLButtonElement>("[data-run-sql]");
  const resetButton = root.querySelector<HTMLButtonElement>("[data-reset-sql]");
  const csvButton = root.querySelector<HTMLButtonElement>("[data-download-csv]");
  const table = root.querySelector<HTMLTableElement>("#result-table");
  const fileLinks = root.querySelector<HTMLElement>("[data-file-links]");

  if (!textarea || !runButton || !table) return;

  session = new RoutePerformanceSession();
  window.addEventListener("pagehide", () => {
    void session?.close();
  });

  try {
    const manifest = await fetchRoutePerformanceManifest();
    session.primeManifest(manifest);

    const sampleSql = getDefaultSampleSql(manifest.months, manifest.updated_at);
    textarea.value = sampleSql;
    bindSqlEditor(textarea, resetButton, sampleSql);

    if (fileLinks) renderFileLinks(manifest.months, fileLinks);

    runButton.disabled = false;
    resetButton?.removeAttribute("disabled");
    csvButton?.removeAttribute("disabled");

    if (csvButton) {
      bindCsvDownload(csvButton, () => lastResult);
    }

    runButton.addEventListener("click", async () => {
      try {
        runButton.disabled = true;
        showStatus("Running…");
        const conn = await session!.ensureAllMonths();
        lastResult = await runUserQuery(conn, textarea.value);
        renderResultTable(table, lastResult);
        showStatus(`${lastResult.rows.length.toLocaleString("en-NZ")} row(s) returned.`);
      } catch (error) {
        lastResult = null;
        renderResultTable(table, { columns: [], rows: [] });
        const message =
          isArchiveError(error) || error instanceof Error
            ? error.message
            : "Query failed.";
        showStatus(message, true);
      } finally {
        runButton.disabled = false;
      }
    });
  } catch (error) {
    const message =
      isArchiveError(error) || error instanceof Error
        ? error.message
        : "Could not load the performance archive.";
    showStatus(message, true);
    textarea.value = "-- Archive manifest not available";
  }
}

initQueryApp();
