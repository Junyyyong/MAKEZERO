/**
 * Checks that a drag selects exactly the tiles the finger crossed.
 *
 * Unit tests cannot catch this: the drag is built from pointer events, and how
 * many of them a browser emits depends on how fast the pointer moves. The bug
 * this guards against was invisible in code review and obvious in the hand —
 * a quick sweep reported two points, so every tile between them was skipped,
 * and because a selection is only punished for going *over* ten, the skipped
 * tiles vanished silently. The game looked like it was picking out the tiles
 * that happen to add up to ten.
 *
 *   npm run preview   then   node tests/browser/drag.mjs
 */
const BASE = process.env.MAKEZERO_URL ?? "http://localhost:4173/";
const CHROME = process.env.CHROME_PATH ?? undefined;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed.\n" +
      "  npm i -D playwright && npx playwright install chromium\n" +
      "then start a server (npm run preview) and run this again.",
  );
  process.exit(1);
}
try {
  await fetch(BASE);
} catch {
  console.error(`nothing is serving ${BASE} — run \`npm run preview\` first.`);
  process.exit(1);
}

const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; };
const ok = (m) => console.log("ok - " + m);

const PROGRESS = {
  stage: 1, bestStory: 0, bestTimeAttack: 0, bestEndless: 0,
  seenChapters: ["opening"], collected: [], bestTimes: [], tutorialDone: true,
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/** Walks from the title screen into a run. Both modes go through a start screen. */
async function startRun(id) {
  await page.click(`#${id}`);
  await page.waitForTimeout(300);
  await page.click("#btn-intro-start");
  await page.waitForTimeout(420);
}

/** Back out of a run to the title. */
async function backToTitle() {
  await page.click("#btn-back");
  await page.waitForTimeout(320);
}

/**
 * Opens a run and returns the centre of every tile in the first row.
 *
 * Time attack, because it deals a full nine-by-nine deck. Endless starts
 * sparse, so its first row has gaps and none of the sweeps below would mean
 * anything.
 */
async function openStory() {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((p) => localStorage.setItem("makezero.progress.v1", JSON.stringify(p)), PROGRESS);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await startRun("mode-timeAttack");
  return page.evaluate(() => {
    const cols = Number(document.getElementById("board").dataset.cols);
    return [...document.querySelectorAll("#board .tile")].slice(0, cols).map((tile) => {
      const box = tile.getBoundingClientRect();
      return { value: Number(tile.textContent), x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
  });
}

/**
 * What the rules say a sweep across these tiles must do: take them in order
 * until the total reaches ten (they clear) or passes it (the whole selection
 * is thrown away). Nothing about that depends on how fast the finger moved.
 */
function expected(row) {
  let sum = 0;
  const taken = [];
  for (const tile of row) {
    taken.push(tile.value);
    sum += tile.value;
    if (sum === 10) return { outcome: "cleared", taken };
    // Over ten is dead, and so is five blocks that have not reached it: there
    // is no sixth to come, so the selection can never add up.
    if (sum > 10 || taken.length >= 5) return { outcome: "rejected", taken };
  }
  return { outcome: "held", taken };
}

async function state() {
  return page.evaluate(() => ({
    selected: [...document.querySelectorAll("#board .tile.sel")].map((t) => Number(t.textContent)),
    cleared: [...document.querySelectorAll("#board .tile.cleared")].length,
    // Story shows no score any more, so a clear is read off the board: a
    // fresh board has nothing cleared, so any cleared square means it landed.
    reveal: document.getElementById("stat-a-value").textContent,
    scrolled: window.scrollY !== 0 || document.documentElement.scrollTop !== 0,
    overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
}

/** Sweeps the whole row in `steps` pointer moves. One step is a fast flick. */
async function sweep(steps) {
  const row = await openStory();
  const want = expected(row);
  await page.mouse.move(row[0].x, row[0].y);
  await page.mouse.down();
  await page.mouse.move(row.at(-1).x, row.at(-1).y, { steps });
  const got = await state();
  await page.mouse.up();

  const label = `${String(steps).padStart(2)} moves · ${row.map((t) => t.value).join(" ")}`;
  const outcome =
    got.cleared > 0 ? "cleared" : got.selected.length > 0 ? "held" : "rejected";
  if (outcome !== want.outcome) {
    fail(`${label}: ${want.taken.join("+")} should be ${want.outcome}, got ${outcome}`);
    return null;
  }
  if (want.outcome === "cleared" && got.cleared !== want.taken.length) {
    fail(`${label}: ${want.taken.length} blocks should clear, ${got.cleared} did`);
    return null;
  }
  if (want.outcome === "held" && got.selected.join() !== want.taken.join()) {
    fail(`${label}: expected ${want.taken.join()} selected, got ${got.selected.join()}`);
    return null;
  }
  ok(`${label} → ${want.outcome}`);
  return got;
}

// One move event is what a real flick across the board produces. It has to
// land on the same answer as a slow drag over the same tiles.
for (const steps of [1, 1, 2, 5, 40]) {
  const got = await sweep(steps);
  if (got && (got.scrolled || got.overflow > 1)) {
    fail(`${steps} moves: the page scrolled during the drag (${got.overflow}px)`);
  }
}

// Five blocks that do not add up cannot be rescued by a sixth, so the board
// must say no there and then rather than leaving the selection sitting.
{
  await openStory();
  const picked = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("#board .tile")];
    // The five smallest blocks on the board: if anything adds to less than
    // ten in five picks, they do.
    const chosen = tiles
      .sort((a, b) => Number(a.textContent) - Number(b.textContent))
      .slice(0, 5);
    const sum = chosen.reduce((t, tile) => t + Number(tile.textContent), 0);
    if (chosen.length < 5 || sum >= 10) return null;
    return { sum, points: chosen.map((t) => { const b = t.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }) };
  });
  if (!picked) {
    ok("skipped — no five blocks on this board add to less than ten");
  } else {
    for (const point of picked.points) {
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(120);
    const after = await state();
    if (after.selected.length !== 0) {
      fail(`five blocks summing ${picked.sum}: selection still held (${after.selected.join()})`);
    } else if (after.cleared !== 0) {
      fail(`five blocks summing ${picked.sum}: blocks cleared when they should not have`);
    } else {
      ok(`five blocks summing ${picked.sum} — refused at once and the selection let go`);
    }
  }
}

// A drag that starts just off the board must not pan the page either.
{
  await openStory();
  const wrap = await page.evaluate(() => {
    const b = document.getElementById("board-wrap").getBoundingClientRect();
    return { x: b.left + 3, y: b.top + b.height / 2 };
  });
  await page.mouse.move(wrap.x, wrap.y);
  await page.mouse.down();
  await page.mouse.move(wrap.x, wrap.y - 260, { steps: 12 });
  const got = await state();
  await page.mouse.up();
  if (got.scrolled || got.overflow > 1) fail(`a drag started outside the board moved the page`);
  else ok("a drag started outside the board does not move the page");
}

// Every mode draws its board in the same place, at the same size.
{
  // The checks above leave the page mid-game; the mode list is on the title.
  await backToTitle();
  const seen = [];
  for (const [name, id] of [["time attack", "mode-timeAttack"], ["endless", "mode-endless"]]) {
    await startRun(id);
    seen.push([name, await page.evaluate(() => {
      const board = document.getElementById("board").getBoundingClientRect();
      const tile = document.querySelector("#board .tile").getBoundingClientRect();
      return { left: Math.round(board.left), top: Math.round(board.top), tile: Math.round(tile.width) };
    })]);
    await backToTitle();
  }
  const [, first] = seen[0];
  for (const [name, m] of seen.slice(1)) {
    for (const key of ["left", "top", "tile"]) {
      if (Math.abs(m[key] - first[key]) > 1) {
        fail(`${name}: board ${key} differs by ${Math.abs(m[key] - first[key])}px`);
      }
    }
  }
  ok(`every mode draws the board in the same place, same tile size (${first.left}px margin, ${first.tile}px tiles)`);
}

if (errors.length) {
  for (const e of errors) fail(`page error: ${e}`);
} else {
  ok("no page errors while dragging");
}

await browser.close();
