/**
 * Keeps the app exactly as tall as the screen actually is.
 *
 * A phone browser's address bar slides in and out, and the CSS that sizes a
 * full-screen app does not always follow it. On iOS Safari a fixed element
 * pinned with `inset: 0` measures the viewport at its *tallest* — the height
 * it would have with the bar retracted — so the app ends up taller than what
 * is on screen: the bottom of the board sits under the browser chrome, and
 * anything centred is pushed down by half the difference.
 *
 * `100dvh` fixes that on its own from iOS 15.4. This covers everything older
 * and anything that measures differently again: `visualViewport.height` is
 * the visible area, measured rather than declared, and it is republished as
 * `--app-h` whenever it changes.
 */
export function trackViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;

  let last = 0;
  const apply = () => {
    // Pinch-zoom also shrinks the visual viewport, and shrinking the app to
    // match a zoomed-in view would be wrong — only follow it at rest.
    if (vv.scale > 1.01) return;
    const h = Math.round(vv.height);
    if (h === last) return;
    last = h;
    document.documentElement.style.setProperty("--app-h", `${h}px`);
    // The board sizes itself by measuring the room it has, and it re-measures
    // on `resize`. That never fires for a visual-viewport change on its own,
    // so the board would keep the tile size it had for a taller screen.
    window.dispatchEvent(new Event("resize"));
  };

  apply();
  vv.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => window.setTimeout(apply, 120));
}
