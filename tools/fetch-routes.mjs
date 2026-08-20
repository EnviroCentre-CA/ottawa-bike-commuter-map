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

// Barrhaven and Stittsville run the same way from here in, so the approach east
// of this point is defined once. Both corridors already passed through it before
// they were joined up, so neither approach had to move.
const BAYVIEW_JOIN = [-75.722161, 45.409803]; // west end of the Bayview pathway link

/**
 * The shared run from BAYVIEW_JOIN to downtown, ridden the same way in both
 * directions. A function rather than a constant so each corridor gets its own
 * arrays and neither can reach the other's geometry.
 */
const bayviewToDowntown = () => [
  [-75.719523, 45.411525], // MUP by Bayview station
  // Four turns on the paved path just west of Booth St. Unaided the router
  // takes a line ~10-15 m north of here that alternates between roadway and
  // pathway; these keep it on the path, which OSM tags highway=path with
  // paving stones, so the whole stretch reads car-free.
  [-75.714554, 45.413586],
  [-75.714442, 45.413521],
  [-75.713703, 45.413709],
  [-75.713720, 45.413847],
  [-75.711421, 45.415627], // MUP going towards pooleys bridge
  // Mid-block on the Commissioner St roadway. The obvious point a little further
  // north sits closer to the east sidewalk than to the street, and BRouter took
  // it literally: it climbed 90 m past the junction to find a crossing, then came
  // back down 175 m of `highway=footway`. One via on the carriageway instead
  // keeps the whole block on the street.
  [-75.709468, 45.416144], // Commissioner St
  [-75.708885, 45.416120], // MUP on Albert by Commissioner st
  [-75.70723, 45.41590], // path along Tech Wall Dog Park (Bronson/Slater to Laurier)
  [-75.70510, 45.41599], // Laurier Ave separated cycle track
  DOWNTOWN,
];

