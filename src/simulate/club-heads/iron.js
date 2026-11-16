import * as THREE from "three";

// Irons and wedges, sculpted in code. Units are centimetres. The head is
// modelled for a right-hander: heel, hosel and shaft on +x, toe on -x, target
// down +z. The group's origin is the middle of the hitting face, on the face,
// and the head stands at its static loft and designed lie with the sole level.
//
// A head is one closed skin, made of rings of points strung from the tip of
// the toe to the top of the hosel. The blade is laid out on the flat of the
// face in "face coordinates": `a` runs along the grooves toward the heel, `b`
// runs up the face from the leading edge, and depth is measured straight back
// into the metal. It is a slab behind the outline of the face, thin at the
// topline and thick at the bottom, cut off underneath by a cambered sole that
// lies along the ground, with every edge rounded and (on the irons) a cavity
// milled into the back. Past the heel the same rings are swept round a bend
// and eased onto a cylinder, so the blade grows out of the hosel with no seam.

const RADIANS = Math.PI / 180;
const INCH = 2.54;

// Half the length of a standard score line, and the line that frames the
// hitting area at the heel end (and the toe end, on an iron).
const GROOVE_HALF = 2.6;
const FRAME_X = 2.74;
// Where the shaft's axis would meet the ground, from the middle of the face.
const AXIS_X = 3.65;
const HOSEL_RADIUS = 0.675;

// Points round one ring of the skin.
const FACE_ROWS = 18;
const ARC_ROWS = 6;
const WALL_ROWS = 10;
const BACK_ROWS = 60;
// Rings along the head: packed toward the tip of the toe, where the outline
// turns back on itself, then evenly spaced.
const TOE_STATIONS = 32;
const TOE_SPAN = 1;
// Rings round the bend of the neck, and up the hosel.
const NECK_RINGS = 44;
const HOSEL_RINGS = 10;

const ACCENT = 0xc8102e;
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const smootherstep = (x) => {
  const t = clamp01(x);
  return t * t * t * (t * (6 * t - 15) + 10);
};
// Straight-line interpolation through a short table of [x, y] pairs.
const through = (table, x) => {
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0] || i === table.length - 1) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return lerp(y0, y1, clamp01((x - x0) / (x1 - x0)));
    }
  }
  return table[0][1];
};

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// --- what each head is ---

// The set irons (2 iron to pitching wedge) are one forged cavity-back design
// that changes smoothly with loft. The gap, sand and lob wedges are their own
// thing: a teardrop muscle-back with a wide, ground sole.
function headSpec(club) {
  const spec = headDesign(club);
  // The blade ends, and the bend of the neck begins, where a crook of about
  // a centimetre's radius under the topline would run out into the near side
  // of the hosel.
  const lie = spec.lie * RADIANS;
  const reach = HOSEL_RADIUS / Math.sin(lie);
  const run = (spec.heelTop * Math.cos(spec.loft * RADIANS)) / Math.tan(lie);
  const half = Math.tan(lie / 2);
  const crook = clamp(1.05 - (2 * reach - run) / half, 0.8, 1.5);
  spec.neckX = AXIS_X - reach + run - crook * half;
  return spec;
}

function headDesign(club) {
  const loft = club.loftDegrees;
  const common = {
    loft,
    lie: club.lieDegrees,
    toeX: -3.9,
    topRadius: 0.05,
  };
  if (club.category === "wedge" && loft > 47) {
    return {
      ...common,
      specialty: true,
      label: String(Math.round(loft)),
      toeHeight: through(
        [
          [50, 5.85],
          [54, 6],
          [60, 6.2],
        ],
        loft,
      ),
      peakInset: 1.55,
      tipHeight: 0.47,
      lowToe: 2.2,
      heelTop: 3.55,
      topBulge: 0.16,
      edgeCurve: lerp(0.006, 0.011, clamp01((loft - 50) / 10)),
      soleWidth: through(
        [
          [50, 2.3],
          [54, 2.6],
          [60, 2.72],
        ],
        loft,
      ),
      // Ground away at the heel and toe so the face can be laid open.
      soleTaper: (a) => 1 - 0.1 * (a / 3.2) * (a / 3.2) - 0.03 * (a / 3.2),
      topWidth: 0.68,
      topLean: 0.2 * loft,
      // The chord of the sole falls away behind the leading edge by this much;
      // the camber adds the rest of the bounce.
      bounce: through(
        [
          [50, 4.5],
          [54, 7.5],
          [60, 4],
        ],
        loft,
      ),
      camber: through(
        [
          [50, 0.12],
          [54, 0.17],
          [60, 0.14],
        ],
        loft,
      ),
      offset: 0.08,
      leadRadius: 0.09,
      trailRadius: 0.42,
      rimRadius: 0.1,
      toeBevel: 0.14,
      groovePitch: 0.2,
      grooveFirst: 0.45,
      centreHeight: 1.15,
      hoselTop: 7.1,
    };
  }
  // 0 at a 2 iron, 1 at a pitching wedge.
  const t = clamp01((loft - 18) / 28);
  return {
    ...common,
    specialty: false,
    label: club.category === "iron" ? club.shortName.replace(/\D/g, "") : "P",
    toeX: lerp(-4.02, -3.82, t),
    toeHeight: lerp(4.6, 5.7, t),
    peakInset: lerp(1.08, 0.98, t),
    tipHeight: 0.43,
    lowToe: 1.75,
    heelTop: lerp(3.2, 3.8, t),
    topBulge: 0.03,
    edgeCurve: 0.004,
    soleWidth: lerp(1.7, 1.92, t),
    soleTaper: (a) => 1 - 0.04 * (a / 3),
    topWidth: lerp(0.5, 0.58, t),
    topLean: 0.25 * loft,
    bounce: lerp(0.5, 3, t),
    camber: lerp(0.05, 0.08, t),
    offset: lerp(0.36, 0.16, t),
    leadRadius: 0.13,
    trailRadius: 0.14,
    rimRadius: 0.08,
    toeBevel: 0.11,
    groovePitch: 0.205,
    grooveFirst: 0.5,
    // the middle of the face is between the fourth and fifth score lines
    centreHeight: 1.22,
    hoselTop: lerp(6.4, 6.9, t),
    // the cavity
    muscle: lerp(1.05, 1.3, t),
    rim: 0.33,
    // how thick the floor of the cavity is
    floor: 0.36,
    cavityHeel: 2.3,
  };
}

// --- the outline of the face ---

