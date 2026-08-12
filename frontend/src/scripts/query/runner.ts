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

  if (result.columns.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = "<tr><td>No rows returned.</td></tr>";
    return;
  }

  thead.innerHTML = `<tr>${result.columns.map((col) => `<th>${col}</th>`).join("")}</tr>`;

  tbody.innerHTML = result.rows
    .map((row) => {
      const cells = result.columns
        .map((col) => {
          const value = row[col];
          const className = isNumeric(value) ? "num" : "";
          const text = value === null || value === undefined ? "" : String(value);
          return `<td class="${className}">${text}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
}
