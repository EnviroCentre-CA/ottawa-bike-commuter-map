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
 * Directional segments
 * --------------------
 * Most corridors are a single `points` array, ridden the same way both ways.
 * A corridor may instead supply `segments`, each routed separately:
 *
 *   { points: [...] }                 ridden in both directions
 *   { dir: 'towork', points: [...] }  outbound only (suburb -> downtown)
 *   { dir: 'home',   points: [...] }  return only (downtown -> suburb)
 *
 * Consecutive segments must share an endpoint so the drawn lines meet. A
 * `home` segment is still *written* suburb-first, but its geometry is
 * reversed on output so the line runs downtown -> suburb; the map draws
 * arrows along the coordinate order, so that reversal is what makes the
 * homeward arrows point homeward. Features from a directional segment carry
 * a `dir` property; shared ones have none.
 *
 * Usage: node tools/fetch-routes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DOWNTOWN = [-75.696914, 45.419324]; // Laurier Ave W & O'Connor St

// Where the Vanier route's two directions part company and meet again. Both
// sit on the line the router already draws, so the branches join cleanly.
const SPLIT = [-75.63992, 45.43497];  // corner where the outbound leg turns north
const REJOIN = [-75.64834, 45.43224]; // on the pathway, ~30 m from the requested point

const CORRIDORS = [
  {
    id: 'orleans-south',
    name_en: 'Orléans South',
    name_fr: 'Orléans-Sud',
    desc_en: 'North on Portobello and Trim Road, then the Ottawa River Pathway west',
    desc_fr: 'Vers le nord par Portobello et le chemin Trim, puis le sentier de la rivière des Outaouais vers l’ouest',
    color: '#800000',
    points: [
      [-75.463397, 45.459442], // start, Nantes St (mid-block, east of Portobello)
      [-75.465025, 45.478363], // Portobello Blvd, north end
      [-75.477830, 45.489322], // Trim Rd, over Highway 174
      [-75.481182, 45.498095], // Trim Rd, north end at the river
      [-75.482415, 45.497338], // two-way bike lane, south side of Jeanne-d'Arc Blvd N
      [-75.493933, 45.493537], // Ottawa River Pathway, heading west
      // From here it shares the Orléans corridor exactly
      [-75.63173, 45.46078], // left at the split to avoid gravel path
      [-75.64002, 45.45753], // south of airport
      [-75.64901, 45.45812], // west of airport
      [-75.67229, 45.45716], // right before river house
      [-75.69869, 45.42321], // Wellington and occonor
      DOWNTOWN,
    ],
  },
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
      [-75.623446, 45.421630], // Cyrville Rd at Lavrie Ave — leave the diagonal pathway here
      [-75.622716, 45.419368], // Kenaston St, east end
      [-75.629164, 45.416648], // Kenaston St, west end
      [-75.633516, 45.419068], // multi-use pathway (keeps it off the intersection to the south)
      [-75.634724, 45.419118], // bike crossing at the intersection just west
      [-75.66527, 45.41254], // Hurdman
      DOWNTOWN,
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
    id: 'alta-vista',
    name_en: 'Alta Vista',
    name_fr: 'Alta Vista',
    desc_en: 'From Alta Vista to downtown',
    desc_fr: 'D’Alta Vista jusqu’au centre-ville',
    color: '#bace0c',
    points: [
      [-75.627150, 45.394982], // start
      [-75.648404, 45.395360], // Saunders Rd, before the turn west onto Billings Ave
      [-75.668822, 45.394078], // Billings Ave, west end near John Murphy Park
      // Staircase north through the pathways east of Riverside Dr — four
      // via-points because each leg is short and the router otherwise cuts
      // across to Alta Vista Dr instead.
      [-75.667757, 45.396604],
      [-75.668635, 45.397303],
      [-75.667513, 45.398849], // last jog before Smyth Rd / Rideau River Eastern Pathway
      DOWNTOWN,
    ],
  },
  {
    id: 'vanier',
    name_en: 'Vanier',
    name_fr: 'Vanier',
    desc_en: 'From Vanier to downtown',
    desc_fr: 'De Vanier jusqu’au centre-ville',
    color: '#3dcbff',
    // Vanier is ridden slightly differently each way, so it is defined as
    // segments rather than one `points` array (see "Directional segments").
    segments: [
      {
        points: [
          // Start extended northeast from the former start at
          // -75.643666,45.434086; the route still passes within ~25 m of that
          // old point on the homeward leg below.
          [-75.623926, 45.443348], // start
          [-75.625204, 45.441279], // Den Haag Dr
          [-75.631610, 45.438584], // Borealis Cres
          [-75.633193, 45.436673], // cut-through path, exits onto La Cité Private
          SPLIT,
        ],
      },
      {
        // To work: north off the corner at SPLIT, west along Guy Ave, across
        // St-Laurent Blvd, then south again to rejoin. Runs up to 260 m north
        // of the homeward leg.
        dir: 'towork',
        points: [
          SPLIT,
          [-75.641595, 45.438056],
          [-75.644506, 45.436759],
          [-75.648995, 45.435334],
          REJOIN,
        ],
      },
      {
        // Homeward: stay on McArthur Ave rather than taking the Guy Street jog
        // the router picks unaided. The one via is the McArthur/St-Laurent
        // intersection; without it the line runs ~130 m north of here.
        dir: 'home',
        points: [
          SPLIT,
          // Written suburb-first, so these read north-to-south even though the
          // ride goes the other way. Swapping them sends the router up and back
          // down St-Laurent — 1.25 km of doubling back instead of 0.93 km.
          [-75.642205, 45.433175], // east side of St-Laurent Blvd, north of McArthur
          [-75.642171, 45.432677], // McArthur Ave at St-Laurent Blvd
          REJOIN,
        ],
      },
      {
        points: [
          REJOIN,
          [-75.657432, 45.431567], // via
          [-75.670478, 45.430130], // via
          DOWNTOWN,
        ],
      },
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
  'orleans-south': [
    // Orléans South rejoins the Orléans corridor, so it hits the same corner
    [-75.70010, 45.4224, -75.69993, 45.4227],
    // Trim Rd corner: 7 m out-and-back onto the roadway before the turn
    [-75.48122, 45.49808, -75.48114, 45.49812],
    // NOTE: do not trim around 45.4972,-75.4833 — that is the east end of the
    // Ottawa River Pathway at Tweddle Rd. The route turns north off Jeanne-d'Arc
    // and then west onto the pathway there; trimming it makes the line cut the
    // corner diagonally instead of following the real two-turn geometry.
  ],
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
// Ride time
// ---------------------------------------------------------------------------
// BRouter reports its own `total-time`, but it is a constant-power physics
// estimate (100 W pushing 90 kg, per trekking.brf) for a rider who never
// stops. It puts every corridor at 19-21 km/h and actually rates signal-dense
// painted lanes *faster* than pathways, because they are straighter — the
// opposite of how these routes really ride.
//
// What separates a pathway commute from an on-street one is stopping. Measured
// over these corridors, painted lanes carry ~5.6 traffic signals per km against
// ~0.8 on cycleways. So time is built from two parts:
//
//   cruise time   distance / a free-flow speed for that kind of way
//   stop delay    an expected cost per traffic control the route passes
//
// The speeds sit deliberately close together: the spread between corridors is
// meant to come from the stop counts, observable in OSM, rather than from
// guessing that one kind of pavement is quicker. Only genuinely slower going
// (pedestrian-priority footways, unpaved surfaces) gets a real cut.
//
// SIGNAL_DELAY and STOP_DELAY are the only tuned numbers in here. See
// "Ride time estimates" in README.md before changing them.

const CRUISE_KMH = {
  cycleway: 18.5,     // dedicated cycleway, or a protected track alongside a road
  pathway: 17.5,      // path/track — shared with pedestrians, so a little slower
  lane: 18.5,         // painted on-street lane: straight and flat; the cost is the stops
  quietStreet: 18.0,  // residential and similar, no bike infrastructure
  road: 18.0,         // busier road, no bike infrastructure
  footway: 13.0,      // sidewalk-style way where bikes are merely tolerated
  footwayNoBikes: 10.0, // effectively pushing the bike
};
const QUIET_HIGHWAYS = new Set(['residential', 'living_street', 'unclassified', 'service']);
const UNPAVED = /gravel|unpaved|ground|dirt|earth|grass|sand|compacted|fine_gravel|wood|pebble|cobble/;
const UNPAVED_FACTOR = 0.80;

// Expected seconds lost per control passed — an average over stopping and not
// stopping, not a worst case. A signal is roughly a 50% chance of catching a
// ~20 s wait; cyclists tend to roll stop signs rather than halt at them.
const SIGNAL_DELAY = 10;
const STOP_DELAY = 4;
const CROSSING_DELAY = 1.5;
const BARRIER_DELAY = 3;
const SLOW_BARRIERS = /^(gate|cycle_barrier|bollard|lift_gate|swing_gate|stile|kissing_gate)$/;

// One signalised junction is several OSM nodes: the junction node itself, plus a
// signalised crossing node on each approach leg. BRouter reports every one, so
// charging each would bill a single intersection two to four times — on Vanier
// it turned 21 real junctions into 49. Controls closer together than this are
// treated as one junction, where a rider stops at most once.
//
// 30 m sits inside a stable plateau: 25 m and 40 m both give 21 junctions on
// Vanier, and only at ~60 m do genuinely separate intersections start merging.
const JUNCTION_RADIUS_M = 30;

function metersBetween(aLon, aLat, bLon, bLat) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Free-flow speed in km/h for the way a segment runs along. */
function cruiseKmh(tags) {
  const cyclewayValues = [
    tags.cycleway, tags['cycleway:left'], tags['cycleway:right'], tags['cycleway:both'],
  ].filter(Boolean);

  let kmh;
  if (tags.highway === 'cycleway') kmh = CRUISE_KMH.cycleway;
  else if (CAR_FREE_HIGHWAYS.has(tags.highway)) kmh = CRUISE_KMH.pathway;
  else if (FOOT_HIGHWAYS.has(tags.highway)) {
    kmh = BIKES_ALLOWED.has(tags.bicycle) ? CRUISE_KMH.footway : CRUISE_KMH.footwayNoBikes;
  } else if (cyclewayValues.some(v => v === 'track' || v === 'separate')) kmh = CRUISE_KMH.cycleway;
  else if (cyclewayValues.some(v => /lane|shared|share_busway|opposite/.test(v))) kmh = CRUISE_KMH.lane;
  else if (QUIET_HIGHWAYS.has(tags.highway)) kmh = CRUISE_KMH.quietStreet;
  else kmh = CRUISE_KMH.road;

  if (UNPAVED.test(tags.surface || '')) kmh *= UNPAVED_FACTOR;
  return kmh;
}

/**
 * Seconds lost at one route node, plus which kind of control it was. Checked
 * signals-first because a signalised crossing carries both `highway=crossing`
 * and `crossing=traffic_signals`, and it should count once, as a signal.
 */
function nodeDelay(tags) {
  if (tags.highway === 'traffic_signals' || tags.crossing === 'traffic_signals') {
    return { seconds: SIGNAL_DELAY, kind: 'signals' };
  }
  if (tags.highway === 'stop' || tags.highway === 'give_way') {
    return { seconds: STOP_DELAY, kind: 'stopSigns' };
  }
  if (tags.highway === 'crossing') return { seconds: CROSSING_DELAY, kind: 'crossings' };
  if (SLOW_BARRIERS.test(tags.barrier || '')) return { seconds: BARRIER_DELAY, kind: 'barriers' };
  return { seconds: 0, kind: null };
}

/**
 * Walk every row of a segment's message table for cruise time, and collect the
 * traffic controls it passes without costing them yet — de-duplication has to
 * happen across the whole direction, because a junction sitting on a segment
 * boundary (REJOIN is one) appears at the end of one segment and the start of
 * the next.
 *
 * Deliberately independent of splitBySafety, so the figures cover the whole
 * segment even where a manual trim drops a point from the drawn line.
 *
 * NodeTags use the same "k=v k=v" encoding as WayTags, so parseWayTags reads both.
 */
function estimateTiming(messages) {
  const header = messages[0];
  const iLon = header.indexOf('Longitude');
  const iLat = header.indexOf('Latitude');
  const iDist = header.indexOf('Distance');
  const iWayTags = header.indexOf('WayTags');
  const iNodeTags = header.indexOf('NodeTags');

  let cruiseSeconds = 0;
  const controls = [];
  for (const row of messages.slice(1)) {
    const meters = Number(row[iDist]) || 0;
    cruiseSeconds += meters / (cruiseKmh(parseWayTags(row[iWayTags])) * (1000 / 3600));

    const { seconds, kind } = nodeDelay(parseWayTags(row[iNodeTags]));
    if (kind) {
      controls.push({
        lon: Number(row[iLon]) / 1e6,
        lat: Number(row[iLat]) / 1e6,
        seconds, kind,
      });
    }
  }
  return { cruiseSeconds, controls };
}

/**
 * Collapse controls belonging to the same junction, then cost them. Expects the
 * list in travel order, so consecutive entries can be chained into a cluster;
 * a cluster is charged once, for whichever of its controls costs most (a
 * signalised junction that also carries crossing nodes is a signal, not both).
 */
function summarizeControls(controls) {
  const out = { delaySeconds: 0, signals: 0, stopSigns: 0, crossings: 0, barriers: 0 };
  let cluster = null;
  const flush = () => {
    if (!cluster) return;
    out.delaySeconds += cluster.seconds;
    out[cluster.kind]++;
    cluster = null;
  };

  for (const c of controls) {
    if (cluster && metersBetween(cluster.lon, cluster.lat, c.lon, c.lat) <= JUNCTION_RADIUS_M) {
      if (c.seconds > cluster.seconds) { cluster.seconds = c.seconds; cluster.kind = c.kind; }
      // Chain from the newest node, so a wide junction stays one cluster.
      cluster.lon = c.lon; cluster.lat = c.lat;
    } else {
      flush();
      cluster = { ...c };
    }
  }
  flush();
  return out;
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

/**
 * One BRouter request, retried on failure. The public instance sheds load with
 * "killed by thread-priority-watchdog", which is transient — without a retry a
 * single blip throws away every route fetched so far.
 */
async function fetchSegment(points) {
  const lonlats = points.map(p => p.join(',')).join('|');
  const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`;

  const ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    let problem;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const f = (await res.json()).features[0];
        return {
          meters: Number(f.properties['track-length']),
          coordinates: f.geometry.coordinates,
          messages: f.properties.messages,
        };
      }
      problem = `${res.status} ${(await res.text()).trim()}`;
    } catch (err) {
      problem = err.message;
    }

    if (attempt === ATTEMPTS) {
      console.error(`FAILED after ${ATTEMPTS} attempts: ${problem}`);
      process.exit(1);
    }
    const backoff = 5000 * attempt;
    process.stdout.write(`\n  retry ${attempt}/${ATTEMPTS - 1} in ${backoff / 1000}s (${problem})... `);
    await new Promise(r => setTimeout(r, backoff));
  }
}

for (const c of CORRIDORS) {
  // A plain `points` corridor is just the one-segment case.
  const segments = c.segments || [{ points: c.points }];
  process.stdout.write(`Fetching ${c.id}... `);

  const built = [];
  for (const [i, seg] of segments.entries()) {
    if (i) await new Promise(r => setTimeout(r, 1500)); // be polite between segments
    const r = await fetchSegment(seg.points);
    const trimmed = applyTrims(r.coordinates, MANUAL_TRIMS[c.id]);
    let stretches = splitBySafety(trimmed, r.messages);
    // Homeward segments are routed suburb-first like everything else; flip them
    // so the line reads downtown -> suburb and its arrows point homeward.
    if (seg.dir === 'home') {
      stretches = stretches.reverse().map(s => ({ ...s, coords: [...s.coords].reverse() }));
    }
    built.push({ dir: seg.dir, meters: r.meters, stretches, timing: estimateTiming(r.messages) });
  }

  // Everything below is per direction: shared segments plus that direction's own.
  const forDir = dir => built.filter(s => !s.dir || s.dir === dir);
  const metersFor = dir => forDir(dir).reduce((sum, s) => sum + s.meters, 0);
  // Cruise time adds up per segment, but controls are de-duplicated across the
  // whole direction at once. Segments are listed start-to-downtown and a `home`
  // segment is written suburb-first like the rest, so concatenating their
  // controls gives one spatially continuous run for the clustering to walk.
  const timingFor = dir => {
    const segs = forDir(dir);
    const cruiseSeconds = segs.reduce((sum, s) => sum + s.timing.cruiseSeconds, 0);
    const controls = summarizeControls(segs.flatMap(s => s.timing.controls));
    return { seconds: cruiseSeconds + controls.delaySeconds, ...controls };
  };

  // The map is framed as "getting to work", so that is the headline direction.
  const outboundMeters = metersFor('towork');
  const homeMeters = metersFor('home');
  const km = Math.round(outboundMeters / 100) / 10;
  const kmHome = Math.round(homeMeters / 100) / 10;

  // Times come off raw metres, not the rounded km, so a 0.05 km rounding does
  // not move the estimate.
  const outboundTiming = timingFor('towork');
  const homeTiming = timingFor('home');
  const minutes = Math.round(outboundTiming.seconds / 60);
  const minutesHome = Math.round(homeTiming.seconds / 60);
  const stopMinutes = Math.round(outboundTiming.delaySeconds / 60);

  const outbound = forDir('towork').flatMap(s => s.stretches);
  const carFreeMeters = outbound
    .filter(s => s.safety === 'carfree')
    .reduce((sum, s) => sum + s.meters, 0);
  const carfreePct = Math.round((carFreeMeters / outboundMeters) * 100);

  let count = 0;
  for (const segment of built) {
    for (const s of segment.stretches) {
      count++;
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
          // How much of `minutes` is spent stopped, and at how many lights —
          // the popup uses these to explain why a pathway route rides quicker.
          stop_minutes: stopMinutes,
          signals: outboundTiming.signals,
          // Only one-way sections are tagged; the map keys its arrows off this.
          ...(segment.dir ? { dir: segment.dir } : {}),
          ...(kmHome !== km ? { distance_km_home: kmHome } : {}),
          ...(minutesHome !== minutes ? { minutes_home: minutesHome } : {}),
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
  }

  const twoWay = kmHome !== km || minutesHome !== minutes
    ? `, home ${kmHome} km/${minutesHome} min` : '';
  const kmh = (outboundMeters / 1000) / (outboundTiming.seconds / 3600);
  console.log(`${km} km (~${minutes} min, ${kmh.toFixed(1)} km/h; ${stopMinutes} min stopped at ` +
    `${outboundTiming.signals} lights + ${outboundTiming.stopSigns} stops)${twoWay}, ` +
    `${count} stretches, ${carfreePct}% car-free`);
  await new Promise(r => setTimeout(r, 1500)); // be polite to the public server
}

const out = { type: 'FeatureCollection', features };
fs.writeFileSync(path.join(root, 'routes.geojson'), JSON.stringify(out));
console.log(`Wrote routes.geojson (${features.length} features, ${CORRIDORS.length} routes)`);
