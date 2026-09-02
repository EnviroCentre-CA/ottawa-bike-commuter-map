/**
 * Cycling Map Style Generator
 * ===========================
 *
 * Generates MapLibre GL styles for Thunderforest outdoors-v2 vector tiles.
 * Outputs fingerprinted JSON files to public/ and a URL module to src/lib/.
 *
 * Design Philosophy — "Oasis in the Desert"
 * ------------------------------------------
 *
 * The city is a desert of car infrastructure. This map shows where the
 * oases are — places where you can safely ride a bike without thinking
 * about cars. That's often what a bike path feels like.
 *
 * Two questions drive every styling decision:
 *
 *   1. Can I ride here with headphones on?
 *      - YES → Oasis (teal/black). Segregated from cars. Cycleways,
 *        multi-use paths, bike trails. The hero of the map.
 *      - SORT OF → Exposed (muted/dashed). On-road bike lanes. You can
 *        ride here but you're sharing space with cars.
 *      - NO → Desert (pale/thin). Car roads. Present for orientation,
 *        visually receding. Not hidden, just quiet.
 *
 *   2. Can I stop here?
 *      Three tiers, by how critical they are mid-ride:
 *      - WATER & RESTROOMS (blue, visible from z10). Critical
 *        infrastructure — the things you can't skip on a long ride.
 *      - CAMPING (orange, visible from z0). Key for touring — you
 *        need to know where you can sleep from the planning stage.
 *      - FOOD & LODGING (orange, visible from z15). Restaurants,
 *        hotels, shelters — useful but only when zoomed in.
 *      - BIKE INFRASTRUCTURE (teal, visible from z10). Shops, rental,
 *        repair — same color family as oasis.
 *
 * Why we collapse categories:
 *   - Gravel, MTB, hiking trails → all "can I bike here?" Same color.
 *   - We optimize for reducing cognitive load, not taxonomic completeness.
 *
 * Two style variants:
 *   - DEFAULT: warm outdoor palette. Oasis = teal, desert = pale earth tones.
 *   - HIGH CONTRAST: for colorblind users and low-distraction needs.
 *     Paper-like, almost monochrome. Information encoded through line
 *     weight and dash patterns, never through color alone. Like a city
 *     poster print — black lines on white paper, only what matters.
 *
 * Tile data: © OpenStreetMap contributors
 *   https://www.openstreetmap.org/copyright
 * Tile schema: Thunderforest outdoors-v2
 *   https://www.thunderforest.com/docs/thunderforest.outdoors-v2/
 * MapLibre GL style spec:
 *   https://maplibre.org/maplibre-style-spec/
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StyleVariant = 'default' | 'high-contrast';

export interface BasePalette {
  background: string;
  earth: string;
  forest: string;
  grassland: string;
  farmland: string;
  scrub: string;
  wetland: string;
  glacier: string;
  sand: string;
  rock: string;
  park: string;
  residential: string;
  commercial: string;
  industrial: string;
  school: string;
  hospital: string;
  cemetery: string;
  water: string;
  waterOutline: string;
  stream: string;
  building: string;
  buildingOutline: string;
  majorRoad: string;
  majorRoadCasing: string;
  secondaryRoad: string;
  secondaryRoadCasing: string;
  countryRoad: string;
  countryRoadCasing: string;
  road: string;
  roadCasing: string;
  service: string;
  serviceCasing: string;
  rail: string;
  railCasing: string;
  countryBorder: string;
  stateBorder: string;
  labelCity: string;
  labelTown: string;
  labelVillage: string;
  labelHalo: string;
  roadLabel: string;
  roadLabelHalo: string;
  waterLabel: string;
  waterLabelHalo: string;
  station: string;
  stationHalo: string;
  contour: string;
  contourLabel: string;
  restStop: string;
  restStopLabel: string;
  amenity: string;
  amenityLabel: string;
}

export interface CyclingPalette {
  oasis: string;
  oasisCasing: string;
  exposed: string;
  bikeInfra: string;
}

export interface Palette {
  base: BasePalette;
  cycling: CyclingPalette;
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

/** Warm, muted base — the "desert" */
export const defaultBase: BasePalette = {
  background: '#f5f3ef',
  earth: '#f0ede8',
  // Landcover
  forest: '#b4d89c',
  grassland: '#cce0b5',
  farmland: '#ede9d9',
  scrub: '#c8d7ab',
  wetland: '#d4e6d4',
  glacier: '#e8f0f8',
  sand: '#f0d8a0',
  rock: '#ddd8d0',
  // Landuse
  park: '#c0dca0',
  residential: '#eae6e0',
  commercial: '#ede0d6',
  industrial: '#e0d8d0',
  school: '#e8dfe8',
  hospital: '#f0dcd8',
  cemetery: '#d0dfc0',
  // Water
  water: '#a0c8e8',
  waterOutline: '#80b0d8',
  stream: '#90b8d8',
  // Buildings
  building: '#d9d0c8',
  buildingOutline: '#c8bfb5',
  // Roads — the desert: pale, quiet, just enough to orient.
  // Country/secondary darkened so tertiary highways (parkways, back roads
  // through forests) remain readable against grassland/forest backgrounds —
  // these are exactly where you bridge gaps between bike paths.
  majorRoad: '#c8c4bc',
  majorRoadCasing: '#aaa69c',
  secondaryRoad: '#cac6bb',
  secondaryRoadCasing: '#a39e90',
  countryRoad: '#cfcabc',
  countryRoadCasing: '#aba596',
  road: '#e2dfd8',
  roadCasing: '#d6d2ca',
  service: '#e8e5de',
  serviceCasing: '#dfdcd5',
  // Rail
  rail: '#ccc6be',
  railCasing: '#ddd8d0',
  // Boundaries
  countryBorder: '#9898c0',
  stateBorder: '#b0b0c8',
  // Labels
  labelCity: '#333333',
  labelTown: '#444444',
  labelVillage: '#555555',
  labelHalo: '#ffffff',
  roadLabel: '#9e968a',
  roadLabelHalo: '#ffffffcc',
  waterLabel: '#4878a0',
  waterLabelHalo: '#d8e8f0',
  // Transit
  station: '#2a2a3a',
  stationHalo: '#ffffff',
  // Contours
  contour: '#a89878',
  contourLabel: '#8a7860',
  // Rest stops
  restStop: '#c87030',
  restStopLabel: '#a05820',
  amenity: '#4a9ec2',
  amenityLabel: '#3578a0',
};

