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
  await page.click("#mode-story");
  await page.waitForTimeout(300);
  await page.locator(".chapter-row:not(.shut)").last().click();
  await page.waitForTimeout(280);
  await page.locator(".stage-cell:not(.shut)").last().click();
  await page.waitForTimeout(280);
  await page.click("#btn-card-start");
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
  if (s.notes < picked) fail(`효과음: 블록 ${picked}개를 골랐는데 소리는 ${s.notes}번`);
  else ok(`효과음 — 블록 ${picked}개 + ${made ? "지움" : "거절"} = ${s.notes}개의 음`);

  if (s.buzz.length < picked) fail(`진동: 블록 ${picked}개를 골랐는데 진동은 ${s.buzz.length}번`);
  else ok(`진동 — ${s.buzz.length}번 (마지막 ${JSON.stringify(s.buzz.at(-1))})`);

  // A refusal must not feel like a success. It is the one pattern that is a
  // sequence rather than a single short tick.
  const last = s.buzz.at(-1);
  if (!made && !Array.isArray(last)) fail("거절인데 진동이 단발입니다 — 성공과 구분되지 않습니다");
  else ok(made ? "지웠을 때의 진동은 성공 패턴" : "거절은 짧은 두 번 — 성공과 다릅니다");
}

// ── sound off, haptics on ──────────────────────────────────────────────
{
  await open({ soundOn: false, hapticsOn: true });
  await reset();
  await sweepRow();
  const s = await spy();
  if (s.notes > 0) fail(`효과음을 껐는데 ${s.notes}번 울렸습니다`);
  else ok("효과음 끄기 — 아무 소리도 나지 않습니다");
  if (s.buzz.length === 0) fail("효과음만 껐는데 진동까지 멈췄습니다");
  else ok("효과음만 꺼도 진동은 남습니다");
}

// ── haptics off, sound on ──────────────────────────────────────────────
{
  await open({ soundOn: true, hapticsOn: false });
  await reset();
  await sweepRow();
  const s = await spy();
  if (s.buzz.length > 0) fail(`진동을 껐는데 ${s.buzz.length}번 울렸습니다`);
  else ok("진동 끄기 — 전혀 울리지 않습니다");
  if (s.notes === 0) fail("진동만 껐는데 소리까지 멈췄습니다");
  else ok("진동만 꺼도 소리는 남습니다");
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
    fail(`설정 스위치가 저장되지 않았습니다 (aria-checked=${off}, 저장 ${stored})`);
  } else {
    ok("설정 스위치는 화면과 저장소 양쪽을 바꿉니다");
  }
}

if (errors.length) for (const e of errors) fail(`페이지 오류: ${e}`);
else ok("소리·진동 중 페이지 오류 없음");
await browser.close();
