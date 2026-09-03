/**
 * The ten commuter corridors: the via-points each route is pinned to, plus the
 * display properties the map and the posters read.
 *
 * Extracted from fetch-routes.mjs so tools/export-directions.mjs can route the
 * same corridors without importing that script's top-level work.
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
 * `home` segment is still written suburb-first; whoever consumes it reverses
 * the geometry.
 */

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

export const CORRIDORS = [
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
      [-75.920091, 45.258599], //Village Square park near Stittsville main street
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
      [-75.746761, 45.275743], // Transitway MUP near Berrigan dr
      [-75.735882, 45.307277], // Woodroffe Ave corridor (south) — keeps route off Prince of Wales
      [-75.746076, 45.325685], // Nepean Sportsplex
      [-75.742834, 45.326941], // Nepean Sportsplex on MUP further down
      [-75.744826, 45.330082], // Nepean Sportsplex hunt club crossing
      [-75.727046, 45.346903], // Woodroffe Ave corridor (north)
      [-75.732923, 45.357044], // capilano
      [-75.724025, 45.360236], // Buffalo Cir
      [-75.718841, 45.364266], // Deer Park road
      [-75.713751, 45.366173], // Deer Park/Fisher south west intersection
      [-75.713489, 45.366539], // Deer Park/Fisher north east intersection
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
