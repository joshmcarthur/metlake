import type { DuckDbConnection } from "../../lib/duckdb";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

function isNumeric(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export async function runUserQuery(conn: DuckDbConnection, sql: string): Promise<QueryResult> {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("Enter a SQL query to run.");
  }

  const result = await conn.query(trimmed);
  const rows = result.toArray();
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { columns, rows };
}

export function renderResultTable(
  table: HTMLTableElement,
  result: QueryResult,
): void {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  thead.replaceChildren();
  tbody.replaceChildren();

  if (result.columns.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = "No rows returned.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const headerRow = document.createElement("tr");
  for (const col of result.columns) {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  for (const row of result.rows) {
    const tr = document.createElement("tr");
    for (const col of result.columns) {
      const td = document.createElement("td");
      const value = row[col];
      if (isNumeric(value)) {
        td.className = "num";
      }
      td.textContent = value === null || value === undefined ? "" : String(value);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}