/**
 * Two-tier cycling palette — answering "can I put headphones on?"
 *
 *   Oasis (teal)  = Yes. Segregated from cars — cycleways, bike paths, trails.
 *   Exposed (muted) = No. You can bike here, but you're sharing space with cars.
 *
 * The default (no color) = car roads. The desert.
 */
export const defaultCycling: CyclingPalette = {
  // Oasis — safe, separated from cars
  oasis: '#006458',
  oasisCasing: '#009e88',
  // Exposed — rideable but alongside cars
  exposed: '#3a8878',
  // Bike infra POIs
  bikeInfra: '#008070',
};

/**
 * High-contrast "paper" base — almost monochrome.
 * Information through line weight and dash patterns, not color.
 */
export const hcBase: BasePalette = {
  background: '#ffffff',
  earth: '#fafafa',
  forest: '#e8e8e8',
  grassland: '#f0f0f0',
  farmland: '#f5f5f5',
  scrub: '#ededed',
  wetland: '#e5e5e5',
  glacier: '#f0f0f0',
  sand: '#f0ece0',
  rock: '#e8e8e8',
  park: '#e0e0e0',
  residential: '#f5f5f5',
  commercial: '#f2f2f2',
  industrial: '#f0f0f0',
  school: '#f2f2f2',
  hospital: '#f0f0f0',
  cemetery: '#ebebeb',
  water: '#d0d0d0',
  waterOutline: '#b8b8b8',
  stream: '#c0c0c0',
  building: '#e5e5e5',
  buildingOutline: '#d5d5d5',
  majorRoad: '#e0e0e0',
  majorRoadCasing: '#d5d5d5',
  secondaryRoad: '#e5e5e5',
  secondaryRoadCasing: '#dadada',
  countryRoad: '#e8e8e8',
  countryRoadCasing: '#e0e0e0',
  road: '#eeeeee',
  roadCasing: '#e8e8e8',
  service: '#f2f2f2',
  serviceCasing: '#ececec',
  rail: '#cccccc',
  railCasing: '#e0e0e0',
  countryBorder: '#999999',
  stateBorder: '#bbbbbb',
  labelCity: '#1a1a1a',
  labelTown: '#333333',
  labelVillage: '#555555',
  labelHalo: '#ffffff',
  roadLabel: '#999999',
  roadLabelHalo: '#ffffffcc',
  waterLabel: '#777777',
  waterLabelHalo: '#f0f0f0',
  station: '#1a1a1a',
  stationHalo: '#ffffff',
  contour: '#d8d8d8',
  contourLabel: '#b0b0b0',
  restStop: '#1a1a1a',
  restStopLabel: '#333333',
  amenity: '#1a1a1a',
  amenityLabel: '#333333',
};

/** High-contrast cycling palette — black on white, like a poster print */
export const hcCycling: CyclingPalette = {
  oasis: '#1a1a1a',
  oasisCasing: '#666666',
  exposed: '#555555',
  bikeInfra: '#1a1a1a',
};

// ---------------------------------------------------------------------------
// Font stacks (served by Thunderforest, proxied through /api/tiles/fonts/)
// ---------------------------------------------------------------------------

const font = {
  regular: 'NotoSans_Regular',
  bold: 'NotoSans_Regular', // Thunderforest only has Regular and Italic
  italic: 'NotoSans_Italic',
};

// ---------------------------------------------------------------------------
// Helper: zoom-interpolated line width
// ---------------------------------------------------------------------------

export type ZoomWidth = [number, number][];

export function lineWidth(stops: ZoomWidth): any {
  return [
    'interpolate', ['exponential', 1.6], ['zoom'],
    ...stops.flatMap(([z, w]) => [z, w]),
  ];
}

/** Scale every width in a ZoomWidth array by a multiplier */
export function scaleWidth(stops: ZoomWidth, factor: number): ZoomWidth {
  return stops.map(([z, w]) => [z, w * factor]);
}

