/**
 * Checks that the game actually makes a noise and buzzes the phone.
 *
 * Neither can be asserted from a unit test: the sounds are synthesised by the
 * browser's own audio hardware and the vibration is a device call. Both also
 * fail silently by nature — a broken sound is indistinguishable from a quiet
 * one — so the only way to know they still work is to count the calls in a
 * real browser.
 *
 *   npm run preview   then   node tests/browser/feedback.mjs
 */
const BASE = process.env.MAKEZERO_URL ?? "http://localhost:4173/";
const CHROME = process.env.CHROME_PATH ?? undefined;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed — see tests/browser/README.md");
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
  stage: 1, bestStory: 0, bestTimeAttack: 0, bestEndless: 0, bestEndlessMs: 0,
  seenChapters: ["opening"], collected: [], bestTimes: [], tutorialDone: true,
};

/*
 * Counts what the page asks the device for.
 *
 * `createOscillator` is every sound the game makes — nothing else in the app
 * creates one — and `navigator.vibrate` is every buzz. Both are wrapped
 * before any of the app's own code runs.
 */
const SPY = `
  window.__spy = { notes: 0, buzz: [] };
  navigator.vibrate = (p) => { window.__spy.buzz.push(p); return true; };
  const make = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () {
    window.__spy.notes += 1;
    return make.call(this);
  };
`;

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  // Otherwise the audio context opens suspended and every sound is dropped
  // before it reaches the counter — the app is fine, the test would not be.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(SPY);

async function open(settings) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(
    ([p, s]) => {
      localStorage.setItem("makezero.progress.v1", JSON.stringify(p));
      localStorage.setItem("makezero.settings.v1", JSON.stringify(s));
    },
    [PROGRESS, settings],
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  // Time attack: a full board, so a sweep across the first row always has
  // something to pick up.
  await page.click("#mode-timeAttack");
  await page.waitForTimeout(300);
  await page.click("#btn-intro-start");
  await page.waitForTimeout(450);
}

const spy = () => page.evaluate(() => window.__spy);
const reset = () => page.evaluate(() => { window.__spy.notes = 0; window.__spy.buzz = []; });

/** Sweeps the first row until the total reaches ten, or passes it. */
async function sweepRow() {
  const row = await page.evaluate(() => {
    const cols = Number(document.getElementById("board").dataset.cols);
    return [...document.querySelectorAll("#board .tile")].slice(0, cols).map((t) => {
      const b = t.getBoundingClientRect();
      return { v: Number(t.textContent), x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
  });
  let sum = 0;
  const path = [];
  for (const tile of row) {
    path.push(tile);
    sum += tile.v;
    if (sum >= 10 || path.length === 5) break;
  }
  await page.mouse.move(path[0].x, path[0].y);
  await page.mouse.down();
  for (const tile of path.slice(1)) await page.mouse.move(tile.x, tile.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(320);
  return { picked: path.length, made: sum === 10 };
}

// ── everything on ──────────────────────────────────────────────────────
{
  await open({ soundOn: true, hapticsOn: true });
  await reset();
  const { picked, made } = await sweepRow();
  const s = await spy();

  // One sound per block picked, plus the chord for the outcome.
  if (s.notes < picked) fail(`sound: ${picked} blocks picked but only ${s.notes} notes played`);
  else ok(`sound — ${picked} picks + ${made ? "clear" : "refusal"} = ${s.notes} notes`);

  if (s.buzz.length < picked) fail(`vibration: ${picked} blocks picked but only ${s.buzz.length} buzzes`);
  else ok(`vibration — ${s.buzz.length} buzzes (last ${JSON.stringify(s.buzz.at(-1))})`);

  // A refusal must not feel like a success. It is the one pattern that is a
  // sequence rather than a single short tick.
  const last = s.buzz.at(-1);
  if (!made && !Array.isArray(last)) fail("a refusal buzzed once — indistinguishable from success");
  else ok(made ? "a clear buzzes with the success pattern" : "a refusal is two short knocks — not the success one");
}

// ── sound off, haptics on ──────────────────────────────────────────────
{
  await open({ soundOn: false, hapticsOn: true });
  await reset();
  await sweepRow();
  const s = await spy();
  if (s.notes > 0) fail(`sound is off but ${s.notes} notes played`);
  else ok("sound off — nothing plays");
  if (s.buzz.length === 0) fail("only sound was turned off, but the vibration stopped too");
  else ok("turning off sound leaves vibration alone");
}

// ── haptics off, sound on ──────────────────────────────────────────────
{
  await open({ soundOn: true, hapticsOn: false });
  await reset();
  await sweepRow();
  const s = await spy();
  if (s.buzz.length > 0) fail(`vibration is off but it buzzed ${s.buzz.length} times`);
  else ok("vibration off — it never buzzes");
  if (s.notes === 0) fail("only vibration was turned off, but the sound stopped too");
  else ok("turning off vibration leaves sound alone");
}

// ── the switches themselves ────────────────────────────────────────────
{
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((p) => localStorage.setItem("makezero.progress.v1", JSON.stringify(p)), PROGRESS);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2400);
  await page.click("#btn-title-settings");
  await page.waitForTimeout(360);
  await page.click("#switch-sound");
  await page.waitForTimeout(160);
  const off = await page.getAttribute("#switch-sound", "aria-checked");
  const stored = await page.evaluate(() => localStorage.getItem("makezero.settings.v1"));
  if (off !== "false" || !stored?.includes('"soundOn":false')) {
    fail(`the settings switch did not save (aria-checked=${off}, stored ${stored})`);
  } else {
    ok("the settings switch changes both the screen and storage");
  }
}

if (errors.length) for (const e of errors) fail(`page error: ${e}`);
else ok("no page errors during sound and vibration");
await browser.close();
