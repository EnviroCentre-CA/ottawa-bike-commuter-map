/**
 * Fetches candidate commuter routes (suburb → downtown Ottawa) from the
 * BRouter public routing API (OpenStreetMap data, ODbL) and writes them
 * to routes.geojson.
 *
 * Each route uses the "trekking" profile, which strongly prefers
 * car-separated cycling infrastructure (the NCC multi-use pathway
 * network), plus a via-point to pin it to the intended corridor.
 *
 * BRouter's response includes the OSM way tags for every segment. We use
 * them to classify each stretch by how protected it is from car traffic:
 *
 *   carfree — dedicated cycleway, multi-use pathway, or protected track
 *   lane    — painted on-street bike lane
 *   road    — shared with car traffic, no bike infrastructure
 *
 * Routes are emitted as one Feature per contiguous safety stretch, all
 * sharing the route's id and display properties. The map scales line
 * thickness by the `safety` property when a route is selected.
 *
 * Usage: node tools/fetch-routes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DOWNTOWN = [-75.696914, 45.419324]; // Laurier Ave W & O'Connor St

const CORRIDORS = [
  {
    id: 'orleans',
    name_en: 'Orléans',
    name_fr: 'Orléans',
    desc_en: 'Ottawa River Pathway east along the Sir George-Étienne Cartier Parkway',
    desc_fr: 'Sentier de la rivière des Outaouais, le long de la promenade Sir-George-Étienne-Cartier',
    color: '#E6194B',
    points: [
      [-75.52033, 45.48423], // Champlain St at Jeanne d'Arc
      [-75.63173, 45.46078], // left at the split to avoid gravel path
      [-75.64002, 45.45753], // south of airport
      [-75.64901, 45.45812], // west of airport
      [-75.67229, 45.45716], // right before river house
      [-75.69869, 45.42321], // Wellington and occonor
      DOWNTOWN
    ],
  },
  {
    id: 'blackburn-hamlet',
    name_en: 'Blackburn Hamlet',
    name_fr: 'Blackburn Hamlet',
    desc_en: 'From Blackburn Hamlet to downtown',
    desc_fr: 'De Blackburn Hamlet jusqu’au centre-ville',
    color: '#3CB44B',
    points: [
      [-75.56650, 45.43093], // start
      [-75.66527, 45.41254], // Hurdman
      DOWNTOWN,
    ],
  },
  {
    id: 'kanata',
    name_en: 'Kanata North',
    name_fr: 'Kanata Nord',
    desc_en: 'Watts Creek Pathway to the Ottawa River Pathway at Andrew Haydon Park',
    desc_fr: 'Sentier du ruisseau Watts jusqu’au sentier de la rivière des Outaouais au parc Andrew-Haydon',
    color: '#4363D8',
    points: [
      [-75.91872, 45.32040], // Kanata ave
      [-75.80812, 45.35641], // north east of Andrew Haydon park
      [-75.754068, 45.395383], // Scott St
      DOWNTOWN
    ],
  },
  {
    id: 'stittsville',
    name_en: 'Stittsville / Kanata South',
    name_fr: 'Stittsville / Kanata Sud',
    desc_en: 'Trans Canada Trail through Bells Corners, joining the Watts Creek Pathway',
    desc_fr: 'Sentier transcanadien via Bells Corners, rejoignant le sentier du ruisseau Watts',
    color: '#911EB4',
    points: [[-75.9250, 45.2585], [-75.83670, 45.32471], DOWNTOWN],
  },
  {
    id: 'nepean',
    name_en: 'Nepean',
    name_fr: 'Nepean',
    desc_en: 'Through Nepean to downtown',
    desc_fr: 'À travers Nepean jusqu’au centre-ville',
    color: '#9A6324',
    points: [
      [-75.76896, 45.33831], // start
      [-75.76486, 45.35831], // Iris
      [-75.69895, 45.39787], // Madawaska
      [-75.68704, 45.40186], // fifth
      DOWNTOWN,
    ],
  },
  {
    id: 'barrhaven',
    name_en: 'Barrhaven',
    name_fr: 'Barrhaven',
    desc_en: 'From Strandherd north along the Woodroffe Avenue pathway, then Albert Street to the Laurier bike lane',
    desc_fr: 'De Strandherd vers le nord par le sentier de l’avenue Woodroffe, puis la rue Albert jusqu’à la bande cyclable Laurier',
    color: '#F58231',
    points: [
      [-75.72704, 45.27536], // Strandherd Dr at Greenpointe Park
      [-75.735882, 45.307277], // Woodroffe Ave corridor (south) — keeps route off Prince of Wales
      [-75.727046, 45.346903], // Woodroffe Ave corridor (north)
      [-75.732923, 45.357044], // capilano
      [-75.72176, 45.40992], // Albert St corridor cycleway east of Bayview
      [-75.71399, 45.41252], // Albert St near booth
      [-75.70911, 45.41520], // Slater St near new library
      [-75.70723, 45.41590], // path along Tech Wall Dog Park (Bronson/Slater to Laurier)
      [-75.70510, 45.41599], // Laurier Ave separated cycle track
      DOWNTOWN,
    ],
  },
  {
    id: 'south-keys',
    name_en: 'South Keys / Hunt Club',
    name_fr: 'South Keys / Hunt Club',
    desc_en: 'Sawmill Creek Pathway to the Rideau Canal Eastern Pathway',
    desc_fr: 'Sentier du ruisseau Sawmill jusqu’au sentier est du canal Rideau',
    color: '#F032E6',
    points: [
      [-75.6478, 45.3524], // start
      [-75.67400, 45.38201], // Sawmill Creek / canal corridor
      [-75.678811, 45.398451], // early left off Riverdale Ave onto Echo Dr
      DOWNTOWN,
    ],
  },
  {
    id: 'findlay-creek',
    name_en: 'Findlay Creek',
    name_fr: 'Findlay Creek',
    desc_en: 'From Findlay Creek to downtown',
    desc_fr: 'De Findlay Creek jusqu’au centre-ville',
    color: '#000075',
    points: [
      [-75.601977, 45.317435], // start at Dzifa's new house :) 
      [-75.67400, 45.38201], // Sawmill Creek / canal corridor
      [-75.678811, 45.398451], // early left off Riverdale Ave onto Echo Dr
      [-75.680142, 45.418484], // canal pathway near downtown
      DOWNTOWN,
    ],
  },
  {
    id: 'alta-vista',
    name_en: 'Alta Vista',
    name_fr: 'Alta Vista',
    desc_en: 'From Alta Vista to downtown',
    desc_fr: 'D’Alta Vista jusqu’au centre-ville',
    color: '#469990',
    points: [
      [-75.627150, 45.394982], // start
      DOWNTOWN,
    ],
  },
  {
    id: 'vanier',
    name_en: 'Vanier',
    name_fr: 'Vanier',
    desc_en: 'From Vanier to downtown',
    desc_fr: 'De Vanier jusqu’au centre-ville',
    color: '#808000',
    points: [
      [-75.643666, 45.434086], // start, 
      [-75.657432, 45.431567], // via
      [-75.670478, 45.430130], // via
      DOWNTOWN,
    ],
  },
];

// ---------------------------------------------------------------------------
// Manual geometry trims
// ---------------------------------------------------------------------------
// Some OSM crossings force the router into tiny overshoot knots (e.g. using
// the far crosswalk and doubling back). Cosmetic only — drop any track
// point that falls inside these boxes so the line turns cleanly.
// bbox: [minLon, minLat, maxLon, maxLat]

const MANUAL_TRIMS = {
  // Wellington -> O'Connor left turn: drop the two crossing points west of
  // the junction so the line follows O'Connor's real alignment (per OSM:
  // 45.42265,-75.69991 -> 45.42257,-75.69984 -> 45.42200,-75.69935)
  orleans: [[-75.70010, 45.4224, -75.69993, 45.4227]],
  // Madawaska Dr right turn: drop the little out-and-back stub west of the junction
  nepean: [[-75.69900, 45.39784, -75.69894, 45.39788]],
};

function applyTrims(coordinates, boxes) {
  if (!boxes) return coordinates;
  return coordinates.filter(([lon, lat]) =>
    !boxes.some(([x1, y1, x2, y2]) => lon >= x1 && lon <= x2 && lat >= y1 && lat <= y2));
}

// ---------------------------------------------------------------------------
// Safety classification from OSM way tags
// ---------------------------------------------------------------------------

// Ways that are car-free cycling infrastructure on their own.
const CAR_FREE_HIGHWAYS = new Set([
  'cycleway', 'path', 'track', 'bridleway',
]);

// Foot-first ways. These are only credited as car-free cycling infrastructure
// when OSM says bikes may use them — that is how genuine multi-use pathways are
// tagged. A plain sidewalk or street crossing is car-free in the literal sense
// but is not somewhere you ride, so counting it would overstate how protected
// a route is.
const FOOT_HIGHWAYS = new Set(['footway', 'pedestrian', 'steps']);
const BIKES_ALLOWED = new Set(['yes', 'designated', 'permissive']);

function parseWayTags(str) {
  const tags = {};
  for (const kv of String(str || '').split(' ')) {
    const i = kv.indexOf('=');
    if (i > 0) tags[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return tags;
}

function classify(wayTagsStr) {
  const tags = parseWayTags(wayTagsStr);
  if (CAR_FREE_HIGHWAYS.has(tags.highway)) return 'carfree';
  if (FOOT_HIGHWAYS.has(tags.highway)) {
    return BIKES_ALLOWED.has(tags.bicycle) ? 'carfree' : 'road';
  }

  const cyclewayValues = [
    tags.cycleway, tags['cycleway:left'], tags['cycleway:right'], tags['cycleway:both'],
  ].filter(Boolean);
  if (cyclewayValues.some(v => v === 'track' || v === 'separate')) return 'carfree';
  if (cyclewayValues.some(v => /lane|shared|share_busway|opposite/.test(v))) return 'lane';

  return 'road';
}

// ---------------------------------------------------------------------------
// Split a BRouter track into contiguous safety stretches
// ---------------------------------------------------------------------------

/**
 * BRouter's `messages` property is a table: header row, then one row per
 * segment whose end point is (Longitude/1e6, Latitude/1e6) and whose
 * WayTags describe the OSM way leading to it.
 */
