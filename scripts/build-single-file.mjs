/**
 * Bundles the built game into one self-contained HTML file.
 *
 * Everything the page needs is inlined — stylesheet, module script, and the
 * story artwork as data URIs — so it can be hosted anywhere that serves a
 * single file and blocks outside requests.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const outDir = join(root, "dist-single");
const outFile = join(outDir, "makezero.html");

function read(path) {
  return readFileSync(path, "utf8");
}

function dataUri(path) {
  const base64 = readFileSync(path).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

const html = read(join(dist, "index.html"));

const assets = readdirSync(join(dist, "assets"));
const cssName = assets.find((name) => name.endsWith(".css"));
const jsName = assets.find((name) => name.endsWith(".js"));
if (!cssName || !jsName) throw new Error("run `npm run build` first — dist/assets is missing");

const css = read(join(dist, "assets", cssName));
let js = read(join(dist, "assets", jsName));

// Story portraits are referenced by path from the bundle; swap each for its bytes.
const storyDir = join(dist, "story");
let inlined = 0;
for (const name of readdirSync(storyDir)) {
  const uri = dataUri(join(storyDir, name));
  const ref = `./story/${basename(name)}`;
  if (!js.includes(ref)) throw new Error(`bundle never references ${ref}`);
  js = js.replaceAll(ref, uri);
  inlined++;
}

const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
if (!body) throw new Error("could not find the body of dist/index.html");

// Artifacts supply their own doctype, html, head and body wrapper, so emit only
// the page content. The stylesheet paints every colour, including the ground.
const page = `<title>TAP to TEN</title>
<style>
${css}
</style>
${body.replace(/<script[\s\S]*?<\/script>/g, "").trimEnd()}
<script type="module">
${js}
</script>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, page);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`${outFile}`);
console.log(`  css ${kb(css.length)}  js ${kb(js.length)}  ${inlined} portraits inlined`);
console.log(`  total ${kb(page.length)}`);
if (/(src|href)="\.\//.test(page)) {
  throw new Error("a relative asset reference survived — the page is not self-contained");
}
