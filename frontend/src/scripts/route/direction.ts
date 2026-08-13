export type Direction = "inbound" | "outbound";

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
