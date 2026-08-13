import {
  fetchRoutePerformanceManifest,
  fetchRtRoutePerformanceManifest,
  requireRoutePerformanceSource,
} from "../../lib/manifest";
import { getRouteCatalog } from "../../lib/performance";
import { parseRouteFromPathname } from "../../lib/route-path";
import { filterRoutes, groupRoutes, routeCode } from "../../lib/route-mode";
import { RoutePerformanceSession } from "../../lib/session";
import type { RouteCatalogEntry } from "../../lib/types";

function navigateToRoute(route: string): void {
  const target = `/routes/${encodeURIComponent(route)}/`;
  if (window.location.pathname === target) return;
  window.location.assign(target);
}

function setCatalogMessage(catalog: HTMLElement, message: string): void {
  catalog.replaceChildren();
  const p = document.createElement("p");
  p.className = "route-dialog-status";
  p.textContent = message;
  catalog.append(p);
}

function renderCatalog(
  catalog: HTMLElement,
  routes: readonly RouteCatalogEntry[],
  query: string,
  currentRoute: string | null,
): void {
  const matches = filterRoutes(routes, query);
  const sections = groupRoutes(matches);
  catalog.replaceChildren();

  if (sections.length === 0) {
    setCatalogMessage(catalog, "No matching routes");
    return;
  }

  for (const section of sections) {
    const heading = document.createElement("h3");
    heading.className = "route-dialog-group";
    heading.textContent = section.group;
    catalog.append(heading);

    const list = document.createElement("ul");
    list.className = "route-dialog-list";
    for (const entry of section.routes) {
      const id = routeCode(entry);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-dialog-row";
      button.dataset.route = id;
      if (currentRoute && (id === currentRoute || entry.route === currentRoute)) {
        button.setAttribute("aria-current", "true");
      }

      const mode = document.createElement("span");
      mode.className = "route-dialog-mode";
      mode.textContent = section.group;

      const code = document.createElement("span");
      code.className = "route-dialog-code";
      code.textContent = id;

      const name = document.createElement("span");
      name.className = "route-dialog-name";
      name.textContent = entry.route_long_name?.trim() || id;

      button.append(mode, code, name);
      item.append(button);
      list.append(item);
    }
    catalog.append(list);
  }
}

export async function initRoutePicker(root: HTMLElement): Promise<void> {
  const openBtn = root.querySelector<HTMLButtonElement>("[data-route-open]");
  const dialog = root.querySelector<HTMLDialogElement>("[data-route-dialog]");
  const closeBtn = root.querySelector<HTMLButtonElement>("[data-route-close]");
  const search = root.querySelector<HTMLInputElement>("[data-route-search]");
  const catalog = root.querySelector<HTMLElement>("[data-route-catalog]");
  if (!openBtn || !dialog || !closeBtn || !search || !catalog) return;

  const trigger = openBtn;
  const picker = dialog;
  const searchInput = search;
  const catalogEl = catalog;

  const currentRoute = parseRouteFromPathname();
  trigger.setAttribute("aria-label", "Select a route");

  let routes: RouteCatalogEntry[] = [];
  let loaded = false;
  let failed = false;
  let loading = false;

  const session = new RoutePerformanceSession();

  function paint(): void {
    if (failed) {
      setCatalogMessage(catalogEl, "Routes unavailable");
      return;
    }
    if (!loaded) {
      setCatalogMessage(catalogEl, "Loading routes…");
      return;
    }
    renderCatalog(catalogEl, routes, searchInput.value, currentRoute);
  }

  async function ensureCatalog(): Promise<void> {
    if (loaded || failed || loading) return;
    loading = true;
    paint();
    try {
      const manifest = await fetchRoutePerformanceManifest();
      const rtManifest = await fetchRtRoutePerformanceManifest();
      requireRoutePerformanceSource(manifest, rtManifest);
      session.primeManifest(manifest);
      session.primeRtManifest(rtManifest);
      const conn = await session.ensureAllMonths();
      routes = await getRouteCatalog(conn);
      loaded = true;
    } catch (error) {
      console.error(error);
      failed = true;
      trigger.disabled = true;
      trigger.textContent = "Routes unavailable";
      trigger.setAttribute("aria-label", "Routes unavailable");
      if (picker.open) picker.close();
    } finally {
      loading = false;
      paint();
    }
  }

  trigger.addEventListener("click", () => {
    if (trigger.disabled) return;
    paint();
    picker.showModal();
    searchInput.focus();
    void ensureCatalog();
  });

  closeBtn.addEventListener("click", () => {
    picker.close();
  });

  picker.addEventListener("click", (event) => {
    if (event.target === picker) picker.close();
  });

  searchInput.addEventListener("input", () => {
    if (!loaded || failed) return;
    renderCatalog(catalogEl, routes, searchInput.value, currentRoute);
  });

  catalogEl.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-route]");
    if (!target?.dataset.route) return;
    navigateToRoute(target.dataset.route);
  });

  window.addEventListener("pagehide", () => {
    void session.close();
  });
}