const CORRIDORS = [
  {
    id: 'orleans-south',
    name_en: 'Orléans South',
    name_fr: 'Orléans-Sud',
    desc_en: 'North on Portobello and Trim Road, then the Ottawa River Pathway west',
    desc_fr: 'Vers le nord par Portobello et le chemin Trim, puis le sentier de la rivière des Outaouais vers l’ouest',
    color: '#800000',
    points: [
      [-75.463564, 45.454130], // Francois Dupuis rec renter
      [-75.464442, 45.454202], // 
      [-75.464572, 45.454675], //
      [-75.464954, 45.454985], // 
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
      [-75.692892, 45.424716], // just past rideau street
      [-75.688458, 45.422525], // East MUP canal crossing over Colonel By
      [-75.687680, 45.422979], // King Edward intersection
      [-75.696955, 45.419474], // Downtown west bound bike lane
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
      [-75.520218, 45.480506], // Oc transpo park and ride
      [-75.521241, 45.479247], // MUP along highway
      [-75.529584, 45.478413], // Bilberry drive
      [-75.533592, 45.485626], // merging into river MUP
      [-75.63173, 45.46078], // left at the split to avoid gravel path
      [-75.64002, 45.45753], // south of airport
      [-75.64901, 45.45812], // west of airport
      [-75.67229, 45.45716], // right before river house
      [-75.692892, 45.424716], // just past rideau street
      [-75.683586, 45.420385], // corktown foodbridge
      [-75.685627, 45.420732], // west side canal MUP
      [-75.690204, 45.422572], // Laurier on ramp by canal
      [-75.696955, 45.419474], // Downtown west bound bike lane
    ],
  },
  {
    // NOTE: the id still reads blackburn-hamlet from when this corridor carried
    // that name. The Blackburn Hamlet label now belongs to the `vanier` corridor
    // below, so do not go by ids alone when editing these two.
    id: 'blackburn-hamlet',
    name_en: 'Pineview',
    name_fr: 'Pineview',
    desc_en: 'West on Meadowbrook Road and Cyrville Road, then Kenaston Street to the Hurdman pathway',
    desc_fr: 'Vers l’ouest par le chemin Meadowbrook et le chemin Cyrville, puis la rue Kenaston jusqu’au sentier de Hurdman',
    color: '#3CB44B',
    points: [
      [-75.602784, 45.423789], // start beaverpond st
      [-75.605302, 45.423079], // ridgebrook dr
      [-75.608811, 45.419557], // meadowbrook road
      [-75.623446, 45.421630], // Cyrville Rd at Labrie Ave — leave the diagonal pathway here
      [-75.622716, 45.419368], // Kenaston St, east end
      [-75.629164, 45.416648], // Kenaston St, west end
      [-75.633516, 45.419068], // multi-use pathway (keeps it off the intersection to the south)
      [-75.634724, 45.419118], // bike crossing at the intersection just west
      [-75.66527, 45.41254], // Hurdman
      [-75.696955, 45.419474], // Downtown west bound bike lane
        ],
  },
  {
    id: 'stittsville',
    name_en: 'Stittsville / Kanata South',
    name_fr: 'Stittsville / Kanata Sud',
    desc_en: 'Trans Canada Trail through Bells Corners, joining the Watts Creek Pathway',
    desc_fr: 'Sentier transcanadien via Bells Corners, rejoignant le sentier du ruisseau Watts',
    color: '#911EB4',
    // Joins the Barrhaven alignment at Bayview and shares it in
    // (see `bayviewToDowntown`).
    points: [
      [-75.911035, 45.264296], //Gouldberg rec center
      [-75.848226, 45.317134], // Mup near robertson going north
      [-75.861645, 45.341033], // Mup near Wesley Clover Park
      [-75.754068, 45.395383], // Scott St
      BAYVIEW_JOIN,
      ...bayviewToDowntown(),
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
      [-75.923311, 45.323549], // top of Whalen Park
      [-75.906533, 45.322746], // MUP into beaverbrook
      [-75.904470, 45.324698], // Mup into Leacock dr
      [-75.891148, 45.325284], // Armstrong park
      [-75.885796, 45.338006], // Watts creek pathway
      [-75.80812, 45.35641], // north east of Andrew Haydon park
      [-75.717616, 45.418043], // Mup behind war museum 
      [-75.701733, 45.425875], // Mup behind Parliament 
      [-75.690204, 45.422572], // Laurier on ramp by canal 
      [-75.696955, 45.419474], // Downtown west bound bike lane
    ],
  },
  {
    id: 'nepean',
    name_en: 'Nepean',
    name_fr: 'Nepean',
    desc_en: 'From Iris Street to Dow’s Lake, then the Rideau Canal pathway past Lansdowne',
    desc_fr: 'De la rue Iris au lac Dow, puis le sentier du canal Rideau en passant par Lansdowne',
    color: '#fff200eb',
    points: [
      [-75.775765, 45.333048], // start
      [-75.769684, 45.355720], // Iris
      [-75.767022, 45.353536], // Iris saw creek pathway
      [-75.763871, 45.352745], // left side of woodroofe
      [-75.764005, 45.353094], // north left side of woodroofe
      [-75.763464, 45.353210], // right side of woodroofe
      [-75.706385, 45.396488], // dows lake
      [-75.679566, 45.400944], // landsdowne
      [-75.680868, 45.418411], // canal bend
      [-75.689719, 45.422542], // laurier
      [-75.696955, 45.419474], // Downtown west bound bike lane
    ],
  },
  {
    id: 'barrhaven',
    name_en: 'Barrhaven',
    name_fr: 'Barrhaven',
    desc_en: 'From Strandherd north along the Woodroffe Avenue pathway, then Albert Street to the Laurier bike lane',
    desc_fr: 'De Strandherd vers le nord par le sentier de l’avenue Woodroffe, puis la rue Albert jusqu’à la bande cyclable Laurier',
    color: '#F58231',
    // Shares everything from Bayview in with Stittsville
    // (see `bayviewToDowntown`).
    points: [
      [-75.730999, 45.281795], // Stinton park near Berrigan dr
      [-75.727145, 45.292025], // near longfields on MUP
      [-75.730717, 45.298396], // near fallowfield on MUP
      [-75.735882, 45.307277], // Woodroffe Ave corridor (south) — keeps route off Prince of Wales
      [-75.746076, 45.325685], // Nepean Sportsplex
      [-75.742834, 45.326941], // Nepean Sportsplex on MUP further down
      [-75.744826, 45.330082], // Nepean Sportsplex hunt club crossing
      [-75.727046, 45.346903], // Woodroffe Ave corridor (north)
      [-75.732923, 45.357044], // capilano
      [-75.724025, 45.360236], // Buffalo Cir
      [-75.718841, 45.364266], // Deer Park road
      [-75.715937, 45.369262], // Malibu Terrace
      [-75.715320, 45.369688], // protected bike lane on Fisher
      BAYVIEW_JOIN,
      ...bayviewToDowntown(),
    ],
  },
  {
    // Covers the retired south-keys corridor too: this route passes within 80 m
    // of the Juno Beach bridge on its way up the Sawmill Creek Pathway.
    id: 'findlay-creek',
    name_en: 'Findlay Creek / South Keys',
    name_fr: 'Findlay Creek / South Keys',
    desc_en: 'Through Findlay Creek to Albion Road, then the Sawmill Creek Pathway and the Rideau Canal',
    desc_fr: 'À travers Findlay Creek jusqu’au chemin Albion, puis le sentier du ruisseau Sawmill et le canal Rideau',
    color: '#000075',
    // One line, ridden the same way in both directions. The corridor used to
    // split through the Carleton campus area, but two parallel lines there are
    // hard to read on the poster, so the homeward alignment now stands for both.
    points: [
      [-75.604132, 45.315828], // start Dragonfly Park
      [-75.607717, 45.315648], // spartina st
      [-75.611031, 45.315014], // diamond jubilee park
      [-75.614645, 45.313090], // creekview way
      [-75.616217, 45.312538], // creekview way further down
      [-75.618419, 45.314016], // bunchberry way
      [-75.619606, 45.313533], // cut through towards Albion
      [-75.624703, 45.316483], // Quinn road
      [-75.684639, 45.373423], // Brookfield MUP
      [-75.693516, 45.372390], // hogs back
      [-75.699552, 45.377657], // MUP near Vincent Massey
      [-75.695193, 45.381808], // Rideau River footbridge
      [-75.693244, 45.386106], // east of Carleton campus
      [-75.688308, 45.388219], // Brewers park
      [-75.691270, 45.393089], // Seneca st
      [-75.687396, 45.421497], // canal pathway near downtown
      [-75.696955, 45.419474], // Downtown west bound bike lane
    ],
  },
  {
    // NOTE: the id still reads alta-vista from when the corridor started there.
    // It now runs up from Greenboro via Conroy Rd, passing through Alta Vista.
    id: 'alta-vista',
    name_en: 'Greenboro',
    name_fr: 'Greenboro',
    desc_en: 'From Greenboro up the Conroy Road pathway, then through Alta Vista to downtown',
    desc_fr: 'De Greenboro par le sentier du chemin Conroy, puis à travers Alta Vista jusqu’au centre-ville',
    color: '#9A6324',
    points: [
      [-75.635208, 45.362743], // start at community center west of Bruff park
      [-75.620919, 45.366827], // mup on the left side of Conroy rd
      [-75.628727, 45.381330], // mup on the left side of Conroy rd near st laurent bl
      [-75.630547, 45.383532], // left side of intersection walkley and conroy
      [-75.630204, 45.383671], // right side of intersection walkley and conroy
      [-75.630450, 45.383948], // on mup north of intersection walkley and conroy
      [-75.668538, 45.393248], // Pleasant park
      [-75.667757, 45.396604],
      [-75.668635, 45.397303],
      [-75.667513, 45.398849], // last jog before Smyth Rd / Rideau River Eastern Pathway
      DOWNTOWN,
    ],
  },
  {
    // NOTE: the id still reads vanier from when this corridor carried that name.
    // It is now the Blackburn Hamlet / Gloucester route; the Pineview corridor
    // above is the one whose id says blackburn-hamlet.
    id: 'vanier',
    name_en: 'Blackburn Hamlet / Gloucester',
    name_fr: 'Blackburn Hamlet / Gloucester',
    desc_en: 'Pathway west past Blair Station, then McArthur Avenue through Vanier',
    desc_fr: 'Sentier vers l’ouest en passant par la station Blair, puis l’avenue McArthur à travers Vanier',
    color: '#3dcbff',
    // Vanier is ridden slightly differently each way, so it is defined as
    // segments rather than one `points` array (see "Directional segments").
    segments: [
      {
        points: [
          // Start extended northeast from the former start at
          // -75.643666,45.434086; the route still passes within ~25 m of that
          // old point on the homeward leg below.
          [-75.576289, 45.434491], // start
          [-75.576351, 45.450995], // on trail
          [-75.576693, 45.455552], // on trail further down
          [-75.573675, 45.459104], // on trail further down
          [-75.574299, 45.458574], // on trail further down
          [-75.586066, 45.449460], // just south of montreal road
          [-75.608481, 45.431738], // blair bike racks
          [-75.609129, 45.431774], // under blair overhead bridge
          [-75.617440, 45.428456], // city centre park
          [-75.622781, 45.427815], // palmerston dr
          [-75.632826, 45.436133], // cut through to la cite private
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
          [-75.696955, 45.419474], // Downtown west bound bike lane
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
// 40 m, because downtown's multi-lane crossings are wider than the suburban ones
// this was first tuned on: at 30 m the Orléans route still billed several single
// intersections twice, as a `crossing=no` junction node plus a
// `crossing=traffic_signals` node 40 m past it. 40 m stays inside the plateau
// measured on Vanier (25 m and 40 m both give 21 there). Do not push much past
// this — downtown blocks are about 100 m, so ~80 m starts merging genuinely
// separate intersections.
const JUNCTION_RADIUS_M = 40;

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
  // Per-row trace, so the time-remaining pills can be placed on the same model
  // that produces the headline figure rather than on a second estimate.
  const steps = [];
  for (const row of messages.slice(1)) {
    const meters = Number(row[iDist]) || 0;
    const rowCruise = meters / (cruiseKmh(parseWayTags(row[iWayTags])) * (1000 / 3600));
    cruiseSeconds += rowCruise;

    const lon = Number(row[iLon]) / 1e6;
    const lat = Number(row[iLat]) / 1e6;
    const { seconds, kind } = nodeDelay(parseWayTags(row[iNodeTags]));
    let controlIndex = null;
    if (kind) {
      controlIndex = controls.length;
      controls.push({ lon, lat, seconds, kind });
    }
    steps.push({ lon, lat, cruiseSeconds: rowCruise, controlIndex });
  }
  return { cruiseSeconds, controls, steps };
}

/**
 * Collapse controls belonging to the same junction, then cost them. Expects the
 * list in travel order, so consecutive entries can be chained into a cluster;
 * a cluster is charged once, for whichever of its controls costs most (a
 * signalised junction that also carries crossing nodes is a signal, not both).
 */
function summarizeControls(controls) {
  const out = { delaySeconds: 0, signals: 0, stopSigns: 0, crossings: 0, barriers: 0 };
  // Which entry in `controls` each surviving junction was charged at, and for how
  // long. Lets the pill walk put the delay at the place it is actually incurred.
  const charged = new Map();
  let cluster = null;
  const flush = () => {
    if (!cluster) return;
    out.delaySeconds += cluster.seconds;
    out[cluster.kind]++;
    charged.set(cluster.firstIndex, cluster.seconds);
    cluster = null;
  };

  controls.forEach((c, i) => {
    if (cluster && metersBetween(cluster.lon, cluster.lat, c.lon, c.lat) <= JUNCTION_RADIUS_M) {
      if (c.seconds > cluster.seconds) { cluster.seconds = c.seconds; cluster.kind = c.kind; }
      // Chain from the newest node, so a wide junction stays one cluster.
      cluster.lon = c.lon; cluster.lat = c.lat;
    } else {
      flush();
      cluster = { ...c, firstIndex: i };
    }
  });
  flush();
  return { ...out, charged };
}

// ---------------------------------------------------------------------------
// Time-remaining pills
// ---------------------------------------------------------------------------
// Markers along a route saying how long is left to downtown. Distance markers
// would be the conventional choice, but "35 min to go" is the number someone new
// to bike commuting can act on, and it also stops a long corridor reading as
// hopeless: the headline figure is the whole line end to end, while most riders
// join partway along.
//
// Quarter-hour steps, because that is how people already think about a commute.
// Routes of 50 minutes or less drop to 10-minute steps so they still get four or
// so markers: at 15 minutes a 42-minute corridor showed only two, which is thin
// signposting over 11 km.
//
// A step MUST be a whole number of minutes and a multiple of 5. Pills are round
// signposts, not readings: "1 hr 22 min left" would claim a precision the
// estimate does not have. Enforced in timePills() below.
const PILL_STEP_MINUTES = totalSeconds => (totalSeconds <= 50 * 60 ? 10 : 15);

/**
 * Positions where the remaining ride time crosses each step boundary, walking
 * the same cruise + de-duplicated delay model as the headline estimate — so a
 * pill and the route's stated time can never disagree.
 *
 * `segs` must be one direction's segments in travel order.
 */
function timePills(segs) {
  const charged = summarizeControls(segs.flatMap(s => s.timing.controls)).charged;

  const timeline = [];
  let elapsed = 0;
  let controlOffset = 0; // controls were concatenated, so indexes shift per segment
  for (const s of segs) {
    for (const step of s.timing.steps) {
      elapsed += step.cruiseSeconds;
      if (step.controlIndex !== null) {
        elapsed += charged.get(controlOffset + step.controlIndex) || 0;
      }
      timeline.push({ lon: step.lon, lat: step.lat, elapsed });
    }
    controlOffset += s.timing.controls.length;
  }

  const total = elapsed;
  const step = PILL_STEP_MINUTES(total);
  if (!Number.isInteger(step) || step % 5 !== 0) {
    console.error(`\nPILL_STEP_MINUTES gave ${step}: it must be a whole multiple of 5.`);
    process.exit(1);
  }
  const pills = [];
  // Start one step below the total so there is never a pill sitting on the start
  // point, then walk forward once per boundary.
  const firstMinutes = Math.floor((total / 60 - 1) / step) * step;
  for (let m = firstMinutes; m >= step; m -= step) {
    const hit = timeline.find(x => total - x.elapsed <= m * 60);
    if (!hit) continue;
    pills.push({
      lon: Math.round(hit.lon * 1e5) / 1e5,
      lat: Math.round(hit.lat * 1e5) / 1e5,
      minutes: m,
    });
  }
  return pills;
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

    const meters = Number(row[iDist]) || 0;
    const coords = coordinates.slice(cur, end + 1);
    const safety = classify(row[iTags]);

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
// Time-remaining markers ride in their own file rather than in routes.geojson,
// because every consumer of that file assumes each feature is a LineString.
const pills = [];

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

/**
 * Build a segment from its own coordinates instead of asking BRouter for a line.
 *
 * For a section under construction, OSM has not caught up and the router cannot
 * find the intended path at all: it detours around the missing connections, and
 * near the new library it did so through a `bicycle=no` footway. Drawing the
 * given points directly is the only way to show the real alignment until the
 * data lands. Straight lines between the supplied points, so pass enough of them
 * to describe the shape.
 *
 * `safety` has to be stated, since there are no way tags to read it from, and
 * `pace` picks the cruise speed. No signals or stop signs are charged — these
 * sections are short cut-throughs, and inventing controls to go with invented
 * geometry would be a guess on top of a guess.
 */
function literalSegment(seg) {
  const coords = seg.points;
  const safety = seg.safety || 'carfree';
  const kmh = CRUISE_KMH[seg.pace || 'pathway'];
  let meters = 0;
  const steps = [];
  for (let i = 1; i < coords.length; i++) {
    const d = metersBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    meters += d;
    steps.push({
      lon: coords[i][0], lat: coords[i][1],
      cruiseSeconds: d / (kmh * (1000 / 3600)),
      controlIndex: null,
    });
  }
  return {
    dir: seg.dir,
    meters,
    stretches: [{ safety, coords: [...coords], meters }],
    timing: { cruiseSeconds: meters / (kmh * (1000 / 3600)), controls: [], steps },
  };
}

for (const c of CORRIDORS) {
  // A plain `points` corridor is just the one-segment case.
  const segments = c.segments || [{ points: c.points }];
  process.stdout.write(`Fetching ${c.id}... `);

  const built = [];
  for (const [i, seg] of segments.entries()) {
    if (seg.literal) {
      const b = literalSegment(seg);
      if (seg.dir === 'home') {
        b.stretches = b.stretches.reverse().map(st => ({ ...st, coords: [...st.coords].reverse() }));
      }
      built.push(b);
      continue;
    }
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

  // Every corridor gets pills, and they follow the outbound direction: the figure
  // they show is time left to downtown, which is how the whole map is framed. On
  // a route with a homeward branch the branch itself carries none, since "time to
  // downtown" is not what a rider on it is asking.
  const routePills = timePills(forDir('towork'));
  for (const pill of routePills) pills.push({ route: c.id, ...pill });

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
  const pillStep = PILL_STEP_MINUTES(outboundTiming.seconds);
  console.log(`${km} km (~${minutes} min, ${kmh.toFixed(1)} km/h; ${stopMinutes} min stopped at ` +
    `${outboundTiming.signals} lights + ${outboundTiming.stopSigns} stops)${twoWay}, ` +
    `${count} stretches, ${carfreePct}% car-free, ` +
    `${routePills.length} pills every ${pillStep} min`);
  await new Promise(r => setTimeout(r, 1500)); // be polite to the public server
}


// ---------------------------------------------------------------------------
// Arrow visibility where a one-way section runs under another route
// ---------------------------------------------------------------------------

// In the all-routes view, directional arrows read as belonging to whichever line
// is drawn on top. Where a one-way section shares its alignment with another
// corridor that is drawn later, the arrows appear to describe that corridor
// instead — the retired Findlay Creek split under Greenboro on O'Connor St being
// the case that prompted this.
//
// Only a route drawn *later* can do this, since that is the one whose colour the
// reader sees; where a one-way section is drawn on top of its neighbours its own
// arrows read correctly. So split each directional feature into runs by whether a
// later corridor shadows it, and mark the rest `solo`. The map shows arrows only
// on those until a route is selected, at which point the other routes are dimmed
// and the full set of arrows is unambiguous again.
//
// Restricting this to later corridors matters: Barrhaven's outbound leg on Albert
// St is shadowed by Nepean, Kanata and Stittsville, but is drawn above all three.
// Counting those would have left it with no arrows at all while its homeward leg
// kept them — reading as though the corridor were one-way homebound only.
//
// Measured on the current corridors, a directional vertex is either within 15 m
// of another route or more than 30 m from one, with almost nothing in between,
// so the tolerance is not delicately balanced.
const SHADOW_TOLERANCE_M = 15;
// Below about one arrow spacing a run cannot show an arrow anyway, and
// alternating short runs would just make arrows flicker in and out while panning.
const MIN_RUN_M = 70;

/** Perpendicular distance in metres from point c to the segment a->b. */
function pointToSegment(c, a, b) {
  const k = Math.cos((c[1] * Math.PI) / 180);
  const px = (c[0] - a[0]) * k, py = c[1] - a[1];
  const vx = (b[0] - a[0]) * k, vy = b[1] - a[1];
  const vv = vx * vx + vy * vy;
  const t = vv ? Math.max(0, Math.min(1, (px * vx + py * vy) / vv)) : 0;
  return Math.hypot(px - t * vx, py - t * vy) * (Math.PI / 180) * 6371000;
}

function lineLength(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += metersBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return m;
}

/**
 * Replace each directional feature with one feature per run of consistent
 * shadowing. Runs share their boundary vertex so the drawn line stays unbroken,
 * and every run inherits the original properties, plus `solo` when no other
 * route shadows it.
 */
function markSoloRuns(features) {
  const directional = features.filter(f => f.properties.dir);
  if (!directional.length) return { features, report: [] };

  const out = [], report = [];
  const byRoute = new Map();
  for (const f of features) {
    const id = f.properties.id;
    if (!byRoute.has(id)) byRoute.set(id, []);
    byRoute.get(id).push(f.geometry.coordinates);
  }
  // Draw order: a corridor later in CORRIDORS is painted over the ones before it.
  const drawOrder = new Map(CORRIDORS.map((c, i) => [c.id, i]));

  const shadowedBy = (c, ownId) => {
    const own = drawOrder.get(ownId);
    for (const [id, lines] of byRoute) {
      if (drawOrder.get(id) <= own) continue; // drawn under this route, or itself
      for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
          if (pointToSegment(c, line[i - 1], line[i]) <= SHADOW_TOLERANCE_M) return id;
        }
      }
    }
    return null;
  };

  // Geometry of each route's own opposite direction, for the `both` test below.
  const opposite = new Map();
  for (const f of features) {
    if (!f.properties.dir) continue;
    const k = f.properties.id + '/' + (f.properties.dir === 'towork' ? 'home' : 'towork');
    if (!opposite.has(k)) opposite.set(k, []);
    opposite.get(k).push(f.geometry.coordinates);
  }
  const usedBothWays = (c, id, dir) => {
    for (const line of opposite.get(id + '/' + dir) || []) {
      for (let i = 1; i < line.length; i++) {
        if (pointToSegment(c, line[i - 1], line[i]) <= SHADOW_TOLERANCE_M) return true;
      }
    }
    return false;
  };

  for (const f of features) {
    if (!f.properties.dir) { out.push(f); continue; }
    const coords = f.geometry.coordinates;
    const { id, dir } = f.properties;
    // Three states per vertex, strongest first:
    //   both     — this route's other direction runs here too, so the stretch is
    //              not one-way at all and must never carry an arrow
    //   shadowed — genuinely one-way, but a later corridor covers it, so the
    //              arrow would read as that corridor's until this one is selected
    //   solo     — one-way and unobstructed
    const state = coords.map(c => usedBothWays(c, id, dir) ? 'both'
      : shadowedBy(c, id) ? 'shadowed' : 'solo');

    let runs = [];
    for (let i = 0; i < coords.length; i++) {
      if (!runs.length || runs[runs.length - 1].state !== state[i]) runs.push({ state: state[i], from: i, to: i });
      else runs[runs.length - 1].to = i;
    }

    // Absorb runs too short to carry an arrow into their longer neighbour.
    let changed = true;
    while (changed && runs.length > 1) {
      changed = false;
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        if (lineLength(coords.slice(r.from, r.to + 2)) >= MIN_RUN_M) continue;
        const prev = runs[i - 1], next = runs[i + 1];
        const target = !prev ? next : !next ? prev
          : (lineLength(coords.slice(prev.from, prev.to + 2))
             >= lineLength(coords.slice(next.from, next.to + 2)) ? prev : next);
        target.from = Math.min(target.from, r.from);
        target.to = Math.max(target.to, r.to);
        runs.splice(i, 1);
        changed = true;
        break;
      }
    }
    runs.sort((a, b) => a.from - b.from);

    for (const r of runs) {
      // +2 so consecutive runs share a vertex and the line does not gap.
      const slice = coords.slice(r.from, Math.min(r.to + 2, coords.length));
      if (slice.length < 2) continue;
      // A `both` run loses `dir` outright rather than merely losing its arrows:
      // it is shared road, so nothing downstream should describe it as one-way,
      // including the section popup.
      const props = { ...f.properties };
      if (r.state === 'both') delete props.dir;
      else if (r.state === 'solo') props.solo = 1;
      out.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: slice } });
      report.push({ id, dir, state: r.state, meters: lineLength(slice) });
    }
  }
  return { features: out, report };
}

