/**
 * Generates the standalone map styles for the CSAP commuter map.
 *
 * Imports the style builder from the whereto.bike platform
 * (https://github.com/eljojo/bike-app-astro, AGPL-3.0), which must be
 * checked out as a sibling directory named `bike-app-astro-main`.
 *
 * The upstream style points tile requests at a server-side proxy
 * (/api/tiles/...). This wrapper swaps in direct Thunderforest URLs with
 * an API key so the map works as a purely static site.
 *
 * Usage: npx tsx tools/generate-style.mts <THUNDERFOREST_API_KEY>
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildMapStyle,
  defaultBase, defaultCycling,
  hcBase, hcCycling,
} from '../../bike-app-astro-main/scripts/build-map-style.ts';

const apiKey = process.argv[2] || process.env.THUNDERFOREST_API_KEY;
if (!apiKey) {
  console.error('Usage: npx tsx tools/generate-style.mts <THUNDERFOREST_API_KEY>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');

// The base map's own cycling network (teal "oasis" cycleways, on-road lane
// overlays, and — most prominently — signed cycling-route relations like the
// NCC network and Trans Canada Trail) is the hero of the upstream style. In
// this map the coloured commuter routes are the hero instead, so we mute every
// base cycling line layer to a faint background. Matched by id pattern so it
// catches casings and any future layers, in both the default and high-contrast
// variants. The commuter route overlay is added client-side (ids commuter-*),
// so it is never affected here.
const BASE_CYCLING_ID = /(^|-)(oasis|cycling-route|mtb-route|road-cycleway)/;
const MUTE_OPACITY = 0.15;

function muteBaseCycling(style: { layers: { id: string; type: string; paint?: Record<string, unknown> }[] }) {
  for (const layer of style.layers) {
    if (layer.type !== 'line') continue;
    if (!BASE_CYCLING_ID.test(layer.id)) continue;
    // Casings sit under the main line — push them fainter still.
    const target = /casing/.test(layer.id) ? MUTE_OPACITY * 0.7 : MUTE_OPACITY;
    layer.paint = { ...layer.paint, 'line-opacity': target };
  }
}

// ---------------------------------------------------------------------------
// Poster variant
// ---------------------------------------------------------------------------
// A print map has one job: make the highlighted route unmistakable. Everything
// that helps you *browse* a map interactively — POI dots, shop names, the whole
// cycling network, contours, buildings — is noise at poster scale. This variant
// keeps only what orients a reader (water, green space, arterial roads and
// place names), in soft tints, and scales labels up for print viewing distance.

const posterBase = {
  ...defaultBase,
  background: '#ffffff',
  earth: '#fdfdfc',
  // Green space — soft, single family of greens
  forest: '#e4efe0', grassland: '#e9f2e4', scrub: '#e9f2e4', farmland: '#f4f4ee',
  wetland: '#e4eeea', park: '#dfeed8', cemetery: '#e8f0e4',
  glacier: '#f2f6f9', sand: '#f6f0e2', rock: '#f0efec',
  // Built-up land — near-white so it never competes with the route
  residential: '#fafaf8', commercial: '#faf8f6', industrial: '#f7f6f4',
  school: '#f8f7f8', hospital: '#faf7f6',
  // Water — soft blue, clearly readable in print
  water: '#cfe2f0', waterOutline: '#b6d2e6', stream: '#bcd6e8',
  building: '#f2f1ee', buildingOutline: '#eae8e4',
  // Roads — white ribbons with light grey casing, like the City's own maps
  majorRoad: '#ffffff', majorRoadCasing: '#d5d5d2',
  secondaryRoad: '#ffffff', secondaryRoadCasing: '#dedddA',
  countryRoad: '#ffffff', countryRoadCasing: '#e2e1de',
  road: '#ffffff', roadCasing: '#e8e7e4',
  service: '#fdfdfc', serviceCasing: '#f0efec',
  rail: '#e2e1de', railCasing: '#eeedea',
  // Labels — grey, quiet, never black
  labelCity: '#3d4348', labelTown: '#4a5055', labelVillage: '#5a6065',
  roadLabel: '#8a8f94', roadLabelHalo: '#ffffffdd',
  waterLabel: '#6f97b4', waterLabelHalo: '#ffffffdd',
  labelHalo: '#ffffff',
};

// Layers with no place on a poster.
const POSTER_DROP = [
  // Points of interest and transit dots/labels
  'poi-water-dot', 'poi-camping-dot', 'poi-rest-dot', 'poi-bike-dot', 'station-dot',
  'poi-water-name', 'poi-camping-name', 'poi-rest-name', 'poi-bike-name', 'station-label',
  // The base cycling network — the highlighted route is the story here
  'road-cycleway-overlay', 'oasis-cycleway-casing', 'oasis-cycleway', 'oasis-path',
  'cycling-route-lowzoom-casing', 'cycling-route-lowzoom', 'cycling-route-casing',
  'cycling-route', 'mtb-route-casing', 'mtb-route', 'path-generic',
  'label-cycleway', 'label-cycling-node',
  // Terrain and building clutter
  'hillshade', 'contour-line', 'contour-line-major', 'contour-label', 'building',
  'label-ferry', 'label-waterway', 'boundary-state', 'label-state',
];

/** Multiply the numeric outputs of a size value (number, interpolate or step). */
function scaleSize(v: unknown, f: number): unknown {
  if (typeof v === 'number') return Math.round(v * f * 100) / 100;
  if (Array.isArray(v) && v[0] === 'interpolate') {
    const out = [...v];
    for (let i = 4; i < out.length; i += 2) {
      if (typeof out[i] === 'number') out[i] = Math.round((out[i] as number) * f * 100) / 100;
    }
    return out;
  }
  if (Array.isArray(v) && v[0] === 'step') {
    const out = [...v];
    for (let i = 2; i < out.length; i += 2) {
      if (typeof out[i] === 'number') out[i] = Math.round((out[i] as number) * f * 100) / 100;
    }
    if (typeof out[1] === 'number') out[1] = Math.round((out[1] as number) * f * 100) / 100;
    return out;
  }
  return v;
}

