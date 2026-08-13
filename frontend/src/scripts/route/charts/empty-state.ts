export const ANATOMY_EMPTY_NOTE =
  "No trip-update delay data for this period.";

export function renderAnatomyEmptyState(root: HTMLElement, className: string): void {
  root.className = className;
  root.innerHTML = `<p class="rt-stub-note">${ANATOMY_EMPTY_NOTE}</p>`;
}
