export type Direction = "left" | "down" | "up" | "right";

/** Focuses the nearest visible pane in a direction, leaving browser chrome alone. */
export function focusPane(direction: Direction, currentId: string): void {
  const panes = [...document.querySelectorAll<HTMLElement>("[data-keyboard-pane]")].filter((pane) => !pane.closest("[hidden]") && pane.getClientRects().length > 0);
  const current = panes.find((pane) => pane.dataset.keyboardPane === currentId);
  if (!current) {
    panes[0]?.focus();
    return;
  }
  const from = current.getBoundingClientRect();
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height / 2;
  const ranked = panes.filter((pane) => pane !== current).map((pane) => {
    const box = pane.getBoundingClientRect();
    const dx = box.x + box.width / 2 - fromX;
    const dy = box.y + box.height / 2 - fromY;
    return { pane, forward: sign * (horizontal ? dx : dy), distance: Math.hypot(dx, dy) };
  }).filter((entry) => entry.forward > 0).toSorted((a, b) => a.distance - b.distance);
  ranked[0]?.pane.focus();
}