// The silhouette of the blade seen face-on, as a run of points from the heel
// along the leading edge, round the toe and back along the topline. `b` is
// measured up the face from the leading edge.
function buildOutline(spec) {
  const peakX = spec.toeX + spec.peakInset;
  // The topline runs straight down from the toe, then levels off into the
  // crook of the neck.
  const flatBy = spec.neckX;
  const flatFrom = flatBy - 1.4;
  const slope =
    (spec.toeHeight - spec.heelTop) /
    (flatFrom - peakX + (flatBy - flatFrom) / 2);
  const top = (a) => {
    const run = Math.min(a, flatFrom) - peakX;
    const ease = clamp(a - flatFrom, 0, flatBy - flatFrom);
    const u = clamp01((a - peakX) / (flatBy - peakX));
    const bell = 1 - (2 * u - 1) * (2 * u - 1);
    return (
      spec.toeHeight -
      slope * (run + ease - (ease * ease) / (2 * (flatBy - flatFrom))) +
      spec.topBulge * bell * bell
    );
  };
  // The leading edge is all but straight.
  const bottom = (a) => spec.edgeCurve * a * a;

  const as = [];
  const bs = [];
  const push = (a, b) => {
    as.push(a);
    bs.push(b);
  };
  const cubic = (p0, c1, c2, p3, steps) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const s = 1 - t;
      const w0 = s * s * s;
      const w1 = 3 * s * s * t;
      const w2 = 3 * s * t * t;
      const w3 = t * t * t;
      push(
        w0 * p0[0] + w1 * c1[0] + w2 * c2[0] + w3 * p3[0],
        w0 * p0[1] + w1 * c1[1] + w2 * c2[1] + w3 * p3[1],
      );
    }
  };

  const lowToeX = spec.toeX + spec.lowToe;
  for (let a = spec.neckX; a > lowToeX; a -= 0.01) push(a, bottom(a));
  const start = [lowToeX, bottom(lowToeX)];
  push(start[0], start[1]);
  const tip = [spec.toeX, spec.tipHeight * spec.toeHeight];
  const startSlope = 2 * spec.edgeCurve * lowToeX;
  const startLength = Math.hypot(1, startSlope);
  cubic(
    start,
    [
      start[0] - (0.62 * spec.lowToe) / startLength,
      start[1] - (0.62 * spec.lowToe * startSlope) / startLength,
    ],
    [tip[0], tip[1] * 0.42],
    tip,
    400,
  );
  const tipIndex = as.length - 1;
  const peak = [peakX, top(peakX)];
  const peakSlope = (top(peakX + 0.001) - peak[1]) / 0.001;
  const peakLength = Math.hypot(1, peakSlope);
  cubic(
    tip,
    [tip[0], tip[1] + 0.56 * (peak[1] - tip[1])],
    [
      peak[0] - (0.6 * spec.peakInset) / peakLength,
      peak[1] - (0.6 * spec.peakInset * peakSlope) / peakLength,
    ],
    peak,
    400,
  );
  for (let a = peakX + 0.01; a < spec.neckX; a += 0.01) push(a, top(a));
  push(spec.neckX, top(spec.neckX));

  // Unit normals pointing into the face. The run is clockwise, so the inside
  // is to the right of the direction of travel.
  const count = as.length;
  const nxs = new Array(count);
  const nys = new Array(count);
  for (let i = 0; i < count; i++) {
    const before = Math.max(0, i - 1);
    const after = Math.min(count - 1, i + 1);
    const tx = as[after] - as[before];
    const ty = bs[after] - bs[before];
    const length = Math.hypot(tx, ty) || 1;
    nxs[i] = ty / length;
    nys[i] = -tx / length;
  }

  // The point of the outline at a given `a`, on the leading-edge side or the
  // topline side.
  const at = (x, lower) => {
    let low = lower ? 0 : tipIndex;
    let high = lower ? tipIndex : count - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      // `a` falls along the lower run and rises along the upper one
      const before = lower ? as[middle] > x : as[middle] < x;
      if (before) low = middle;
      else high = middle;
    }
    const span = as[high] - as[low];
    const t = Math.abs(span) < 1e-9 ? 0 : clamp01((x - as[low]) / span);
    const nx = lerp(nxs[low], nxs[high], t);
    const ny = lerp(nys[low], nys[high], t);
    const length = Math.hypot(nx, ny) || 1;
    return {
      a: lerp(as[low], as[high], t),
      b: lerp(bs[low], bs[high], t),
      nx: nx / length,
      ny: ny / length,
    };
  };

  // The outline moved in by `inset`, for clipping what is drawn on the face.
  const inset = (distance) =>
    as.map((a, i) => [a + nxs[i] * distance, bs[i] + nys[i] * distance]);

  return { at, top, bottom, inset };
}

// --- the wall between face and back ---

// Vectors here are [toward the heel, up the face, back into the metal].
const add = (p, direction, length) => [
  p[0] + direction[0] * length,
  p[1] + direction[1] * length,
  p[2] + direction[2] * length,
];
const unit = (from, to) => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]) || 1;
  return { direction: [d[0] / length, d[1] / length, d[2] / length], length };
};

// Points along the arc that rounds the corner at `corner` between two unit
// directions leading away from it, from the first to the second. Neither end
// of the arc may be further than its `reach` from the corner.
function fillet(corner, first, second, radius, reachFirst, reachSecond) {
  const cosine =
    first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  const half = Math.acos(clamp(cosine, -1, 1)) / 2;
  const reach = Math.min(radius / Math.tan(half), reachFirst, reachSecond);
  const r = reach * Math.tan(half);
  const bisector = unit([0, 0, 0], add(first, second, 1)).direction;
  const centre = add(corner, bisector, r / Math.sin(half));
  const from = unit(centre, add(corner, first, reach)).direction;
  const to = unit(centre, add(corner, second, reach)).direction;
  const sweep = Math.PI - 2 * half;
  const points = [];
  for (let i = 0; i <= ARC_ROWS; i++) {
    const t = i / ARC_ROWS;
    const w0 = Math.sin((1 - t) * sweep) / Math.sin(sweep);
    const w1 = Math.sin(t * sweep) / Math.sin(sweep);
    points.push(add(add(centre, from, r * w0), to, r * w1));
  }
  return points;
}

// How wide the sole is, front to back, at a point along the head.
const soleWidthAt = (spec, a) =>
  spec.soleWidth * spec.soleTaper(clamp(a, -3.6, 3.2));

// How thick the head would be behind a point of the face if nothing were
// milled out of it: the width of the topline at the top, swelling toward the
// bottom until it is thick enough to reach the trailing edge of the sole.
function slabThickness(spec, a, b) {
  const ground = (spec.loft - spec.bounce) * RADIANS;
  // The topline thickens as it runs into the neck.
  const topWidth =
    spec.topWidth * (1 + 0.3 * smoothstep(spec.neckX - 1.5, spec.neckX, a));
  return lerp(
    soleWidthAt(spec, a) * Math.cos(ground),
    topWidth,
    smoothstep(0.2, 0.72, b / spec.toeHeight),
  );
}

