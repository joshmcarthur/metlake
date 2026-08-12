export type Direction = "inbound" | "outbound";

export interface DirectionHero {
  title: string;
  description: string;
}

function routePath(routeName: string, direction: Direction): string {
  const parts = routeName
    .split(" — ")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const ordered = direction === "outbound" ? [...parts].reverse() : parts;
  return ordered.join(" → ");
}

export function heroForDirection(
  routeId: string,
  routeName: string,
  direction: Direction,
): DirectionHero {
  const path = routeName ? routePath(routeName, direction) : "";
  return {
    title: `${routeId} · ${direction}`,
    description: path ? `${path} · where delay forms` : "Where delay forms along the trip",
  };
}

export function bindDirectionToggle(
  root: HTMLElement,
  onChange: (direction: Direction) => void,
): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-direction]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction;
      if (direction !== "inbound" && direction !== "outbound") return;

      for (const chip of buttons) {
        chip.setAttribute("aria-pressed", String(chip === button));
      }

      onChange(direction);
    });
  }
}
