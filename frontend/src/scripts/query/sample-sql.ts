export function buildSampleSql(
  month: string,
  from: string,
  to: string,
  route?: string,
): string {
  const trimmed = route?.trim() ?? "";
  const routeFilter = trimmed
    ? `\n  AND route = '${trimmed.replace(/'/g, "''")}'`
    : "";
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
WHERE day BETWEEN DATE '${from}' AND DATE '${to}'${routeFilter}
ORDER BY day;`;
}

export function getDefaultSampleSql(
  months: readonly string[],
  updatedAt: string,
  route?: string,
): string {
  const latestMonth = months[months.length - 1] ?? updatedAt.slice(0, 7);
  const from = `${latestMonth}-01`;
  const to = updatedAt.slice(0, 10);
  return buildSampleSql(latestMonth, from, to, route);
}