// The wall at a point of the outline (`nx`, `ny` is the outline's normal
// there, pointing into the face), on the topline side or the sole side: a row
// of points from where the flat of the face ends, round the front edge, along
// the wall and round the back edge to where the back begins.
//
// Round the toe and along the topline the wall is simply the edge of a slab,
// square to the face and as thick as the head is there. Under the head the
// slab is cut off by the sole, which lies along the ground: so low on the toe
// the wall drops square to the face only until it reaches the ground, then
// turns and runs back along it to the trailing edge.
function buildWall(spec, { a, b, nx, ny }, lower) {
  const loft = spec.loft * RADIANS;
  const ground = (spec.loft - spec.bounce) * RADIANS;
  const soleWidth = soleWidthAt(spec, a);
  const thick = slabThickness(spec, a, b);

  const edge = [a, b, 0];
  const inward = [nx, ny, 0];
  const outward = [-nx, -ny, 0];
  const square = [0, 0, 1];
  let end;
  let control;
  let front = spec.topRadius;
  let back = spec.toeBevel;
  if (lower) {
    const along = [0, Math.sin(ground), Math.cos(ground)];
    const down = [0, -Math.cos(loft), Math.sin(loft)];
    // How far the wall can drop before it meets the ground.
    const toGround = b / Math.tan(loft);
    const drop = Math.min(thick, toGround);
    // What is left of the sole behind that point. (The slab is just thick
    // enough to reach the trailing edge, so this runs out as the wall stops
    // reaching the ground.)
    const level = Math.cos(spec.bounce * RADIANS);
    const run =
      Math.max(
        0,
        soleWidth * level - b * Math.sin(loft) - drop * Math.cos(loft),
      ) / level;
    const corner = add(edge, square, drop);
    end = add(corner, along, run);
    const soleness = run / (run + drop + 1e-6);
    const middle = [
      (edge[0] + end[0]) / 2,
      (edge[1] + end[1]) / 2,
      (edge[2] + end[2]) / 2,
    ];
    // Bow the wall out toward the corner where it turns, and under the sole
    // give it its camber.
    const pull = 0.85 * smoothstep(0, 0.3, drop) * smoothstep(0, 0.3, run);
    control = add(
      add(
        add(
          middle,
          unit(middle, corner).direction,
          pull * unit(middle, corner).length,
        ),
        down,
        2 * spec.camber * soleness,
      ),
      outward,
      0.024,
    );
    front = lerp(spec.topRadius, spec.leadRadius, soleness);
    back = lerp(spec.toeBevel, spec.trailRadius, soleness);
  } else {
    // Along the topline the wall leans up a little, so more of it shows
    // from above.
    const top = smoothstep(0.48, 0.1, (1 + ny) / 2);
    const lean = spec.topLean * RADIANS * top;
    end = add(
      add(edge, square, thick * Math.cos(lean)),
      outward,
      thick * Math.sin(lean),
    );
    control = add(
      [(edge[0] + end[0]) / 2, (edge[1] + end[1]) / 2, (edge[2] + end[2]) / 2],
      outward,
      0.024,
    );
    back = lerp(spec.toeBevel, spec.rimRadius, top);
  }

  // Every edge softens as it runs into the neck.
  const soften = 0.3 * smoothstep(spec.neckX - 1.3, spec.neckX, a);
  front += soften * 0.5;
  back += soften;
  const lead = unit(edge, control);
  const tail = unit(end, control);
  const frontArc = fillet(
    edge,
    inward,
    lead.direction,
    front,
    Infinity,
    lead.length * 0.6,
  );
  const backArc = fillet(
    end,
    tail.direction,
    inward,
    back,
    tail.length * 0.6,
    Infinity,
  );
  const from = frontArc[ARC_ROWS];
  const to = backArc[0];
  const points = frontArc.slice();
  for (let i = 1; i < WALL_ROWS; i++) {
    const t = i / WALL_ROWS;
    const s = 1 - t;
    points.push(
      [0, 1, 2].map(
        (k) => s * s * from[k] + 2 * s * t * control[k] + t * t * to[k],
      ),
    );
  }
  return points.concat(backArc);
}

// --- textures ---

// Tangent-space normals from a relief drawn in greys (128 is the surface,
// darker is cut in).
function bakeNormals(relief, normal, strength) {
  const { width, height } = relief.canvas;
  const source = relief.getImageData(0, 0, width, height).data;
  const image = normal.createImageData(width, height);
  const target = image.data;
  const heightAt = (x, y) =>
    source[(clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = ((heightAt(x + 1, y) - heightAt(x - 1, y)) / 255) * strength;
      const dy = ((heightAt(x, y + 1) - heightAt(x, y - 1)) / 255) * strength;
      const scale = 127.5 / Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      target[i] = 127.5 - dx * scale;
      // canvas rows run down, v runs up
      target[i + 1] = 127.5 + dy * scale;
      target[i + 2] = 127.5 + scale;
      target[i + 3] = 255;
    }
  }
  normal.putImageData(image, 0, 0);
}

// Three canvases painted together: colour, finish (green is roughness, blue
// is metalness) and relief, which becomes a normal map. `paint` is called
// again with `mirrored` set when the head is flipped for a left-hander, so
// that anything written on it still reads the right way round.
function textureSet(width, height, strength, paint) {
  const context = (options) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d", options);
  };
  const layers = {
    colour: context(),
    finish: context(),
    relief: context({ willReadFrequently: true }),
  };
  const normal = context();
  const map = new THREE.CanvasTexture(layers.colour.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const finish = new THREE.CanvasTexture(layers.finish.canvas);
  const normalMap = new THREE.CanvasTexture(normal.canvas);
  for (const texture of [map, finish, normalMap]) texture.anisotropy = 8;
  const repaint = (mirrored) => {
    paint(layers, mirrored);
    bakeNormals(layers.relief, normal, strength);
    map.needsUpdate = finish.needsUpdate = normalMap.needsUpdate = true;
  };
  repaint(false);
  return { map, finish, normalMap, repaint };
}

const grey = (value) => {
  const v = Math.round(clamp(value, 0, 255));
  return `rgb(${v},${v},${v})`;
};
// A finish-map colour: roughness and metalness, each 0 to 1.
const finishColour = (roughness, metalness = 1) =>
  `rgb(0,${Math.round(roughness * 255)},${Math.round(metalness * 255)})`;

// Fine brush marks along the length of the head: a little streaking in the
// roughness and the colour. `fade` (0 to 1 across the canvas) is how strongly
// they show, so they can die away where the texture meets plain metal.
function brush(layers, satin, fade, seed) {
  const { width, height } = layers.colour.canvas;
  const random = seededRandom(seed);
  for (const [ctx, paint] of [
    [layers.finish, (lift) => finishColour(satin + lift * 0.1)],
    [layers.colour, (lift) => grey(lift > 0 ? 255 : 0)],
  ]) {
    for (let y = 0; y < height; y++) {
      const lift = random() - 0.5;
      const colour = paint(lift);
      ctx.globalAlpha =
        ctx === layers.colour ? Math.abs(lift) * 0.07 : Math.abs(lift) * 1.6;
      ctx.fillStyle = colour;
      // broken into runs so the marks are not ruled lines
      let x = -random() * 60;
      while (x < width) {
        const run = 30 + random() * 140;
        const strength = fade((x + run / 2) / width);
        if (strength > 0.01) {
          const alpha = ctx.globalAlpha;
          ctx.globalAlpha = alpha * strength;
          ctx.fillRect(x, y, run, 1);
          ctx.globalAlpha = alpha;
        }
        x += run + random() * 12;
      }
    }
    ctx.globalAlpha = 1;
  }
}

