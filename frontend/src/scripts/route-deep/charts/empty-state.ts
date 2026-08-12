export const RT_DERIVE_NOTE =
  "Needs RT derives — trip-update aggregates are not published yet.";

export function renderRtEmptyState(root: HTMLElement, className: string): void {
  root.className = className;
  root.innerHTML = `<p class="rt-stub-note">${RT_DERIVE_NOTE}</p>`;
}