// ---------------------------------------------------------------------------
// Helper: POI dot + label pair
// ---------------------------------------------------------------------------

type Layer = Record<string, any>;

interface PoiOpts {
  color: string;
  minzoom: number;
  /** Custom radius stops [zoom, radius, ...] */
  radius?: number[];
  /** Override label minzoom (default: max(minzoom, 15)) */
  labelMinzoom?: number;
  /** Custom text size stops [zoom, size, ...] */
  textSize?: number[];
}

function poiLayer(id: string, filter: any, opts: PoiOpts): Layer[] {
  const r = opts.radius
    ? ['interpolate', ['linear'], ['zoom'], ...opts.radius]
    : ['interpolate', ['linear'], ['zoom'], opts.minzoom, 2.5, 16, 4, 18, 6];

  return [
    {
      id: `${id}-dot`,
      type: 'circle',
      source: 'outdoors',
      'source-layer': 'poi-label',
      minzoom: opts.minzoom,
      filter,
      paint: {
        'circle-color': opts.color,
        'circle-radius': r,
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.6,
      },
    },
    {
      id: `${id}-name`,
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'poi-label',
      minzoom: opts.labelMinzoom ?? Math.max(opts.minzoom, 15),
      filter,
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ['match', ['get', 'feature'],
          'toilets', 'Restroom',
          'shelter', 'Shelter',
          'drinking_water', 'Water Fountain',
          'water_point', 'Water Fountain',
          'picnic_site', 'Picnic',
          'camp_site', 'Campsite',
          'bicycle_repair_station', 'Bike Repair',
          'bicycle_rental', 'Bike Rental',
          '',
        ]],
        'text-font': [font.regular],
        'text-size': opts.textSize
          ? ['interpolate', ['linear'], ['zoom'], ...opts.textSize]
          : ['interpolate', ['linear'], ['zoom'], 15, 9, 18, 11],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 8,
        'text-optional': true,
      },
      paint: {
        'text-color': opts.color,
        'text-halo-color': '#ffffffcc',
        'text-halo-width': 1.5,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Layer builder
// ---------------------------------------------------------------------------

export function buildLayers(p: Palette, variant: StyleVariant): Layer[] {
  return [
    // ===== BACKGROUND & TERRAIN =====
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': p.base.background },
    },
    {
      id: 'hillshade',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'hillshade',
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'level'],
          110, variant === 'high-contrast' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.55)',
          170, 'rgba(0,0,0,0)',
          230, variant === 'high-contrast' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.4)',
        ],
        'fill-antialias': false,
      },
    },

    // ===== CONTOUR LINES =====
    {
      id: 'contour-line',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'elevation',
      minzoom: 11,
      paint: {
        'line-color': p.base.contour,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 14, 0.5, 16, 0.8],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 13, 0.4, 16, 0.5],
      },
    },
    {
      id: 'contour-line-major',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'elevation',
      minzoom: 9,
      filter: ['==', ['%', ['get', 'height'], 50], 0],
      paint: {
        'line-color': p.base.contour,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 11, 0.6, 14, 1.2, 16, 1.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.25, 11, 0.4, 14, 0.6],
      },
    },
    {
      id: 'contour-label',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'elevation',
      minzoom: 12,
      filter: ['==', ['%', ['get', 'height'], 50], 0],
      layout: {
        'text-field': ['concat', ['to-string', ['get', 'height']], 'm'],
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 8, 16, 10],
        'symbol-placement': 'line',
        'text-max-angle': 25,
        'text-padding': 40,
      },
      paint: {
        'text-color': p.base.contourLabel,
        'text-halo-color': '#ffffffcc',
        'text-halo-width': 1.5,
      },
    },

    // ===== LANDCOVER =====
    {
      id: 'landcover-lowzoom',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landcover-lowzoom',
      maxzoom: 8,
      paint: {
        'fill-color': [
          'match', ['get', 'value'],
          0, p.base.water,
          1, p.base.forest, 2, p.base.forest,
          3, p.base.forest, 4, p.base.forest, 5, p.base.forest,
          6, p.base.scrub, 7, p.base.scrub,
          8, p.base.grassland, 9, p.base.grassland,
          10, p.base.grassland,
          11, p.base.wetland,
          12, p.base.farmland, 13, p.base.farmland, 14, p.base.farmland,
          16, p.base.rock,
          p.base.earth,
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 6, 0.75, 8, 0.7],
      },
    },
    {
      id: 'landcover-forest',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landcover',
      filter: ['in', 'type', 'forest', 'wood', 'orchard'],
      paint: {
        'fill-color': p.base.forest,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 10, 0.8, 14, 0.75],
      },
    },
    {
      id: 'landcover-sand',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landcover',
      filter: ['==', 'type', 'sand'],
      paint: {
        'fill-color': p.base.sand,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 10, 0.65, 14, 0.6],
      },
    },
    // Grass, meadow, heath, vineyard — same green family as grassland
    {
      id: 'landcover-grass',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landcover',
      filter: ['in', 'type', 'grass', 'meadow', 'heath', 'vineyard', 'grassland'],
      paint: {
        'fill-color': p.base.grassland,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 0.7],
      },
    },
    ...['farmland', 'scrub', 'wetland', 'glacier', 'rock'].map(type => ({
      id: `landcover-${type}`,
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landcover',
      filter: ['==', 'type', type === 'rock' ? 'bare_rock' : type],
      paint: {
        'fill-color': (p.base as any)[type] || p.base.grassland,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 0.7],
      },
    })),

    // ===== LANDUSE =====
    // Parks and green spaces — all the same green (includes recreation_ground, garden, etc.)
    {
      id: 'landuse-park',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landuse',
      filter: ['in', 'type', 'park', 'recreation_ground', 'garden', 'village_green', 'grass', 'common', 'golf_course', 'pitch'],
      paint: {
        'fill-color': p.base.park,
        'fill-opacity': 0.8,
      },
    },
    ...([
      ['residential', p.base.residential, 0.5],
      ['commercial', p.base.commercial, 0.5],
      ['industrial', p.base.industrial, 0.5],
      ['school', p.base.school, 0.5],
      ['hospital', p.base.hospital, 0.5],
      ['cemetery', p.base.cemetery, 0.5],
    ] as [string, string, number][]).map(([type, color, opacity]) => ({
      id: `landuse-${type}`,
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'landuse',
      filter: ['==', 'type', type],
      paint: {
        'fill-color': color,
        'fill-opacity': opacity,
      },
    })),

    // ===== PROTECTED AREAS =====
    {
      id: 'protected-area',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'protected-area',
      paint: {
        'fill-color': p.base.park,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 0.6, 14, 0.5],
      },
    },
    {
      id: 'protected-area-outline',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'protected-area',
      minzoom: 8,
      paint: {
        'line-color': '#7cba68',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.5, 16, 2],
        'line-dasharray': [4, 2],
        'line-opacity': 0.6,
      },
    },

    // ===== WETLAND =====
    {
      id: 'wetland',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'wetland',
      paint: {
        'fill-color': p.base.wetland,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 0.6],
      },
    },

    // ===== WATER =====
    {
      id: 'ocean',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'ocean',
      paint: { 'fill-color': p.base.water },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'outdoors',
      'source-layer': 'water',
      paint: { 'fill-color': p.base.water },
    },
    {
      id: 'waterway-river',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'waterway',
      filter: ['in', 'waterway', 'river', 'canal'],
      paint: {
        'line-color': p.base.stream,
        'line-width': lineWidth([[8, 0.5], [14, 3], [18, 8]]),
      },
    },
    {
      id: 'waterway-stream',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'waterway',
      filter: ['in', 'waterway', 'stream', 'ditch', 'drain'],
      paint: {
        'line-color': p.base.stream,
        'line-width': lineWidth([[12, 0.3], [16, 1.5], [18, 3]]),
      },
    },

    // ===== FERRY ROUTES =====
    {
      id: 'ferry',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'ferry',
      minzoom: 8,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.base.waterOutline,
        'line-width': lineWidth([[8, 0.5], [12, 1.5], [16, 2.5]]),
        'line-dasharray': [6, 4],
        'line-opacity': 0.7,
      },
    },

    // ===== BUILDINGS =====
    {
      id: 'building',
      type: 'fill-extrusion',
      source: 'outdoors',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': p.base.building,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 4],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.6],
      },
    },

    // ===== RAILWAY =====
    {
      id: 'railway-casing',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'railway',
      minzoom: 10,
      paint: {
        'line-color': p.base.railCasing,
        'line-width': lineWidth([[10, 1], [14, 2], [18, 4]]),
      },
    },
    {
      id: 'railway',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'railway',
      minzoom: 10,
      paint: {
        'line-color': p.base.rail,
        'line-width': lineWidth([[10, 0.5], [14, 1], [18, 2]]),
        'line-dasharray': [3, 3],
      },
    },

    // ===== CAR ROADS — the desert =====
    // Subtle hierarchy (major slightly darker than minor) for orientation,
    // but all pale earth tones — visually receding behind cycling infra.
    ...roadLayers(p, variant),

    // ===== EXPOSED — rideable but alongside cars =====
    // Roads with cycleway tags. You can bike here but you're sharing space.
    ...exposedLayers(p, variant),

    // ===== OASIS — safe, separated from cars =====
    // Cycleways, bike paths, trails with bike access. Headphones-on territory.
    ...oasisLayers(p, variant),

    // ===== BOUNDARIES =====
    {
      id: 'boundary-country',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'country-line',
      paint: {
        'line-color': p.base.countryBorder,
        'line-width': lineWidth([[2, 0.5], [6, 1.5], [10, 2.5]]),
        'line-dasharray': [5, 2],
      },
    },
    {
      id: 'boundary-state',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'state-line',
      minzoom: 4,
      paint: {
        'line-color': p.base.stateBorder,
        'line-width': lineWidth([[4, 0.3], [8, 1], [12, 1.5]]),
        'line-dasharray': [4, 3],
      },
    },

    // ===== LABELS =====
    ...labelLayers(p),
  ];
}