function stamp(ctx, text, x, y, size, fill, mirrored) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrored) ctx.scale(-1, 1);
  ctx.font = `italic 700 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// --- the head ---

const SATIN = 0;
const FACE = 1;
const BACK = 2;
const SOLE = 3;

function buildHead(spec) {
  const loft = spec.loft * RADIANS;
  const sinLoft = Math.sin(loft);
  const cosLoft = Math.cos(loft);
  const outline = buildOutline(spec);

  // Stations along the blade, from the tip of the toe to the neck.
  const evenCount = Math.round(
    (spec.neckX - spec.toeX - TOE_SPAN) / ((2 * TOE_SPAN) / TOE_STATIONS),
  );
  const evenStep = (spec.neckX - spec.toeX - TOE_SPAN) / evenCount;
  const bladeStations = TOE_STATIONS + evenCount + 1;
  const stationX = (i) =>
    i <= TOE_STATIONS
      ? spec.toeX + TOE_SPAN * (i / TOE_STATIONS) * (i / TOE_STATIONS)
      : spec.toeX + TOE_SPAN + (i - TOE_STATIONS) * evenStep;
  const stationOf = (a) => {
    const along = a - spec.toeX;
    if (along <= 0) return 0;
    return Math.min(
      bladeStations - 1,
      along < TOE_SPAN
        ? TOE_STATIONS * Math.sqrt(along / TOE_SPAN)
        : TOE_STATIONS + (along - TOE_SPAN) / evenStep,
    );
  };
  const neckStation = bladeStations - 1;

  // First pass: the wall at every station, on the topline side and the sole
  // side, in face coordinates [a, b, depth].
  const sideRows = 2 * ARC_ROWS + WALL_ROWS + 1;
  const walls = [];
  const edge = {
    top: new Float32Array(bladeStations),
    bottom: new Float32Array(bladeStations),
    facing: new Float32Array(bladeStations),
    under: new Float32Array(bladeStations),
  };
  for (let i = 0; i < bladeStations; i++) {
    const x = stationX(i);
    const upper = buildWall(spec, outline.at(x, false), false);
    const lower = buildWall(spec, outline.at(x, true), true);
    walls.push([upper, lower]);
    edge.top[i] = upper[sideRows - 1][1];
    edge.bottom[i] = lower[sideRows - 1][1];
    edge.facing[i] = Math.abs(outline.at(x, false).ny);
    edge.under[i] = Math.abs(outline.at(x, true).ny);
  }
  const edgeAt = (a) => {
    const station = stationOf(a);
    const i = Math.min(bladeStations - 2, Math.floor(station));
    const t = station - i;
    return {
      top: lerp(edge.top[i], edge.top[i + 1], t),
      bottom: lerp(edge.bottom[i], edge.bottom[i + 1], t),
      facing: lerp(edge.facing[i], edge.facing[i + 1], t),
      under: lerp(edge.under[i], edge.under[i + 1], t),
    };
  };

  // How thick the head is behind a point of the back, with how far into the
  // cavity floor (`floor`) or onto the bevel of the muscle (`bevel`) it is.
  const back = (a, b) => {
    const solid = slabThickness(spec, a, b);
    if (spec.specialty) return { depth: solid, floor: 0, bevel: 0 };
    // A pocket is milled into the back, inside a rim that follows the
    // topline and the toe, leaving a bar of muscle along the bottom.
    const at = edgeAt(a);
    const muscle = spec.muscle + 0.25 * smoothstep(0.5, -3, a);
    // The top of the muscle is a straight line; it does not follow the sole
    // up round the toe.
    const sole = edgeAt(Math.max(a, spec.toeX + spec.lowToe)).bottom;
    const pastMuscle = smoothstep(muscle - 0.2, muscle + 0.2, b - sole);
    const inside =
      smoothstep(spec.rim, spec.rim + 0.14, (at.top - b) * at.facing) *
      smoothstep(spec.rim, spec.rim + 0.14, (b - at.bottom) * at.under) *
      smoothstep(spec.cavityHeel, spec.cavityHeel - 0.3, a);
    const pocket = inside * pastMuscle;
    return {
      depth: solid + (spec.floor - solid) * pocket,
      floor: pocket,
      bevel: inside * smoothstep(0.3, 0.85, 4 * pastMuscle * (1 - pastMuscle)),
    };
  };

  // Second pass: every ring of the skin. Each row keeps its face coordinates
  // for the textures.
  const ringSize = FACE_ROWS + 1 + sideRows - 1 + BACK_ROWS + sideRows - 2;
  const rings = [];
  for (let i = 0; i < bladeStations; i++) {
    const [upper, lower] = walls[i];
    const ring = [];
    for (let k = 0; k <= FACE_ROWS; k++) {
      const t = k / FACE_ROWS;
      ring.push([
        lerp(lower[0][0], upper[0][0], t),
        lerp(lower[0][1], upper[0][1], t),
        0,
      ]);
    }
    for (let k = 1; k < sideRows; k++) ring.push(upper[k]);
    const from = upper[sideRows - 1];
    const to = lower[sideRows - 1];
    // The back meets the wall exactly at both edges.
    const fromSlip = from[2] - back(from[0], from[1]).depth;
    const toSlip = to[2] - back(to[0], to[1]).depth;
    for (let k = 1; k < BACK_ROWS; k++) {
      const t = k / BACK_ROWS;
      const a = lerp(from[0], to[0], t);
      const b = lerp(from[1], to[1], t);
      const depth =
        back(a, b).depth +
        fromSlip * smoothstep(0.2, 0, t) +
        toSlip * smoothstep(0.8, 1, t);
      ring.push([a, b, depth]);
    }
    for (let k = sideRows - 1; k >= 1; k--) ring.push(lower[k]);
    rings.push(ring);
  }

  // Which finish each strip between two rows wears.
  const stripFinish = [];
  const strips = (count, finish) => {
    for (let k = 0; k < count; k++) stripFinish.push(finish);
  };
  // The face's finish carries on round its edges.
  strips(FACE_ROWS + ARC_ROWS, FACE);
  strips(WALL_ROWS, SATIN);
  // So does the back's, which is where its polished bevel is painted.
  strips(ARC_ROWS + BACK_ROWS + ARC_ROWS, BACK);
  strips(1, SATIN);
  strips(WALL_ROWS - 2, SOLE);
  strips(1, SATIN);
  strips(ARC_ROWS, FACE);
  const backFirstRow = FACE_ROWS + sideRows - 1;
  const soleLastRow = backFirstRow + BACK_ROWS + ARC_ROWS;
  const soleFirstRow = soleLastRow + WALL_ROWS;
  const topMiddleRow = FACE_ROWS + ARC_ROWS + WALL_ROWS / 2;

  // Face coordinates to the head's own space: the face tilted back by the
  // loft, with the origin `centreHeight` up it.
  const place = ([a, b, depth], target) =>
    target.set(
      a,
      (b - spec.centreHeight) * cosLoft - depth * sinLoft,
      -(b - spec.centreHeight) * sinLoft - depth * cosLoft,
    );

  const stationCount = bladeStations + NECK_RINGS + HOSEL_RINGS;
  const positions = new Float32Array(stationCount * ringSize * 3);
  const uvs = new Float32Array(stationCount * ringSize * 2);
  const point = new THREE.Vector3();

  // Texture windows, in face coordinates.
  const window = {
    left: spec.toeX - 0.3,
    right: spec.neckX + 0.1,
    bottom: -0.25,
    top: spec.toeHeight + 0.45,
  };
  const windowWide = window.right - window.left;
  const windowTall = window.top - window.bottom;

  let ground = Infinity;
  let leadingEdge = -Infinity;
  for (let i = 0; i < bladeStations; i++) {
    for (let j = 0; j < ringSize; j++) {
      const row = rings[i][j];
      place(row, point);
      const index = i * ringSize + j;
      positions.set([point.x, point.y, point.z], index * 3);
      ground = Math.min(ground, point.y);
      if (Math.abs(row[0]) < 0.5) leadingEdge = Math.max(leadingEdge, point.z);
      let u = 0;
      let v = 0;
      if (j <= FACE_ROWS + ARC_ROWS || j >= soleFirstRow) {
        u = (row[0] - window.left) / windowWide;
        v = (row[1] - window.bottom) / windowTall;
      } else if (j >= backFirstRow - ARC_ROWS && j <= soleLastRow) {
        // seen from behind, the heel is on the left
        u = (window.right - row[0]) / windowWide;
        v = (row[1] - window.bottom) / windowTall;
      } else if (j > soleLastRow && j < soleFirstRow) {
        u = (window.right - row[0]) / windowWide;
        v = (soleFirstRow - j) / WALL_ROWS;
      }
      uvs.set([u, v], index * 2);
    }
  }

  // The hosel: a cylinder on the shaft's axis, set forward of the leading
  // edge by the offset.
  const lie = spec.lie * RADIANS;
  const sinLie = Math.sin(lie);
  const cosLie = Math.cos(lie);
  const axisZ = leadingEdge + spec.offset - HOSEL_RADIUS;
  const axisFoot = new THREE.Vector3(AXIS_X, ground, axisZ);
  const axis = new THREE.Vector3(cosLie, sinLie, 0);
  const across = new THREE.Vector3(-sinLie, cosLie, 0);

  // The last ring of the blade, which the neck grows from: how high each row
  // sits in it, and where it lies round its middle. Rows keep that place
  // round the hosel, so nothing twists on the way up.
  const last = neckStation * ringSize * 3;
  let lowest = Infinity;
  let highest = -Infinity;
  let middleY = 0;
  let middleZ = 0;
  for (let j = 0; j < ringSize; j++) {
    const y = positions[last + j * 3 + 1];
    lowest = Math.min(lowest, y);
    highest = Math.max(highest, y);
    middleY += y / ringSize;
    middleZ += positions[last + j * 3 + 2] / ringSize;
  }
  const angles = new Float32Array(ringSize);
  for (let j = 0; j < ringSize; j++) {
    let angle = Math.atan2(
      positions[last + j * 3 + 1] - middleY,
      positions[last + j * 3 + 2] - middleZ,
    );
    if (j > 0) {
      while (angle < angles[j - 1] - Math.PI) angle += Math.PI * 2;
      while (angle > angles[j - 1] + Math.PI) angle -= Math.PI * 2;
      angle = Math.max(angle, angles[j - 1]);
    }
    angles[j] = angle;
  }
  // No row may lap the first one.
  for (let j = 1; j < ringSize; j++) {
    angles[j] = Math.min(
      angles[j],
      angles[0] + Math.PI * 2 - (ringSize - j) * 1e-4,
    );
  }

  // Seen face-on the neck is two curves. Underneath, the sole turns up round
  // the heel into the far side of the hosel; on top, the topline turns up
  // through the crook into its near side. Each is an arc that leaves the
  // blade level and ends running up the shaft's line. Rings are strung
  // between the two, turning from upright to square across the hosel.
  const reach = HOSEL_RADIUS / sinLie;
  const turn = (lineX, startY) => {
    const radius =
      ((lineX - spec.neckX) * sinLie + (startY - ground) * cosLie) /
      (1 - cosLie);
    return {
      radius,
      endX: spec.neckX + radius * sinLie,
      endY: startY + radius * (1 - cosLie),
      startY,
    };
  };
  const crook = turn(AXIS_X - reach, highest);
  const heel = turn(AXIS_X + reach, lowest);
  const along = (curve, distance, target) => {
    const arc = curve.radius * lie;
    if (distance <= arc) {
      const angle = distance / curve.radius;
      return target.set(
        spec.neckX + curve.radius * Math.sin(angle),
        curve.startY + curve.radius * (1 - Math.cos(angle)),
      );
    }
    return target.set(
      curve.endX + (distance - arc) * cosLie,
      curve.endY + (distance - arc) * sinLie,
    );
  };
  const crookLength = crook.radius * lie + 0.5;
  const inner = along(crook, crookLength, new THREE.Vector2());
  // Straight across the hosel from where the crook ends.
  const heelLength =
    heel.radius * lie +
    (inner.x + 2 * HOSEL_RADIUS * sinLie - heel.endX) * cosLie +
    (inner.y - 2 * HOSEL_RADIUS * cosLie - heel.endY) * sinLie;
  const hoselFrom =
    (inner.x + HOSEL_RADIUS * sinLie - AXIS_X) * cosLie +
    (inner.y - HOSEL_RADIUS * cosLie - ground) * sinLie;

  const blend = new Float32Array(stationCount).fill(1);
  blend.fill(0, 0, bladeStations);
  const outer = new THREE.Vector2();
  for (let k = 1; k <= NECK_RINGS; k++) {
    const t = k / NECK_RINGS;
    const station = neckStation + k;
    const round = smootherstep(t);
    blend[station] = round;
    along(crook, crookLength * t, inner);
    along(heel, heelLength * t, outer);
    for (let j = 0; j < ringSize; j++) {
      const up = lerp(
        (positions[last + j * 3 + 1] - lowest) / (highest - lowest),
        (1 + Math.sin(angles[j])) / 2,
        round,
      );
      positions.set(
        [
          lerp(outer.x, inner.x, up),
          lerp(outer.y, inner.y, up),
          lerp(
            positions[last + j * 3 + 2],
            axisZ + HOSEL_RADIUS * Math.cos(angles[j]),
            round,
          ),
        ],
        (station * ringSize + j) * 3,
      );
    }
  }
  // Then straight up to the top of the hosel, with a small chamfer.
  for (let k = 0; k < HOSEL_RINGS; k++) {
    let height = lerp(
      hoselFrom,
      spec.hoselTop - 0.06,
      Math.min(1, (k + 1) / (HOSEL_RINGS - 2)),
    );
    let radius = HOSEL_RADIUS;
    if (k === HOSEL_RINGS - 2) {
      height = spec.hoselTop;
      radius -= 0.05;
    } else if (k === HOSEL_RINGS - 1) {
      height = spec.hoselTop;
      radius = 0.3;
    }
    for (let j = 0; j < ringSize; j++) {
      point
        .copy(axisFoot)
        .addScaledVector(axis, height)
        .addScaledVector(across, radius * Math.sin(angles[j]))
        .setZ(axisZ + radius * Math.cos(angles[j]))
        .toArray(
          positions,
          ((neckStation + NECK_RINGS + 1 + k) * ringSize + j) * 3,
        );
    }
  }

  // Stitch the rings together, sorted by finish.
  const indices = [[], [], [], []];
  for (let i = 0; i < stationCount - 1; i++) {
    for (let j = 0; j < ringSize; j++) {
      const next = (j + 1) % ringSize;
      const a = i * ringSize + j;
      const b = (i + 1) * ringSize + j;
      const c = (i + 1) * ringSize + next;
      const d = i * ringSize + next;
      const finish = i < neckStation ? stripFinish[j] : SATIN;
      indices[finish].push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const all = [];
  indices.forEach((list, finish) => {
    geometry.addGroup(all.length, list.length, finish);
    for (const index of list) all.push(index);
  });
  geometry.setIndex(all);
  geometry.computeVertexNormals();

  // The face is dead flat, so give it its true normal rather than one
  // softened by the edge next to it.
  const normals = geometry.attributes.normal;
  const faceNormal = new THREE.Vector3(0, sinLoft, cosLoft);
  for (let i = 0; i < stationCount && blend[i] < 1; i++) {
    for (let j = 0; j <= FACE_ROWS; j++) {
      const index = i * ringSize + j;
      point
        .fromBufferAttribute(normals, index)
        .lerp(faceNormal, 1 - blend[i])
        .normalize();
      normals.setXYZ(index, point.x, point.y, point.z);
    }
  }

  const vertex = (station, row) =>
    new THREE.Vector3().fromArray(positions, (station * ringSize + row) * 3);
  const solePoints = [];
  for (const a of [2.5, 1.5, 0.5, -0.5, -1.5, -2.5]) {
    const station = Math.round(stationOf(a));
    for (const row of [
      soleFirstRow + ARC_ROWS / 2,
      soleFirstRow - 2,
      soleFirstRow - WALL_ROWS / 2,
      soleLastRow + 2,
      soleLastRow,
    ]) {
      solePoints.push(vertex(station, row));
    }
  }
  const centre = Math.round(stationOf(0));

  return {
    geometry,
    outline,
    back,
    edgeAt,
    window,
    ground,
    axisFoot,
    solePoints,
    crownTop: vertex(centre, topMiddleRow),
    faceHeight: outline.top(0) - outline.bottom(0),
    faceWidth: spec.specialty
      ? GROOVE_HALF - spec.toeX - 0.35
      : GROOVE_HALF * 2,
  };
}

// --- finishes ---

// The colours of the metal. The wedges are a dark smoked finish with the
// hitting area left raw; the irons are satin chrome all over.
function palette(spec) {
  return spec.specialty
    ? {
        body: new THREE.Color(0x565a61),
        face: new THREE.Color(0xc4c7cc),
        satin: 92 / 255,
        polish: { color: 0x676b73, roughness: 0.2 },
        blasted: 0.58,
      }
    : {
        body: new THREE.Color(0xc9cdd3),
        face: new THREE.Color(0xb4b7bd),
        satin: 77 / 255,
        polish: { color: 0xf3f5f8, roughness: 0.05 },
        blasted: 0.6,
      };
}

const cssColour = (colour) => `#${colour.getHexString()}`;