const { features: outFeatures, report: soloReport } = markSoloRuns(features);

const out = { type: 'FeatureCollection', features: outFeatures };
fs.writeFileSync(path.join(root, 'routes.geojson'), JSON.stringify(out));
console.log(`Wrote routes.geojson (${outFeatures.length} features, ${CORRIDORS.length} routes)`);

// Report the arrow split, so a route whose one-way section is entirely shadowed —
// and therefore shows no arrows at all in the all-routes view — is visible here.
if (soloReport.length) {
  console.log('');
  console.log('One-way sections, arrows shown only where the stretch is truly one-way:');
  for (const id of [...new Set(soloReport.map(r => r.id))]) {
    const mine = soloReport.filter(r => r.id === id);
    const m = st => Math.round(mine.filter(r => r.state === st).reduce((a, r) => a + r.meters, 0));
    const total = Math.round(mine.reduce((a, r) => a + r.meters, 0));
    console.log(`  ${id}: ${m('solo')} m of ${total} m carry arrows (${mine.length} runs)`
      + `${m('both') ? `; ${m('both')} m ridden both ways, no longer marked one-way` : ''}`
      + `${m('shadowed') ? `; ${m('shadowed')} m hidden under a later route` : ''}`
      + `${m('solo') ? '' : '  <-- no arrows at all'}`);
  }
}

fs.writeFileSync(path.join(root, 'time-pills.json'), JSON.stringify(pills, null, 1));
const pillRoutes = [...new Set(pills.map(p => p.route))];
console.log(`Wrote time-pills.json (${pills.length} markers on ${pillRoutes.length} route(s): `
  + `${pillRoutes.join(', ') || 'none'})`);