// ---------------------------------------------------------------------------
// Car roads — pale, quiet context
// ---------------------------------------------------------------------------

const roadClasses = [
  {
    id: 'major',
    filter: ['in', 'highway', 'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'],
    widthFill: [[7, 0.6], [10, 1.4], [14, 3.5], [18, 8]] as ZoomWidth,
    widthCasing: [[7, 1], [10, 2.2], [14, 5.5], [18, 12]] as ZoomWidth,
    minzoom: 5,
  },
  {
    id: 'secondary',
    filter: ['in', 'highway', 'secondary', 'secondary_link'],
    widthFill: [[8, 0.4], [10, 1], [14, 2.5], [18, 6]] as ZoomWidth,
    widthCasing: [[8, 0.8], [10, 1.8], [14, 4], [18, 9]] as ZoomWidth,
    minzoom: 8,
  },
  {
    id: 'country',
    filter: ['in', 'highway', 'tertiary', 'tertiary_link', 'unclassified'],
    widthFill: [[10, 0.2], [12, 0.4], [14, 1], [18, 2.8]] as ZoomWidth,
    widthCasing: [[10, 0.6], [12, 1], [14, 2.2], [18, 5]] as ZoomWidth,
    minzoom: 10,
  },
  {
    id: 'minor',
    filter: ['in', 'highway', 'residential', 'living_street'],
    widthFill: [[12, 0.2], [14, 0.8], [18, 2.5]] as ZoomWidth,
    widthCasing: [[12, 0.4], [14, 1.5], [18, 4]] as ZoomWidth,
    minzoom: 12,
  },
  {
    id: 'service',
    filter: ['==', 'highway', 'service'],
    widthFill: [[14, 0.3], [18, 1.5]] as ZoomWidth,
    widthCasing: [[14, 0.6], [18, 2.5]] as ZoomWidth,
    minzoom: 14,
  },
];

