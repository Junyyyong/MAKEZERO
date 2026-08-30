/**
 * Checks the board actually fits the screen it is given.
 *
 * Unit tests cannot catch this: the board is sized by measuring the room it
 * has, so only a real browser at a real size can tell whether the tiles fit,
 * whether the frame hugs them, and whether a rotation refits or clips. Layout
 * is what breaks when the skin changes, which is why this is kept.
 *
 *   npm run dev  (or preview)  then  node tests/browser/responsive.mjs
 */
const BASE = process.env.MAKEZERO_URL ?? "http://localhost:4173/";
const CHROME = process.env.CHROME_PATH ?? undefined;

// Playwright is deliberately not a dependency — it is a large download that
// only matters when the layout is being touched. Say so plainly.
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

// Fails fast rather than timing out tile by tile if nothing is serving.
try {
  await fetch(BASE);
} catch {
  console.error(`nothing is serving ${BASE} — run \`npm run preview\` first.`);
  process.exit(1);
}
const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; };
const ok = (m) => console.log("ok - " + m);

// A spread of real devices, plus the extremes that break naive layouts.
const SCREENS = [
  ["iPhone SE", 375, 667],
  ["iPhone 13 mini", 375, 812],
  ["iPhone 15", 393, 852],
  ["iPhone 15 Pro Max", 430, 932],
  ["Galaxy S8 (tall)", 360, 740],
  ["Pixel 7", 412, 915],
  ["iPad mini", 744, 1133],
  ["short — browser bars", 390, 560],
  ["very short", 380, 430],
  ["landscape", 844, 390],
];

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];

/** Measures the board against the room it was given. */
async function inspect(page) {
  return page.evaluate(() => {
    const wrap = document.getElementById("board-wrap");
    const grid = document.getElementById("board");
    const tile = document.querySelector("#board .tile");
    const w = wrap.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    return {
      wrapW: w.width, wrapH: w.height,
      gridW: g.width, gridH: g.height,
      gridTop: g.top, gridBottom: g.bottom,
      wrapTop: w.top, wrapBottom: w.bottom,
      tile: tile ? tile.getBoundingClientRect().width : 0,
      atFloor: tile ? tile.getBoundingClientRect().width <= 16.5 : false,
      cols: Number(grid.dataset.cols),
      scrolls: wrap.scrollHeight > wrap.clientHeight + 1,
      docOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // The frame must hug the tiles, not stretch past them.
      frameSlackX: w.width - g.width,
    };
  });
}

async function check(page, label, mode) {
  const m = await inspect(page);
  const room = 1.5; // sub-pixel rounding

  // A board that cannot fit even at the smallest usable tile falls back to
  // scrolling rather than shrinking further. Only landscape reaches this, and
  // the Android build is locked to portrait.
  if (m.atFloor && m.scrolls) {
    ok(`${label} / ${mode}: too short to fit — scrolling, tiles at the floor`);
    return true;
  }
  if (m.gridBottom > m.wrapBottom + room || m.gridTop < m.wrapTop - room) {
    fail(`${label} / ${mode}: board is clipped (grid ${m.gridTop.toFixed(0)}-${m.gridBottom.toFixed(0)} vs frame ${m.wrapTop.toFixed(0)}-${m.wrapBottom.toFixed(0)})`);
    return false;
  }
  if (m.gridH > m.wrapH + room) {
    fail(`${label} / ${mode}: board taller than its room (${m.gridH.toFixed(0)} > ${m.wrapH.toFixed(0)})`);
    return false;
  }
  if (m.gridW > m.wrapW + room) {
    fail(`${label} / ${mode}: board wider than its room`);
    return false;
  }
  if (m.docOverflow > 1) {
    fail(`${label} / ${mode}: the page itself scrolls by ${m.docOverflow}px`);
    return false;
  }
  if (m.tile < 18) {
    fail(`${label} / ${mode}: tiles down to ${m.tile.toFixed(0)}px`);
    return false;
  }
  return true;
}

/** Walks from the title screen into a run. Both modes go through a start screen. */
async function startRun(page, id) {
  await page.click(`#${id}`);
  await page.waitForTimeout(260);
  await page.click("#btn-intro-start");
  await page.waitForTimeout(260);
}

/** Back out of a run to the title. */
async function backToTitle(page) {
  await page.click("#btn-back");
  await page.waitForTimeout(160);
}

const SKIP = { stage: 1, bestStory: 0, bestTimeAttack: 0, bestEndless: 0, seenChapters: [], collected: [], bestTimes: [], tutorialDone: true };

for (const [label, width, height] of SCREENS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`${label}: ${e}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((p) => localStorage.setItem("makezero.progress.v1", JSON.stringify(p)), SKIP);
  await page.reload({ waitUntil: "networkidle" });

  let good = true;
  for (const [mode, id] of [["time attack", "mode-timeAttack"], ["endless", "mode-endless"]]) {
    await startRun(page, id);
    if (!(await check(page, label, mode))) good = false;
    await backToTitle(page);
  }

  const m = await (async () => { await startRun(page, "mode-endless"); return inspect(page); })();
  if (good) ok(`${String(label).padEnd(20)} ${width}x${height}  tiles ${String(Math.round(m.tile)).padStart(3)}px  frame slack ${Math.round(m.frameSlackX)}px`);
  await page.close();
}

// Rotating mid-game must refit, not clip.
{
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`rotate: ${e}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((p) => localStorage.setItem("makezero.progress.v1", JSON.stringify(p)), SKIP);
  await page.reload({ waitUntil: "networkidle" });
  await startRun(page, "mode-endless");
  const before = (await inspect(page)).tile;

  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(300);
  if (await check(page, "rotation", "landscape")) {
    const after = (await inspect(page)).tile;
    ok(`rotating refits the board (${Math.round(before)}px -> ${Math.round(after)}px)`);
  }

  await page.setViewportSize({ width: 393, height: 852 });
  await page.waitForTimeout(300);
  if (await check(page, "rotation", "back to portrait")) ok("rotating back refits again");

  // The browser's bars sliding away is just the box getting taller.
  await page.setViewportSize({ width: 393, height: 620 });
  await page.waitForTimeout(300);
  if (await check(page, "browser bars", "shrunk")) ok("the board refits when the viewport shrinks");
  await page.close();
}

if (errors.length) fail("page errors: " + errors.join(" | "));
else ok("no page errors on any screen");
await browser.close();
