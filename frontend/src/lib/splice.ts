function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInclusive(from: string, to: string): number {
  const start = parseIso(from).getTime();
  const end = parseIso(to).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function shouldFetchRtMonths(
  publishedDayCount: number,
  from: string,
  to: string,
): boolean {
  return publishedDayCount < daysInclusive(from, to);
}

export function splicedRoutePerformanceSql(
  hasPublished: boolean,
  hasRt: boolean,
): string {
  if (!hasPublished && !hasRt) {
    throw new Error("splicedRoutePerformanceSql requires at least one source");
  }
  if (hasPublished && hasRt) {
    return `
CREATE OR REPLACE VIEW route_performance AS
SELECT *, 'published' AS source
FROM route_performance_published
UNION ALL BY NAME
SELECT *
FROM route_performance_rt
WHERE day NOT IN (SELECT day FROM route_performance_published);
`;
  }
  if (hasRt) {
    return `
CREATE OR REPLACE VIEW route_performance AS
SELECT * FROM route_performance_rt;
`;
  }
  return `
CREATE OR REPLACE VIEW route_performance AS
SELECT *, 'published' AS source
FROM route_performance_published;
`;
}