export function roadLayers(p: Palette, variant: StyleVariant): Layer[] {
  const scale = variant === 'high-contrast' ? 0.8 : 1;
  return [
    // Casings (bottom)
    ...roadClasses.map(rc => ({
      id: `road-casing-${rc.id}`,
      type: 'line',
      source: 'outdoors',
      'source-layer': 'road',
      minzoom: rc.minzoom,
      filter: rc.filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': rc.id === 'major' ? p.base.majorRoadCasing
          : rc.id === 'secondary' ? p.base.secondaryRoadCasing
          : rc.id === 'country' ? p.base.countryRoadCasing
          : p.base.roadCasing,
        'line-width': lineWidth(scaleWidth(rc.widthCasing, scale)),
      },
    })),
    // Fills (top)
    ...roadClasses.map(rc => ({
      id: `road-fill-${rc.id}`,
      type: 'line',
      source: 'outdoors',
      'source-layer': 'road',
      minzoom: rc.minzoom,
      filter: rc.filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': rc.id === 'major' ? p.base.majorRoad
          : rc.id === 'secondary' ? p.base.secondaryRoad
          : rc.id === 'country' ? p.base.countryRoad
          : p.base.road,
        'line-width': lineWidth(scaleWidth(rc.widthFill, scale)),
      },
    })),
  ];
}

// ---------------------------------------------------------------------------
// Exposed — rideable but alongside cars (on-road bike lanes)
// ---------------------------------------------------------------------------

