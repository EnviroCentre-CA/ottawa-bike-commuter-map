/**
 * Raises the contrast and weight of the local street network in the generated
 * map styles.
 *
 * WHY
 * ---
 * The upstream "Oasis in the Desert" style treats the street grid as a quiet
 * backdrop so the cycling network can be the subject. That is the right call
 * for a browse-the-whole-network map, but this is a commuter map: a reader
 * follows one coloured line across the city and needs to see which streets it
 * runs on and crosses. As generated, residential roads are drawn at #e2dfd8 on
 * an #f5f3ef background — a few percent apart in lightness — and hairline-thin
 * until high zoom, so the grid effectively disappears at the zooms this map
 * opens at.
 *
 * The City's own GeoOttawa viewer does the opposite: bright street fills with a
 * dark casing, maximum separation from the ground. This applies the same idea
 * in the map's own palette — a darker casing under a white fill, with widths
 * that start carrying several zoom levels earlier.
 *
 * Contrast here is carried by *lightness*, never by hue. Colour stays reserved
 * for the route lines, which must remain the most saturated thing on the map.
 *
 * This runs as a post-processing pass rather than a hand-edit because the
 * styles are regenerated from the upstream repo by tools/generate-style.mts —
 * an edit made directly in the JSON would be silently lost on the next run.
 * Re-running this is idempotent.
 *
 * Usage: node tools/street-contrast.mjs   (after tools/generate-style.mts)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/**
 * Per road class: the casing (outline) and fill (centre) colour, and a
 * zoom→width ramp for each. Ramps use the same exponential base as upstream so
 * roads still grow naturally with zoom.
 *
 * Ordering matters visually — service roads stay muted so driveways and
 * parking aisles do not read as through streets.
 */
const CLASSES = {
  secondary: {
    casing: { color: '#8a8375', stops: [[8, 1.2], [10, 2.4], [12, 3.6], [14, 5.4], [18, 11]] },
    fill:   { color: '#ffffff', stops: [[8, 0.5], [10, 1.1], [12, 1.9], [14, 3.2], [18, 7.5]] },
  },
  country: { // tertiary + unclassified — parkways and connectors between suburbs
    casing: { color: '#968e7e', stops: [[10, 1.5], [12, 2.8], [14, 4.4], [18, 10]] },
    fill:   { color: '#ffffff', stops: [[10, 0.5], [12, 1.4], [14, 2.7], [18, 7]] },
  },
  minor: { // residential + living_street — the suburban street grid
    casing: { color: '#aca496', stops: [[10, 0.9], [12, 2.2], [14, 3.6], [18, 8]] },
    fill:   { color: '#ffffff', stops: [[10, 0.3], [12, 1.1], [14, 2.1], [18, 5.5]] },
  },
  service: {
    casing: { color: '#c9c2b6', stops: [[13, 0.7], [14, 1.5], [18, 4]] },
    fill:   { color: '#f7f5f1', stops: [[13, 0.25], [14, 0.8], [18, 2.5]] },
  },
};

// The high-contrast variant pushes casings to near-black and keeps fills pure
// white — the accessible style should be unambiguous, not merely darker.
const HC_CASING = {
  secondary: '#3f3a33', country: '#4a443b', minor: '#5c554a', service: '#8f887c',
};

// Local streets need to be readable a couple of zoom levels earlier than the
// urban style assumes, or the grid vanishes at the map's default city-wide view.
const MIN_ZOOM = { secondary: 8, country: 9, minor: 10, service: 13 };

function ramp(stops) {
  return ['interpolate', ['exponential', 1.6], ['zoom'], ...stops.flat()];
}

function applyTo(styleFile, { highContrast = false } = {}) {
  const file = path.join(root, styleFile);
  // style-poster.json is absent from a web-only checkout (the print pipeline is
  // not committed). Skip rather than fail so this runs in either tree.
  if (!fs.existsSync(file)) {
    console.log(`${styleFile.padEnd(28)} not present — skipped`);
    return;
  }
  const style = JSON.parse(fs.readFileSync(file, 'utf8'));
  const touched = [];

  for (const [cls, spec] of Object.entries(CLASSES)) {
    for (const part of ['casing', 'fill']) {
      const layer = style.layers.find(l => l.id === `road-${part}-${cls}`);
      if (!layer) continue;
      const color = part === 'casing' && highContrast ? HC_CASING[cls] : spec[part].color;
      layer.paint = { ...layer.paint, 'line-color': color, 'line-width': ramp(spec[part].stops) };
      layer.minzoom = Math.min(layer.minzoom ?? 99, MIN_ZOOM[cls]);
      touched.push(layer.id);
    }
  }

  // Road labels are useless if they appear later than the roads they name —
  // someone tracing a route needs the street name, not just the line.
  for (const [id, z] of [['label-road-minor', 13], ['label-road-secondary', 10]]) {
    const layer = style.layers.find(l => l.id === id);
    if (layer && (layer.minzoom ?? 99) > z) { layer.minzoom = z; touched.push(id); }
  }

  fs.writeFileSync(file, JSON.stringify(style));
  console.log(`${styleFile.padEnd(28)} updated ${touched.length} layers`);
}

applyTo('style-default.json');
applyTo('style-high-contrast.json', { highContrast: true });
applyTo('style-poster.json');
console.log('\nStreet contrast applied. Re-run after tools/generate-style.mts.');