function splitBySafety(coordinates, messages) {
  const header = messages[0];
  const iLon = header.indexOf('Longitude');
  const iLat = header.indexOf('Latitude');
  const iDist = header.indexOf('Distance');
  const iTags = header.indexOf('WayTags');

  const coordKey = c => `${Math.round(c[0] * 1e6)},${Math.round(c[1] * 1e6)}`;

  // All indices for each coordinate key (crossings can repeat a point)
  const keyIndices = new Map();
  coordinates.forEach((c, i) => {
    const k = coordKey(c);
    if (!keyIndices.has(k)) keyIndices.set(k, []);
    keyIndices.get(k).push(i);
  });

  const stretches = []; // { safety, coords, meters }
  let cur = 0; // index into coordinates of current stretch start

  for (const row of messages.slice(1)) {
    const endKey = `${row[iLon]},${row[iLat]}`;
    const end = keyIndices.get(endKey)?.find(i => i > cur);
    if (end === undefined) continue; // endpoint trimmed away or zero-length

    const safety = classify(row[iTags]);
    const meters = Number(row[iDist]) || 0;
    const coords = coordinates.slice(cur, end + 1);

    const prev = stretches[stretches.length - 1];
    if (prev && prev.safety === safety) {
      prev.coords.push(...coords.slice(1));
      prev.meters += meters;
    } else {
      stretches.push({ safety, coords: [...coords], meters });
    }
    cur = end;
  }

  // Any trailing coordinates (shouldn't happen, but be safe)
  if (cur < coordinates.length - 1 && stretches.length) {
    stretches[stretches.length - 1].coords.push(...coordinates.slice(cur + 1));
  }

  return stretches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const root = path.resolve(import.meta.dirname, '..');
const features = [];

for (const c of CORRIDORS) {
  const lonlats = c.points.map(p => p.join(',')).join('|');
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`;
  process.stdout.write(`Fetching ${c.id}... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const gj = await res.json();
  const f = gj.features[0];
  const km = Math.round(Number(f.properties['track-length']) / 100) / 10;
  const minutes = Math.round((km / 18) * 60); // 18 km/h relaxed commuting pace

  const trimmed = applyTrims(f.geometry.coordinates, MANUAL_TRIMS[c.id]);
  const stretches = splitBySafety(trimmed, f.properties.messages);
  const carFreeMeters = stretches
    .filter(s => s.safety === 'carfree')
    .reduce((sum, s) => sum + s.meters, 0);
  const carfreePct = Math.round((carFreeMeters / (km * 1000)) * 100);

  for (const s of stretches) {
    features.push({
      type: 'Feature',
      properties: {
        id: c.id,
        name_en: c.name_en,
        name_fr: c.name_fr,
        desc_en: c.desc_en,
        desc_fr: c.desc_fr,
        color: c.color,
        distance_km: km,
        minutes,
        carfree_pct: carfreePct,
        safety: s.safety,
      },
      geometry: {
        type: 'LineString',
        // strip elevation, keep [lon, lat], 5-decimal precision (~1 m)
        coordinates: s.coords.map(pt => [
          Math.round(pt[0] * 1e5) / 1e5,
          Math.round(pt[1] * 1e5) / 1e5,
        ]),
      },
    });
  }

  console.log(`${km} km (~${minutes} min), ${stretches.length} stretches, ${carfreePct}% car-free`);
  await new Promise(r => setTimeout(r, 1500)); // be polite to the public server
}

const out = { type: 'FeatureCollection', features };
fs.writeFileSync(path.join(root, 'routes.geojson'), JSON.stringify(out));
console.log(`Wrote routes.geojson (${features.length} features, ${CORRIDORS.length} routes)`);
