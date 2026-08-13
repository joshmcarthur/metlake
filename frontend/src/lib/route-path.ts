/** Prerendered shell served for routes not built at compile time. */
export const ROUTE_SHELL_ID = "__any__";

const ROUTE_PATH_RE = /^\/routes\/([^/]+)\/?$/;

/** Extract route id from `/routes/{id}/`. */
export function parseRouteFromPathname(pathname = window.location.pathname): string | null {
  const match = pathname.match(ROUTE_PATH_RE);
  return match?.[1] ?? null;
}

/** Prefer the URL path; fall back to SSR data attributes on the shell page. */
export function routeIdFromDocument(root: HTMLElement): string {
  const fromPath = parseRouteFromPathname();
  if (fromPath && fromPath !== ROUTE_SHELL_ID) {
    return decodeURIComponent(fromPath);
  }

  const fromData = root.dataset.route ?? "";
  if (fromData && fromData !== ROUTE_SHELL_ID) {
    return fromData;
  }

  return fromPath && fromPath !== ROUTE_SHELL_ID ? decodeURIComponent(fromPath) : fromData;
}
