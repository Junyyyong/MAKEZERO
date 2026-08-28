/** Looks up an element that the markup is expected to contain. */
export function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

/** "★★☆" for two of three. */
export function starLine(earned: number): string {
  return "★★★".slice(0, earned) + "☆☆☆".slice(0, 3 - earned);
}

/** "01:32". Both halves padded, so a running clock never changes width. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