function faceTextures(spec, head, colours) {
  const { window, outline } = head;
  const width = 1024;
  const height = 896;
  const scaleX = width / (window.right - window.left);
  const scaleY = height / (window.top - window.bottom);
  const x = (a) => (a - window.left) * scaleX;
  const y = (b) => (window.top - b) * scaleY;
  const plain = cssColour(colours.body);
  const grooveCount = spec.specialty
    ? Math.floor((spec.toeHeight - 0.55 - spec.grooveFirst) / spec.groovePitch)
    : Math.floor(
        (outline.top(GROOVE_HALF) - 0.34 - spec.grooveFirst) / spec.groovePitch,
      ) + 1;
  const toeEnd = spec.specialty ? window.left : -GROOVE_HALF;
  const blastFrom = spec.specialty ? window.left : -FRAME_X;

  return textureSet(width, height, 2.4, ({ colour, finish, relief }) => {
    colour.fillStyle = plain;
    colour.fillRect(0, 0, width, height);
    finish.fillStyle = finishColour(colours.satin);
    finish.fillRect(0, 0, width, height);
    relief.fillStyle = grey(128);
    relief.fillRect(0, 0, width, height);
    // Brush marks on the polished ends, fading out toward the neck.
    brush(
      { colour, finish },
      colours.satin,
      (u) => smoothstep(0.97, 0.8, u),
      5,
    );

    // The hitting area is media-blasted: flatter, and a touch darker.
    const blastWide = x(FRAME_X) - x(blastFrom);
    colour.fillStyle = cssColour(colours.face);
    colour.fillRect(x(blastFrom), 0, blastWide, height);
    finish.fillStyle = finishColour(colours.blasted);
    finish.fillRect(x(blastFrom), 0, blastWide, height);
    const random = seededRandom(23);
    for (let i = 0; i < 26000; i++) {
      const speck = random();
      colour.fillStyle = `rgba(${speck > 0.5 ? "255,255,255" : "40,44,50"},0.06)`;
      colour.fillRect(
        x(blastFrom) + random() * blastWide,
        random() * height,
        1.5,
        1.5,
      );
    }

    // Frame lines either side of it.
    for (const ctx of [colour, finish, relief]) {
      ctx.lineCap = "butt";
      ctx.lineWidth = 0.028 * scaleX;
      ctx.strokeStyle =
        ctx === colour
          ? "rgba(30,33,38,0.7)"
          : ctx === finish
            ? finishColour(0.5, 0.7)
            : grey(40);
      for (const a of spec.specialty ? [FRAME_X] : [FRAME_X, -FRAME_X]) {
        ctx.beginPath();
        ctx.moveTo(x(a), y(0.16));
        ctx.lineTo(x(a), 0);
        ctx.stroke();
      }
    }

    // Score lines. On a wedge they run the full width of the face, stopping
    // just short of its edge.
    for (const ctx of [colour, finish, relief]) {
      ctx.save();
      if (spec.specialty) {
        ctx.beginPath();
        outline.inset(0.3).forEach(([a, b], i) => {
          if (i === 0) ctx.moveTo(x(a), y(b));
          else ctx.lineTo(x(a), y(b));
        });
        ctx.closePath();
        ctx.clip();
      }
      ctx.lineCap = "round";
      const line = (b, from, to, thickness, style) => {
        ctx.lineWidth = thickness * scaleY;
        ctx.strokeStyle = style;
        ctx.beginPath();
        ctx.moveTo(x(from), y(b));
        ctx.lineTo(x(to), y(b));
        ctx.stroke();
      };
      for (let i = 0; i < grooveCount; i++) {
        const b = spec.grooveFirst + i * spec.groovePitch;
        if (spec.specialty) {
          // micro-milling between the grooves
          for (const step of [0.25, 0.5, 0.75]) {
            const fine = b + step * spec.groovePitch;
            if (ctx === colour) {
              line(fine, GROOVE_HALF, toeEnd, 0.014, "rgba(40,44,50,0.28)");
            } else if (ctx === relief) {
              line(fine, GROOVE_HALF, toeEnd, 0.02, grey(104));
            }
          }
        }
        if (ctx === colour) {
          line(b, GROOVE_HALF, toeEnd, 0.07, "rgba(22,24,28,0.88)");
        } else if (ctx === finish) {
          line(b, GROOVE_HALF, toeEnd, 0.07, finishColour(0.5, 0.55));
        } else {
          line(b, GROOVE_HALF, toeEnd, 0.085, grey(70));
          line(b, GROOVE_HALF, toeEnd, 0.04, grey(8));
        }
      }
      ctx.restore();
    }
  });
}

