/**
 * Draws the wordmark as blocks, because the game is made of blocks.
 *
 * Each letter is a bitmap on a grid; every filled cell becomes a rounded
 * square with a lit top edge and a shaded bottom one, over a darker slab that
 * sticks out below and to the right. That slab is what makes it read as
 * stacked pieces rather than as a font with an outline.
 *
 *   node scripts/build-logo.mjs > public/logo.svg
 */
const GLYPHS = {
  T: ["#######", "#######", "..###..", "..###..", "..###..", "..###..", "..###.."],
  A: ["..###..", ".#####.", "##...##", "##...##", "#######", "##...##", "##...##"],
  P: ["######.", "##...##", "##...##", "######.", "##.....", "##.....", "##....."],
  E: ["#######", "##.....", "##.....", "#####..", "##.....", "##.....", "#######"],
  N: ["##...##", "###..##", "####.##", "##.####", "##..###", "##...##", "##...##"],
};
/** Lower case, five rows tall, sitting on the same baseline. */
const SMALL = {
  t: [".#..", ".#..", "###.", ".#..", ".#..", ".#..", ".##."],
  o: ["....", "....", ".##.", "#..#", "#..#", "#..#", ".##."],
};

const CELL = 22;
const GAP = 1.5;
const RADIUS = 4;
const DEPTH = 5;

function letter(rows, x, y, gradient) {
  const out = [];
  rows.forEach((row, r) => {
    [...row].forEach((mark, c) => {
      if (mark !== "#") return;
      const px = x + c * CELL;
      const py = y + r * CELL;
      const size = CELL - GAP;
      // The slab under the block: same square, pushed down and right.
      out.push(
        `<rect x="${(px + DEPTH).toFixed(1)}" y="${(py + DEPTH).toFixed(1)}" width="${size}" height="${size}" rx="${RADIUS}" fill="#2a1163"/>`,
      );
      out.push(
        `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${size}" height="${size}" rx="${RADIUS}" fill="url(#${gradient})" stroke="#2a1163" stroke-width="1.5"/>`,
      );
      // A lit top edge, so a block looks like a block and not a swatch.
      out.push(
        `<rect x="${(px + 3).toFixed(1)}" y="${(py + 2.5).toFixed(1)}" width="${size - 6}" height="${(size * 0.26).toFixed(1)}" rx="2" fill="#ffffff" opacity="0.26"/>`,
      );
    });
  });
  return out.join("\n    ");
}

function word(text, glyphs, x, y, gradient) {
  const parts = [];
  let cursor = x;
  for (const ch of text) {
    if (ch === " ") {
      cursor += CELL * 2;
      continue;
    }
    const rows = glyphs[ch];
    parts.push(letter(rows, cursor, y, gradient));
    cursor += (rows[0].length + 1) * CELL;
  }
  return { svg: parts.join("\n    "), width: cursor - x - CELL };
}

/** A four-pointed spark, the same one the reference scatters around. */
function spark(x, y, size, fill) {
  const a = size * 0.34;
  return (
    `<path d="M${x} ${y - size} L${x + a} ${y - a} L${x + size} ${y} L${x + a} ${y + a} ` +
    `L${x} ${y + size} L${x - a} ${y + a} L${x - size} ${y} L${x - a} ${y - a} Z" ` +
    `fill="${fill}" stroke="#2a1163" stroke-width="1.5" stroke-linejoin="round"/>`
  );
}

const PAD = 34;
const ROW_GAP = 16;

const top = word("TAP", GLYPHS, 0, 0, "cool");
const bottom = word("TEN", GLYPHS, 0, 0, "hot");
const widest = Math.max(top.width, bottom.width);

// Laid out on the extents rather than on guesses, so nothing falls outside
// the viewBox — a cropped wordmark is the one thing that would give it away.
const topX = PAD + (widest - top.width) / 2;
const bottomX = PAD + (widest - bottom.width) / 2;
const rowHeight = CELL * 7;
const topY = PAD;
const midY = topY + rowHeight + ROW_GAP;
const bottomY = midY + CELL * 7 + ROW_GAP;

const small = word("to", SMALL, 0, 0, "warm");
const midX = PAD + (widest - small.width) / 2;

const width = widest + PAD * 2;
const height = bottomY + rowHeight + DEPTH + PAD;

/* The scatter. Placed by hand at the edges, clear of the letters. */
const sparks = [
  spark(PAD * 0.55, topY + rowHeight * 0.45, 15, "url(#cool)"),
  spark(PAD * 0.8, bottomY + rowHeight * 0.2, 12, "url(#hot)"),
  spark(width - PAD * 0.5, topY + rowHeight * 0.55, 14, "url(#cool)"),
  spark(width - PAD * 0.7, bottomY + rowHeight * 0.75, 13, "url(#hot)"),
  spark(midX - CELL * 1.6, midY + CELL * 3.5, 11, "url(#warm)"),
  spark(midX + small.width + CELL * 1.4, midY + CELL * 3.5, 11, "url(#warm)"),
];

process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" role="img" aria-label="TAP to TEN">
  <defs>
    <linearGradient id="cool" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5ec9f5"/><stop offset="1" stop-color="#3d5be0"/>
    </linearGradient>
    <linearGradient id="hot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff5fd2"/><stop offset="1" stop-color="#8b3fe0"/>
    </linearGradient>
    <linearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffc635"/><stop offset="1" stop-color="#ff8a1f"/>
    </linearGradient>
  </defs>
  ${sparks.join("\n  ")}
  ${word("TAP", GLYPHS, topX, topY, "cool").svg}
  ${word("to", SMALL, midX, midY, "warm").svg}
  ${word("TEN", GLYPHS, bottomX, bottomY, "hot").svg}
</svg>
`);
