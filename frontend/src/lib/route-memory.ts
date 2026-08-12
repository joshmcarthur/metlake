/** Remember the last route chosen in the nav picker (this tab only). */
const STORAGE_KEY = "metlake.lastRoute";

export function getLastRoute(): string | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setLastRoute(route: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, route);
  } catch {
    // Ignore quota / private-mode failures.
  }
}
