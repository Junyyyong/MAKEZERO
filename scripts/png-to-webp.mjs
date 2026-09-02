/**
 * Shrinks a PNG and re-encodes it as WebP, for the cover art.
 *
 * The covers arrive from the illustrator at 4837x9540 and nearly three
 * megabytes; the game ships one at 1080 wide and under half that. There is no
 * image toolchain in this repo — no ImageMagick, no sharp, nothing that would
 * have to be installed and kept — but the browser the layout tests already use
 * can resize and encode WebP on its own, so it does the job.
 *
 *   node scripts/png-to-webp.mjs cover-3.png public/cover.webp [width] [quality]
 *
 * It prints the size it wrote. Put that in the <img> tag's width and height,
 * or the page reserves the wrong box while the picture loads.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [src, out, widthArg = "1080", qualityArg = "0.86"] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node scripts/png-to-webp.mjs <in.png> <out.webp> [width] [quality]");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();
const encoded = await page.evaluate(
  async ([url, width, quality]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * width);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      data: canvas.toDataURL("image/webp", quality),
      size: [canvas.width, canvas.height],
      from: [img.naturalWidth, img.naturalHeight],
    };
  },
  ["data:image/png;base64," + readFileSync(src).toString("base64"), Number(widthArg), Number(qualityArg)],
);
await browser.close();

// A browser that cannot encode WebP hands back a PNG under the same call, so
// the format is checked rather than assumed.
if (!encoded.data.startsWith("data:image/webp")) throw new Error("this browser did not encode WebP");
const bytes = Buffer.from(encoded.data.split(",")[1], "base64");
writeFileSync(out, bytes);
console.log(
  `${src} ${encoded.from.join("x")} -> ${out} ${encoded.size.join("x")}, ${Math.round(bytes.length / 1024)}KB`,
);