function backTextures(spec, head, colours) {
  const { window, edgeAt, back } = head;
  const width = 640;
  const height = 512;
  const scaleX = width / (window.right - window.left);
  const scaleY = height / (window.top - window.bottom);
  // seen from behind, so the heel is on the left
  const x = (a) => (window.right - a) * scaleX;
  const y = (b) => (window.top - b) * scaleY;
  let base = null;
  const channels = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const metal = channels(colours.body.getHex());
  const bright = channels(colours.polish.color);

  return textureSet(
    width,
    height,
    1.6,
    ({ colour, finish, relief }, mirrored) => {
      if (!base) {
        // The finish follows the shape: a blasted floor to the cavity and a
        // mirror-polished bevel where the muscle falls away into it.
        base = {
          colour: colour.createImageData(width, height),
          finish: finish.createImageData(width, height),
        };
        const random = seededRandom(41);
        for (let row = 0; row < height; row++) {
          const streak = (random() - 0.5) * 0.09;
          const b = window.top - (row + 0.5) / scaleY;
          for (let column = 0; column < width; column++) {
            const a = window.right - (column + 0.5) / scaleX;
            const { floor, bevel } = back(a, b);
            // The rounded edge all the way round the back is polished too,
            // fading out before the neck.
            const at = edgeAt(a);
            const inside = Math.min(
              (at.top - b) * Math.max(at.facing, 0.3),
              (b - at.bottom) * Math.max(at.under, 0.3),
            );
            const polished = Math.max(
              bevel,
              smoothstep(0.05, 0, inside) *
                smoothstep(spec.neckX - 0.15, spec.neckX - 1, a),
            );
            const brushed =
              streak * (1 - floor) * (1 - polished) * smoothstep(2.9, 2.2, a);
            const shade = (1 - 0.3 * floor) * (1 - Math.abs(brushed) * 0.5);
            const roughness = lerp(
              lerp(colours.satin + brushed, colours.blasted, floor),
              colours.polish.roughness,
              polished,
            );
            const i = (row * width + column) * 4;
            for (let k = 0; k < 3; k++) {
              base.colour.data[i + k] = lerp(
                metal[k] * shade,
                bright[k],
                polished,
              );
            }
            base.colour.data[i + 3] = 255;
            base.finish.data[i + 1] = roughness * 255;
            base.finish.data[i + 2] = 255;
            base.finish.data[i + 3] = 255;
          }
        }
      }
      colour.putImageData(base.colour, 0, 0);
      finish.putImageData(base.finish, 0, 0);
      relief.fillStyle = grey(128);
      relief.fillRect(0, 0, width, height);

      const engrave = (text, a, b, size, paint) => {
        const px = size * scaleY;
        stamp(colour, text, x(a), y(b), px, paint, mirrored);
        stamp(finish, text, x(a), y(b), px, finishColour(0.5, 0), mirrored);
        stamp(relief, text, x(a), y(b), px, grey(50), mirrored);
      };
      const bar = (ctx, a, b, wide, tall, radius, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.roundRect(
          x(a) - (wide * scaleX) / 2,
          y(b) - (tall * scaleY) / 2,
          wide * scaleX,
          tall * scaleY,
          radius * scaleY,
        );
        ctx.fill();
      };
      const red = `#${new THREE.Color(ACCENT).getHexString()}`;

      if (spec.specialty) {
        // The loft, stamped high on the toe side and filled with white paint,
        // and one red dot.
        const at = edgeAt(-2.05);
        const b = lerp(at.bottom, at.top, 0.6);
        engrave(spec.label, -2.05, b, 1.05, "#e6e8ea");
        for (const ctx of [colour, finish, relief]) {
          ctx.fillStyle =
            ctx === colour
              ? red
              : ctx === finish
                ? finishColour(0.4, 0.1)
                : grey(70);
          ctx.beginPath();
          ctx.arc(x(-0.75), y(b), 0.13 * scaleY, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      // A badge set into the floor of the cavity: black enamel inside a chrome
      // keyline, with a mark that reads the same in a mirror.
      const badgeA = -0.45;
      const at = edgeAt(badgeA);
      const muscle = spec.muscle + 0.25 * smoothstep(0.5, -3, badgeA);
      const floorLow = at.bottom + (muscle + 0.25) / Math.max(0.5, at.under);
      const floorHigh = at.top - (spec.rim + 0.14) / Math.max(0.5, at.facing);
      const badgeB = (floorLow + floorHigh) / 2;
      const badgeTall = Math.min(0.62, (floorHigh - floorLow) * 0.62);
      const badgeWide = 2.9;
      bar(colour, badgeA, badgeB, badgeWide, badgeTall, 0.1, "#eef0f3");
      bar(
        finish,
        badgeA,
        badgeB,
        badgeWide,
        badgeTall,
        0.1,
        finishColour(0.12),
      );
      bar(relief, badgeA, badgeB, badgeWide, badgeTall, 0.1, grey(176));
      const inner = [badgeWide - 0.09, badgeTall - 0.09, 0.07];
      bar(colour, badgeA, badgeB, ...inner, "#0c0d10");
      bar(finish, badgeA, badgeB, ...inner, finishColour(0.22, 0.15));
      bar(relief, badgeA, badgeB, ...inner, grey(160));
      // a chrome diamond between two red flashes
      for (const ctx of [colour, finish]) {
        const reach = badgeTall * 0.26;
        ctx.fillStyle = ctx === colour ? "#f1f3f6" : finishColour(0.1);
        ctx.beginPath();
        ctx.moveTo(x(badgeA), y(badgeB + reach));
        ctx.lineTo(x(badgeA - reach * 1.5), y(badgeB));
        ctx.lineTo(x(badgeA), y(badgeB - reach));
        ctx.lineTo(x(badgeA + reach * 1.5), y(badgeB));
        ctx.closePath();
        ctx.fill();
        for (const side of [-1, 1]) {
          bar(
            ctx,
            badgeA + side * 0.78,
            badgeB,
            0.62,
            badgeTall * 0.14,
            0.02,
            ctx === colour ? red : finishColour(0.3, 0.2),
          );
        }
      }

      // The club's number on the toe end of the muscle, paint-filled, and a
      // red flash at the heel end.
      const numberA = -2.3;
      const toe = edgeAt(numberA);
      engrave(
        spec.label,
        numberA,
        toe.bottom + spec.muscle * 0.55,
        spec.muscle * 0.62,
        "#101114",
      );
      const heel = edgeAt(1.75);
      const heelB = heel.bottom + spec.muscle * 0.5;
      bar(colour, 1.75, heelB, 0.6, 0.09, 0.03, red);
      bar(finish, 1.75, heelB, 0.6, 0.09, 0.03, finishColour(0.35, 0.15));
      bar(relief, 1.75, heelB, 0.6, 0.09, 0.03, grey(84));
    },
  );
}

function soleTextures(spec, head, colours) {
  const { window } = head;
  const width = 512;
  const scaleX = width / (window.right - window.left);
  const height = Math.round(scaleX * spec.soleWidth);
  const x = (a) => (window.right - a) * scaleX;
  return textureSet(
    width,
    height,
    1.6,
    ({ colour, finish, relief }, mirrored) => {
      colour.fillStyle = cssColour(colours.body);
      colour.fillRect(0, 0, width, height);
      finish.fillStyle = finishColour(colours.satin);
      finish.fillRect(0, 0, width, height);
      relief.fillStyle = grey(128);
      relief.fillRect(0, 0, width, height);
      // Brushed along the sole, fading out toward the neck on the left.
      brush(
        { colour, finish },
        colours.satin,
        (u) => smoothstep(0.03, 0.2, u),
        9,
      );
      // The number near the toe, the way it reads looking down at the sole
      // with the leading edge nearest.
      const size = height * (spec.specialty ? 0.42 : 0.56);
      const at = [x(-2.15), height * 0.5];
      stamp(
        colour,
        spec.label,
        ...at,
        size,
        spec.specialty ? "#e6e8ea" : "#101114",
        mirrored,
      );
      stamp(finish, spec.label, ...at, size, finishColour(0.5, 0), mirrored);
      stamp(relief, spec.label, ...at, size, grey(50), mirrored);
    },
  );
}

// --- shaft and grip ---

// A stepped steel shaft, ferrule and rubber grip, built upright from where
// the shaft's axis meets the ground.
function buildShaft(spec, club) {
  const group = new THREE.Group();
  const total = club.lengthInches * INCH;
  const gripLength = 26.5;
  const gripFrom = total - gripLength;
  const lathe = (points, material) => {
    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(
        points.map(([radius, height]) => new THREE.Vector2(radius, height)),
        40,
      ),
      material,
    );
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const tipRadius = 0.47;
  const buttRadius = 0.76;
  const accent = new THREE.MeshStandardMaterial({
    color: ACCENT,
    metalness: 0.5,
    roughness: 0.35,
  });

  // The ferrule: a black sleeve fairing the hosel into the shaft, with one
  // red ring.
  const ferruleLength = 2.3;
  const ferrule = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    ferrule.push([
      tipRadius +
        0.012 +
        (HOSEL_RADIUS - tipRadius - 0.012) * Math.pow(1 - t, 1.7),
      spec.hoselTop + t * ferruleLength,
    ]);
  }
  ferrule.unshift([HOSEL_RADIUS - 0.08, spec.hoselTop - 0.05]);
  lathe(
    ferrule,
    new THREE.MeshPhysicalMaterial({
      color: 0x0b0b0d,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
  );
  const ringAt = (t) => [
    tipRadius +
      0.018 +
      (HOSEL_RADIUS - tipRadius - 0.012) * Math.pow(1 - t, 1.7),
    spec.hoselTop + t * ferruleLength,
  ];
  lathe([ringAt(0.1), ringAt(0.125), ringAt(0.15)], accent);

  // Steel, stepping up in diameter from the tip to the grip.
  const firstStep = 20 + 0.4 * (total - 89);
  const lastStep = gripFrom - 9.5;
  const stepCount = Math.max(1, Math.round((lastStep - firstStep) / 4.45));
  const profile = [[tipRadius, spec.hoselTop - 1.2]];
  for (let i = 0; i < stepCount; i++) {
    const at = lerp(
      firstStep,
      lastStep,
      stepCount === 1 ? 0 : i / (stepCount - 1),
    );
    const from = lerp(tipRadius, buttRadius, i / stepCount);
    const to = lerp(tipRadius, buttRadius, (i + 1) / stepCount);
    profile.push([from, at], [lerp(from, to, 0.5), at + 0.09], [to, at + 0.18]);
  }
  profile.push([buttRadius, total - 2]);
  lathe(
    profile,
    new THREE.MeshStandardMaterial({
      color: 0xe4e7ec,
      metalness: 1,
      roughness: 0.14,
    }),
  );

  // The shaft band: a printed label just below the grip. Nothing on it is
  // lettering, so it looks the same mirrored.
  const band = document.createElement("canvas");
  band.width = 256;
  band.height = 256;
  {
    const ctx = band.getContext("2d");
    ctx.fillStyle = "#0d0e11";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = `#${new THREE.Color(ACCENT).getHexString()}`;
    ctx.fillRect(0, 206, 256, 26);
    ctx.fillStyle = "#d9dce1";
    ctx.fillRect(0, 8, 256, 4);
    ctx.fillRect(0, 244, 256, 4);
    ctx.fillRect(0, 196, 256, 3);
    for (const offset of [0, 128]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.roundRect(offset + 34, 52 + i * 34, 60, 16, 8);
        ctx.fill();
      }
    }
  }
  const bandMap = new THREE.CanvasTexture(band);
  bandMap.colorSpace = THREE.SRGBColorSpace;
  bandMap.anisotropy = 8;
  const bandLength = 5.2;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(
      buttRadius + 0.006,
      buttRadius + 0.006,
      bandLength,
      40,
      1,
      true,
    ),
    new THREE.MeshPhysicalMaterial({
      map: bandMap,
      metalness: 0.2,
      roughness: 0.35,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
    }),
  );
  label.position.y = gripFrom - 3 - bandLength / 2;
  label.castShadow = true;
  group.add(label);

  // The grip: tapered rubber with a fine pattern cut into it and a domed cap.
  const pattern = document.createElement("canvas");
  pattern.width = pattern.height = 64;
  {
    const ctx = pattern.getContext("2d");
    ctx.fillStyle = "#9a9a9a";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#303030";
    ctx.lineWidth = 3;
    for (let i = -64; i <= 128; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 64, 64);
      ctx.moveTo(i + 64, 0);
      ctx.lineTo(i, 64);
      ctx.stroke();
    }
  }
  const bumpMap = new THREE.CanvasTexture(pattern);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(14, 40);
  bumpMap.anisotropy = 8;
  const gripRadius = (t) => 1 + 0.32 * Math.pow(t, 1.2);
  const grip = [
    [buttRadius + 0.01, gripFrom],
    [buttRadius + 0.1, gripFrom + 0.04],
    [gripRadius(0) - 0.03, gripFrom + 0.5],
  ];
  const bodyTo = total - 0.5;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    grip.push([gripRadius(t), lerp(gripFrom + 0.7, bodyTo, t)]);
  }
  for (let i = 1; i <= 8; i++) {
    const angle = (i / 8) * (Math.PI / 2);
    grip.push([
      gripRadius(1) - 0.45 * (1 - Math.cos(angle)),
      bodyTo + 0.45 * Math.sin(angle),
    ]);
  }
  grip.push([0.16, total], [0.16, total - 0.12], [0, total - 0.12]);
  lathe(
    grip,
    new THREE.MeshStandardMaterial({
      color: 0x17181b,
      roughness: 0.88,
      bumpMap,
      bumpScale: 1.4,
    }),
  );
  lathe(
    [
      [gripRadius(0.035) + 0.006, gripFrom + 1.5],
      [gripRadius(0.045) + 0.006, gripFrom + 1.8],
    ],
    accent,
  );
  return group;
}

