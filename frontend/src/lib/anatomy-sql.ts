function rangeClause(from: string, to: string): string {
  return `day >= DATE '${from}' AND day <= DATE '${to}'`;
}

function safeRoute(route: string): string {
  return route.replace(/'/g, "''");
}

export function sharedChokePointsSql(from: string, to: string): string {
  return `
SELECT
  from_stop_id,
  to_stop_id,
  any_value(from_stop_name) AS from_stop_name,
  any_value(to_stop_name) AS to_stop_name,
  AVG(mean_delay_added_seconds) AS delay_added,
  SUM(n_trips) AS n_trips,
  COUNT(DISTINCT route) AS n_routes
FROM delay_injectors
WHERE ${rangeClause(from, to)}
GROUP BY from_stop_id, to_stop_id
HAVING COUNT(DISTINCT route) >= 2 AND SUM(n_trips) >= 5
ORDER BY delay_added DESC
LIMIT 8;
`;
}

export function networkHourHeatSql(from: string, to: string): string {
  return `
SELECT
  isodow(day)::INTEGER AS weekday,
  hour,
  MEDIAN(median_delay_seconds) AS delay_seconds
FROM hour_heat
WHERE ${rangeClause(from, to)}
GROUP BY weekday, hour
ORDER BY weekday, hour;
`;
}

export function routeStopProfileSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  stop_id,
  any_value(stop_name) AS stop_name,
  any_value(stop_sequence) AS stop_sequence,
  AVG(mean_delay_seconds) AS mean_delay_seconds,
  MEDIAN(median_delay_seconds) AS median_delay_seconds
FROM stop_profile
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY stop_id
ORDER BY stop_sequence NULLS LAST;
`;
}

export function routeInjectorsSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  from_stop_id,
  to_stop_id,
  any_value(from_stop_name) AS from_stop_name,
  any_value(to_stop_name) AS to_stop_name,
  AVG(mean_delay_added_seconds) AS delay_added,
  SUM(n_trips) AS n_trips
FROM delay_injectors
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY from_stop_id, to_stop_id
ORDER BY delay_added DESC
LIMIT 8;
`;
}

export function routeHourHeatSql(
  route: string,
  from: string,
  to: string,
  directionId: number,
): string {
  const r = safeRoute(route);
  return `
SELECT
  isodow(day)::INTEGER AS weekday,
  hour,
  MEDIAN(median_delay_seconds) AS delay_seconds
FROM hour_heat
WHERE ${rangeClause(from, to)}
  AND (route = '${r}' OR CAST(route_id AS VARCHAR) = '${r}')
  AND direction_id = ${directionId}
GROUP BY weekday, hour
ORDER BY weekday, hour;
`;
}
