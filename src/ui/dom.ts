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

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