// --- the club ---

// One iron or wedge from the catalogue (clubs.js), as a group whose origin is
// the middle of the hitting face. See the notes at the top for how it stands.
// `userData` carries what the scene needs to set it down and decorate it:
//   solePoints  points across the sole, heel to toe and front to back
//   faceHeight, faceWidth  the size of the hitting area
//   crownTop    a point on the topline above the middle of the face
//   groundY     how far below the origin the sole reaches as built
export function buildIronHead(club) {
  const spec = headSpec(club);
  const head = buildHead(spec);
  const colours = palette(spec);

  // The metal's colour is painted into these, so that paint on top of it can
  // be brighter than the metal.
  const textured = (set) =>
    new THREE.MeshStandardMaterial({
      metalness: 1,
      roughness: 1,
      map: set.map,
      roughnessMap: set.finish,
      metalnessMap: set.finish,
      normalMap: set.normalMap,
    });
  const backSet = backTextures(spec, head, colours);
  const soleSet = soleTextures(spec, head, colours);
  const materials = [];
  materials[SATIN] = new THREE.MeshStandardMaterial({
    color: colours.body,
    metalness: 1,
    roughness: colours.satin,
  });
  materials[FACE] = textured(faceTextures(spec, head, colours));
  materials[BACK] = textured(backSet);
  materials[SOLE] = textured(soleSet);

  const mesh = new THREE.Mesh(head.geometry, materials);
  mesh.name = "head";
  mesh.castShadow = true;
  // Mirrored for a left-hander, the stamped numbers would read backwards:
  // paint them the other way round when that happens.
  let mirrored = false;
  mesh.onBeforeRender = () => {
    const now = mesh.matrixWorld.determinant() < 0;
    if (now === mirrored) return;
    mirrored = now;
    backSet.repaint(mirrored);
    soleSet.repaint(mirrored);
  };

  const shaft = buildShaft(spec, club);
  shaft.position.copy(head.axisFoot);
  shaft.rotation.z = (spec.lie - 90) * RADIANS;

  const group = new THREE.Group();
  group.name = club.id;
  group.add(mesh, shaft);
  group.userData = {
    solePoints: head.solePoints,
    faceHeight: head.faceHeight,
    faceWidth: head.faceWidth,
    crownTop: head.crownTop,
    groundY: head.ground,
  };
  return group;
}