function exposedLayers(p: Palette, variant: StyleVariant): Layer[] {
  const isHC = variant === 'high-contrast';
  return [
    {
      id: 'road-cycleway-overlay',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'road',
      minzoom: 10,
      filter: ['any',
        ['has', 'cycleway'],
        ['has', 'cycleway_left'],
        ['has', 'cycleway_right'],
      ],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.exposed,
        'line-width': lineWidth([[10, 0.5], [12, 1], [14, 2], [18, 4]]),
        'line-opacity': isHC ? 0.9 : 0.7,
        ...(isHC ? { 'line-dasharray': [6, 3] } : {}),
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Oasis — safe, separated from cars
// All bike-accessible paths get the same teal treatment.
// Solid = dedicated cycleway. Dashed = shared path / trail with bike access.
// ---------------------------------------------------------------------------

function oasisLayers(p: Palette, variant: StyleVariant): Layer[] {
  const isHC = variant === 'high-contrast';
  const scale = isHC ? 1.3 : 1;

  return [
    // Dedicated cycleways — solid teal, the clearest oasis
    {
      id: 'oasis-cycleway-casing',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'path',
      minzoom: 5,
      filter: ['==', 'highway', 'cycleway'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasisCasing,
        'line-width': lineWidth(scaleWidth([[5, 0.3], [8, 0.5], [10, 0.8], [14, 3], [18, 7]], scale)),
      },
    },
    {
      id: 'oasis-cycleway',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'path',
      minzoom: 5,
      filter: ['==', 'highway', 'cycleway'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasis,
        'line-width': lineWidth(scaleWidth([[5, 0.2], [8, 0.3], [10, 0.5], [14, 2], [18, 5]], scale)),
      },
    },

    // Paths + tracks with bicycle access — dashed teal
    // Includes: shared-use paths, trails, gravel tracks, bridleways, MTB trails
    // All one color. The rider cares about "can I bike here?" not the surface.
    {
      id: 'oasis-path',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'path',
      minzoom: 10,
      filter: ['all',
        ['in', 'highway', 'path', 'footway', 'track', 'bridleway'],
        ['in', 'bicycle', 'yes', 'designated', 'permissive'],
      ],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasis,
        'line-width': lineWidth(scaleWidth([[10, 0.3], [12, 0.5], [14, 1.5], [18, 3.5]], scale)),
        'line-dasharray': [4, 2],
        'line-opacity': 0.7,
      },
    },

    // Signed cycling route network — same teal, wider casing for prominence
    // These are official cycling routes that may run along roads or paths.
    {
      id: 'cycling-route-lowzoom-casing',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'cycling-lowzoom',
      minzoom: 2,
      maxzoom: 12,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': lineWidth(scaleWidth([[2, 1], [5, 2], [8, 4], [10, 6]], scale)),
        'line-opacity': 0.7,
      },
    },
    {
      id: 'cycling-route-lowzoom',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'cycling-lowzoom',
      minzoom: 2,
      maxzoom: 12,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasis,
        'line-width': lineWidth(scaleWidth([[2, 0.4], [5, 1.2], [8, 2.5], [10, 4]], scale)),
        'line-opacity': 0.8,
      },
    },
    {
      id: 'cycling-route-casing',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'cycling',
      minzoom: 8,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': lineWidth(scaleWidth([[8, 3], [12, 5], [16, 8]], scale)),
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.7],
      },
    },
    {
      id: 'cycling-route',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'cycling',
      minzoom: 8,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasis,
        'line-width': lineWidth(scaleWidth([[8, 1.5], [12, 3], [16, 5]], scale)),
        'line-opacity': 0.8,
      },
    },

    // Mountain biking routes — same teal, dashed (you can bike here)
    {
      id: 'mtb-route-casing',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'mountain-biking',
      minzoom: 10,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': lineWidth(scaleWidth([[10, 1.5], [14, 3.5], [18, 6]], scale)),
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 0.6],
      },
    },
    {
      id: 'mtb-route',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'mountain-biking',
      minzoom: 10,
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': p.cycling.oasis,
        'line-width': lineWidth(scaleWidth([[10, 0.8], [14, 2], [18, 4]], scale)),
        'line-dasharray': [3, 1.5],
        'line-opacity': 0.75,
      },
    },

    // Generic paths (no bicycle tag) — very subtle, just context
    {
      id: 'path-generic',
      type: 'line',
      source: 'outdoors',
      'source-layer': 'path',
      minzoom: 14,
      filter: ['all',
        ['in', 'highway', 'path', 'footway', 'track'],
        ['!in', 'bicycle', 'yes', 'designated', 'permissive'],
        ['!=', 'highway', 'cycleway'],
      ],
      paint: {
        'line-color': isHC ? '#d0d0d0' : '#c0b8a8',
        'line-width': lineWidth(isHC
          ? [[14, 0.2], [16, 0.5], [18, 1]]
          : [[14, 0.3], [16, 0.8], [18, 1.5]]),
        'line-dasharray': [2, 2],
        'line-opacity': isHC ? 0.3 : 0.4,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function labelLayers(p: Palette): Layer[] {
  return [
    // Park / green space labels
    {
      id: 'label-park',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'landuse-label',
      minzoom: 9,
      filter: ['all',
        ['in', ['get', 'type'], ['literal', ['park', 'recreation_ground', 'garden', 'village_green', 'cemetery']]],
        ['has', 'name'],
      ],
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 8, 12, 11, 16, 13],
        'text-max-width': 7,
        'symbol-placement': 'point',
        'text-padding': 8,
        'text-optional': true,
      },
      paint: {
        'text-color': '#3a7a30',
        'text-halo-color': '#ffffffcc',
        'text-halo-width': 2,
      },
    },

    // Protected area labels
    {
      id: 'label-protected-area',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'protected-area-label',
      minzoom: 8,
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 14, 16, 16],
        'text-max-width': 8,
        'symbol-placement': 'point',
        'text-padding': 10,
      },
      paint: {
        'text-color': '#3a7a30',
        'text-halo-color': '#ffffffcc',
        'text-halo-width': 2,
      },
    },

    // Water labels
    {
      id: 'label-water',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'water-label',
      minzoom: 10,
      filter: ['has', 'name'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 16, 14],
        'text-max-width': 7,
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': p.base.waterLabel,
        'text-halo-color': p.base.waterLabelHalo,
        'text-halo-width': 1.5,
      },
    },

    // Road labels
    {
      id: 'label-road-primary',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'road-label',
      minzoom: 10,
      filter: ['in', ['get', 'highway'], ['literal', ['primary', 'trunk', 'motorway']]],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 13, 13, 16, 17],
        'symbol-placement': 'line',
        'text-max-angle': 30,
        'text-padding': 20,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
      },
      paint: {
        'text-color': '#5a5248',
        'text-halo-color': p.base.roadLabelHalo,
        'text-halo-width': 2,
      },
    },
    {
      id: 'label-road-secondary',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'road-label',
      minzoom: 11,
      filter: ['in', ['get', 'highway'], ['literal', ['secondary', 'tertiary']]],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 13, 12, 16, 15],
        'symbol-placement': 'line',
        'text-max-angle': 30,
        'text-padding': 15,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'viewport',
      },
      paint: {
        'text-color': '#6a6258',
        'text-halo-color': p.base.roadLabelHalo,
        'text-halo-width': 2,
      },
    },
    {
      id: 'label-road-minor',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'road-label',
      minzoom: 14,
      filter: ['in', ['get', 'highway'], ['literal', ['residential', 'unclassified', 'living_street']]],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 16, 11, 18, 12],
        'symbol-placement': 'line',
        'text-max-angle': 30,
        'text-padding': 10,
      },
      paint: {
        'text-color': p.base.roadLabel,
        'text-halo-color': p.base.roadLabelHalo,
        'text-halo-width': 1.5,
      },
    },

    // Cycleway / path labels — oasis color
    {
      id: 'label-cycleway',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'path-label',
      minzoom: 12,
      filter: ['has', 'name'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 8, 14, 10, 18, 12],
        'symbol-placement': 'line',
        'text-max-angle': 30,
      },
      paint: {
        'text-color': p.cycling.oasis,
        'text-halo-color': '#ffffffcc',
        'text-halo-width': 2,
      },
    },

    // Cycling node network labels
    {
      id: 'label-cycling-node',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'cycling-node-network-label',
      minzoom: 12,
      layout: {
        'text-field': '{ref}',
        'text-font': [font.regular],
        'text-size': 12,
        'text-padding': 5,
      },
      paint: {
        'text-color': p.cycling.oasis,
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    },

    // ===== REST STOPS =====
    // Three tiers by criticality: water/restrooms (blue, z10),
    // camping (orange, z0), food/lodging (orange, z15).

    // Water fountains & restrooms — blue, visible earliest (critical infrastructure)
    ...poiLayer('poi-water', ['in', ['get', 'feature'], ['literal', [
      'drinking_water', 'water_point', 'toilets',
    ]]], {
      color: p.base.amenity, minzoom: 10, radius: [10, 3, 14, 5, 18, 7],
    }),

    // Camping — visible from afar (key for long rides)
    ...poiLayer('poi-camping', ['in', ['get', 'feature'], ['literal', [
      'camp_site',
    ]]], {
      color: p.base.restStop, minzoom: 0, radius: [0, 7, 14, 7, 18, 9], labelMinzoom: 8,
    }),

    // Everything else you'd stop at — food, lodging
    ...poiLayer('poi-rest', ['in', ['get', 'feature'], ['literal', [
      // Food & drink
      'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream',
      // Groceries & fuel
      'supermarket', 'convenience', 'greengrocer', 'bakery', 'deli', 'marketplace', 'fuel',
      // Comfort
      'shelter',
      // Lodging
      'hotel', 'motel', 'guest_house', 'hostel', 'alpine_hut',
      'caravan_site', 'picnic_site',
    ]]], {
      color: p.base.restStop, minzoom: 15,
    }),

    // ===== BIKE INFRASTRUCTURE =====
    // Bike shops, rental, repair — teal dots (same family as oasis)
    ...poiLayer('poi-bike', ['in', ['get', 'feature'], ['literal', [
      'bicycle', 'bicycle_rental', 'bicycle_repair_station',
    ]]], {
      color: p.cycling.bikeInfra, minzoom: 10, radius: [10, 3, 14, 5, 18, 7],
    }),


    // Train stations — subtle orientation landmarks
    {
      id: 'station-dot',
      type: 'circle',
      source: 'outdoors',
      'source-layer': 'railway-station',
      minzoom: 12,
      paint: {
        'circle-color': p.base.station,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 14, 4, 18, 6],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': p.base.stationHalo,
        'circle-opacity': 0.7,
      },
    },
    {
      id: 'station-label',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'railway-station',
      minzoom: 13,
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 14, 11, 18, 13],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': p.base.station,
        'text-halo-color': p.base.stationHalo,
        'text-halo-width': 1.5,
      },
    },

    // Place labels — cities, towns, villages
    {
      id: 'label-city',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'place-label',
      filter: ['==', 'place', 'city'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.bold],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 18, 14, 24],
        'text-max-width': 8,
      },
      paint: {
        'text-color': p.base.labelCity,
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 2,
      },
    },
    {
      id: 'label-town',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'place-label',
      minzoom: 6,
      filter: ['==', 'place', 'town'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.bold],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 8, 12, 14, 16, 18],
        'text-max-width': 7,
      },
      paint: {
        'text-color': p.base.labelTown,
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'label-village',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'place-label',
      minzoom: 8,
      filter: ['in', 'place', 'village', 'hamlet', 'suburb'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 15, 18, 18],
        'text-max-width': 6,
      },
      paint: {
        'text-color': p.base.labelVillage,
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 1.5,
      },
    },

    // Island labels
    {
      id: 'label-island',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'place-label',
      minzoom: 10,
      filter: ['in', 'place', 'island', 'islet'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 12, 18, 14],
        'text-max-width': 7,
      },
      paint: {
        'text-color': p.base.labelVillage,
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 1.5,
      },
    },

    // Neighbourhood / locality labels
    {
      id: 'label-neighbourhood',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'place-label',
      minzoom: 12,
      filter: ['in', 'place', 'neighbourhood', 'locality'],
      layout: {
        'text-field': '{name}',
        'text-font': [font.regular],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 13],
        'text-max-width': 6,
        'text-padding': 10,
      },
      paint: {
        'text-color': p.base.labelVillage,
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 1.5,
        'text-opacity': 0.8,
      },
    },

    // State/province labels
    {
      id: 'label-state',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'state-label',
      minzoom: 4,
      maxzoom: 8,
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 7, 16],
        'text-max-width': 8,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.15,
      },
      paint: {
        'text-color': '#7a7a9a',
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 2,
        'text-opacity': 0.7,
      },
    },

    // Country labels
    {
      id: 'label-country',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'country-label',
      maxzoom: 6,
      layout: {
        'text-field': '{name}',
        'text-font': [font.bold],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 18],
        'text-max-width': 8,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.2,
      },
      paint: {
        'text-color': '#6a6a8a',
        'text-halo-color': p.base.labelHalo,
        'text-halo-width': 2,
      },
    },

    // Ferry labels
    {
      id: 'label-ferry',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'ferry',
      minzoom: 10,
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 11],
        'symbol-placement': 'line',
        'text-max-angle': 25,
      },
      paint: {
        'text-color': p.base.waterLabel,
        'text-halo-color': p.base.waterLabelHalo,
        'text-halo-width': 1.5,
      },
    },

    // Waterway labels (rivers, canals)
    {
      id: 'label-waterway',
      type: 'symbol',
      source: 'outdoors',
      'source-layer': 'waterway-label',
      minzoom: 13,
      layout: {
        'text-field': '{name}',
        'text-font': [font.italic],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 18, 12],
        'symbol-placement': 'line',
        'text-max-angle': 25,
      },
      paint: {
        'text-color': p.base.waterLabel,
        'text-halo-color': p.base.waterLabelHalo,
        'text-halo-width': 1.5,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Build the full style
// ---------------------------------------------------------------------------

export function buildMapStyle(p: Palette, variant: StyleVariant, name: string) {
  return {
    version: 8,
    name,
    sources: {
      outdoors: {
        type: 'vector',
        tiles: ['/api/tiles/thunderforest.outdoors-v2/{z}/{x}/{y}.vector.pbf'],
        minzoom: 0,
        maxzoom: 14,
        attribution: '&copy; <a href="https://www.thunderforest.com">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    glyphs: '/api/tiles/fonts/{fontstack}/{range}.pbf',
    layers: buildLayers(p, variant),
  };
}

// ---------------------------------------------------------------------------
// Main — generate fingerprinted map-style-{variant}.[hash].json + URL module
// Only runs when executed directly, not when imported for tests.
// ---------------------------------------------------------------------------

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('build-map-style.ts') ||
  process.argv[1].endsWith('build-map-style.js')
);

if (isDirectRun) {
  const root = path.resolve(import.meta.dirname || __dirname, '..');
  const publicDir = path.join(root, 'public');

  const variants: { base: BasePalette; cycling: CyclingPalette; name: string; key: StyleVariant }[] = [
    { base: defaultBase, cycling: defaultCycling, name: 'Cycling', key: 'default' },
    { base: hcBase, cycling: hcCycling, name: 'Cycling High Contrast', key: 'high-contrast' },
  ];

  // Snapshot old fingerprinted files before writing anything — deleting them up
  // front means a mid-run crash leaves map-style-url.ts pointing at files that no
  // longer exist (404s in production). We delete these only after the new files
  // and the URL module are both safely on disk.
  const staleFiles = fs.readdirSync(publicDir).filter(f => f.startsWith('map-style') && f.endsWith('.json'));

  const urls: Record<string, string> = {};
  const newFilenames = new Set<string>();
  for (const v of variants) {
    const style = buildMapStyle({ base: v.base, cycling: v.cycling }, v.key, v.name);
    const json = JSON.stringify(style, null, 2);
    const hash = crypto.createHash('md5').update(json).digest('hex').slice(0, 8);
    const filename = `map-style-${v.key}.${hash}.json`;
    const finalPath = path.join(publicDir, filename);
    // Write-temp+rename: rename is atomic on the same filesystem, so a crash
    // mid-write can't leave a truncated map-style-*.json behind.
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, json);
    fs.renameSync(tmpPath, finalPath);
    newFilenames.add(filename);
    urls[v.key] = `/${filename}`;
    console.log(`[map-style] Generated ${filename} (${style.layers.length} layers)`);
  }

  // Write the URL module only once both variants are on disk — this is the
  // hand-off point: anything reading map-style-url.ts after this line sees
  // filenames that exist. Same write-temp+rename for atomicity.
  const urlModulePath = path.join(root, 'src', 'lib', 'maps', 'map-style-url.ts');
  const urlModuleTmp = `${urlModulePath}.tmp`;
  fs.writeFileSync(
    urlModuleTmp,
    `// Generated by scripts/build-map-style.ts — do not edit\n` +
    `export const MAP_STYLE_URL = '${urls['default']}';\n` +
    `export const MAP_STYLE_HC_URL = '${urls['high-contrast']}';\n`,
  );
  fs.renameSync(urlModuleTmp, urlModulePath);

  // Only now delete stale old fingerprinted files — map-style-url.ts already
  // points at the new ones, so this can't strand a dangling reference.
  for (const f of staleFiles) {
    if (newFilenames.has(f)) continue; // unchanged hash — same filename regenerated, keep it
    fs.unlinkSync(path.join(publicDir, f));
  }
}
