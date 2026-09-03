/**
 * Renders assets/og-card.png — the link-preview image Slack, Teams, iMessage,
 * LinkedIn and Facebook show when someone shares the map's URL.
 *
 * Unlike the poster pipeline, this output is *published*: index.html points
 * og:image at it, so both this script and the PNG it writes are committed.
 *
 * Sizing. The card is 1200x630, the 1.91:1 ratio every scraper expects.
 * tools/og-card.html is authored at 600x315 — the size a reader actually sees
 * the unfurl at — and rendered at deviceScaleFactor 2, so the PNG is exactly
 * 1200x630 with everything drawn at double density. That means labels come out
 * crisp on a retina display *and* MapLibre thins them for a 600 px map rather
 * than a 1200 px one, which is the density the card needs.
 *
 * Needs a static server on PORT (npm run serve) — the harness fetches
 * routes.geojson and style-default.json, and the Thunderforest tiles and glyph
 * PBFs come off the network, so this needs to be online.
 *
 * Usage:
 *   npm run serve            # in one terminal
 *   node tools/export-og-card.mjs [options]
 *
 * Options (all optional):
 *   --pad    <px>   default 18   breathing room around the route fan
 *   --line   <px>   default 4    route line weight
 *   --casing <px>   default 7    casing weight under each route line
 *   --out    <path>              override the output path
 *
 * After committing a new card, remember that scrapers cache per URL: a link
 * already shared shows the old preview (or none) until that cache expires.
 * Sharing the URL with a fresh query string forces a re-scrape.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const PAD = flag('pad', 18);
const LINE = flag('line', 4);
const CASING = flag('casing', 7);

const PORT = 8123;
const root = path.resolve(import.meta.dirname, '..');
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.join(root, 'assets', 'og-card.png');

// Authoring size, doubled by deviceScaleFactor to reach the 1200x630 the
// scrapers want. Change both together or the card stops being 1.91:1.
const CSS_W = 600;
const CSS_H = 315;
const SCALE = 2;

console.log(`card   : ${CSS_W * SCALE} x ${CSS_H * SCALE} px (${CSS_W} x ${CSS_H} css @${SCALE}x)`);
console.log(`weights: line ${LINE}, casing ${CASING}, pad ${PAD}`);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: CSS_W, height: CSS_H },
  deviceScaleFactor: SCALE,
});
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const url = `http://localhost:${PORT}/tools/og-card.html`
  + `?pad=${PAD}&line=${LINE}&casing=${CASING}`;
await page.goto(url, { waitUntil: 'networkidle' });
// waitForFunction(pageFunction, arg, options) — options go in the third slot;
// see the same note in tools/export-map-image.mjs.
await page.waitForFunction(() => window.__READY === true, undefined, { timeout: 90000 });
// Tiles for the outer suburbs can still be settling when `idle` fires.
await page.waitForTimeout(2000);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
// clip rather than a full-page shot: a stray scrollbar or sub-pixel body
// height would otherwise push the output off 1200x630, and a card that is not
// 1.91:1 gets letterboxed or cropped by the scrapers.
await page.screenshot({
  path: outFile,
  clip: { x: 0, y: 0, width: CSS_W, height: CSS_H },
});

const kb = fs.statSync(outFile).size / 1024;
console.log(`wrote ${path.relative(root, outFile)}  ${kb.toFixed(0)} KB`);
// Teams and Slack fetch the image inline while rendering the unfurl, so a
// slow, heavy card shows up as a blank box. Well under a megabyte is the goal.
if (kb > 900) console.log('WARNING: over 900 KB — consider re-encoding as JPEG');
if (errors.length) console.log('page errors:', errors.join('; '));

await browser.close();