interface AnyLayer { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown>; }

function makePoster(style: { layers: AnyLayer[] }) {
  const drop = new Set(POSTER_DROP);
  style.layers = style.layers.filter(l => !drop.has(l.id));
  for (const layer of style.layers) {
    if (layer.type !== 'symbol' || !layer.layout) continue;
    // Labels are read from further away in print — scale them up, and thicken
    // halos so they stay legible over green space and water.
    layer.layout['text-size'] = scaleSize(layer.layout['text-size'], 1.35);
    if (layer.paint && layer.paint['text-halo-width'] !== undefined) {
      layer.paint['text-halo-width'] = scaleSize(layer.paint['text-halo-width'], 1.6);
    }
  }
}

const variants = [
  { base: defaultBase, cycling: defaultCycling, name: 'Cycling', key: 'default' as const, poster: false },
  { base: hcBase, cycling: hcCycling, name: 'Cycling High Contrast', key: 'high-contrast' as const, poster: false },
  { base: posterBase, cycling: defaultCycling, name: 'Cycling Poster', key: 'poster' as const, poster: true },
];

for (const v of variants) {
  const style = buildMapStyle({ base: v.base, cycling: v.cycling }, 'default', v.name);
  style.sources.outdoors.tiles = [
    `https://api.thunderforest.com/thunderforest.outdoors-v2/{z}/{x}/{y}.vector.pbf?apikey=${apiKey}`,
  ];
  style.glyphs = `https://api.thunderforest.com/fonts/{fontstack}/{range}.pbf?apikey=${apiKey}`;
  if (v.poster) makePoster(style);
  else muteBaseCycling(style);
  const file = path.join(root, `style-${v.key}.json`);
  fs.writeFileSync(file, JSON.stringify(style));
  console.log(`Wrote ${file} (${style.layers.length} layers)`);
}
