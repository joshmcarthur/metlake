import { fetchRoutePerformanceManifest } from "../../lib/manifest";
import { getRouteCatalog } from "../../lib/performance";
import { parseRouteFromPathname } from "../../lib/route-path";
import { getLastRoute, setLastRoute } from "../../lib/route-memory";
import { RoutePerformanceSession } from "../../lib/session";
import type { RouteCatalogEntry } from "../../lib/types";

const MAX_RESULTS = 12;

function endOfMonthIso(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNum, 0));
  return last.toISOString().slice(0, 10);
}

function labelFor(entry: RouteCatalogEntry): string {
  const id = entry.route_short_name ?? entry.route;
  const name = entry.route_long_name?.trim();
  return name ? `${id} · ${name}` : id;
}

function filterRoutes(routes: readonly RouteCatalogEntry[], query: string): RouteCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return routes.slice(0, MAX_RESULTS);
  return routes
    .filter((entry) => {
      const id = (entry.route_short_name ?? entry.route).toLowerCase();
      const name = (entry.route_long_name ?? "").toLowerCase();
      return id.includes(q) || name.includes(q) || entry.route.toLowerCase().includes(q);
    })
    .slice(0, MAX_RESULTS);
}

function navigateToRoute(route: string): void {
  setLastRoute(route);
  const target = `/routes/${encodeURIComponent(route)}/`;
  if (window.location.pathname === target) return;
  window.location.assign(target);
}

export async function initRoutePicker(root: HTMLElement): Promise<void> {
  const inputEl = root.querySelector<HTMLInputElement>("[data-route-input]");
  const listEl = root.querySelector<HTMLElement>("[data-route-list]");
  if (!inputEl || !listEl) return;
  const input = inputEl;
  const list = listEl;

  const pathRoute = parseRouteFromPathname();
  const remembered = getLastRoute();
  const current = pathRoute ?? remembered;
  if (pathRoute) setLastRoute(pathRoute);
  if (current) {
    input.value = current;
    input.placeholder = current;
  }

  let routes: RouteCatalogEntry[] = [];
  let activeIndex = -1;
  let open = false;

  const session = new RoutePerformanceSession();

  function closeList(): void {
    open = false;
    list.hidden = true;
    list.replaceChildren();
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function renderList(matches: RouteCatalogEntry[]): void {
    list.replaceChildren();
    if (matches.length === 0) {
      const empty = document.createElement("li");
      empty.className = "nav-route-empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "No matching routes";
      list.append(empty);
      list.hidden = false;
      open = true;
      input.setAttribute("aria-expanded", "true");
      return;
    }

    matches.forEach((entry, index) => {
      const id = entry.route_short_name ?? entry.route;
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.id = `nav-route-opt-${index}`;
      item.dataset.route = id;
      item.setAttribute("aria-selected", String(index === activeIndex));
      item.textContent = labelFor(entry);
      list.append(item);
    });
    list.hidden = false;
    open = true;
    input.setAttribute("aria-expanded", "true");
  }

  function refreshList(): void {
    const matches = filterRoutes(routes, input.value);
    if (activeIndex >= matches.length) activeIndex = matches.length - 1;
    renderList(matches);
  }

  try {
    const manifest = await fetchRoutePerformanceManifest();
    session.primeManifest(manifest);
    const latest = manifest.months[manifest.months.length - 1];
    if (!latest) throw new Error("No route-performance months published.");
    const conn = await session.ensure({
      from: `${latest}-01`,
      to: endOfMonthIso(latest),
    });
    routes = await getRouteCatalog(conn);
  } catch (error) {
    console.error(error);
    input.placeholder = "Routes unavailable";
    input.disabled = true;
    return;
  }

  input.addEventListener("focus", () => {
    refreshList();
  });

  input.addEventListener("input", () => {
    activeIndex = 0;
    refreshList();
  });

  input.addEventListener("keydown", (event) => {
    const matches = filterRoutes(routes, input.value);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) refreshList();
      activeIndex = Math.min(activeIndex + 1, matches.length - 1);
      renderList(matches);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList(matches);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = matches[activeIndex] ?? matches[0];
      if (pick) navigateToRoute(pick.route_short_name ?? pick.route);
    } else if (event.key === "Escape") {
      closeList();
      input.blur();
    }
  });

  list.addEventListener("mousedown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-route]");
    if (!target?.dataset.route) return;
    event.preventDefault();
    navigateToRoute(target.dataset.route);
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) closeList();
  });

  window.addEventListener("pagehide", () => {
    void session.close();
  });
}

/** Wire Overview / scorecard deep-dive CTAs to the remembered route. */
export function wireDeepDiveLinks(selector = "[data-deep-link]"): void {
  const route = getLastRoute() ?? parseRouteFromPathname();
  document.querySelectorAll<HTMLAnchorElement>(selector).forEach((link) => {
    if (!route) {
      link.hidden = true;
      return;
    }
    link.hidden = false;
    link.href = `/routes/${encodeURIComponent(route)}/deep/`;
    link.textContent = `Open route ${route} deep dive`;
  });
}
