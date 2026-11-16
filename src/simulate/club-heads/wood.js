import * as THREE from "three";

// The hollow-headed clubs: driver, fairway woods and hybrids. One builder
// sculpts all three from a per-club shape, so the bag reads as one set.
//
// Units are centimetres. The head is modelled for a right-hander: heel, hosel
// and shaft on +x, toe on -x, target down +z, +y up. The group's origin is the
// middle of the hitting face, on the face, and the face there points along
// (0, sin(loft), cos(loft)) with the sole sitting level.

const RADIANS = Math.PI / 180;
const CM_PER_INCH = 2.54;
const ACCENT_COLOR = 0xc8102e;
const SHAFT_COLOR = 0xb3122b;
const GRIP_LENGTH = 27;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const power = (value, exponent) =>
  Math.sign(value) * Math.pow(Math.abs(value), exponent);

// --- shapes ---
//
// A head is the unit sphere pushed into shape (see headPoint), cut off flat
// at the face. Each family describes itself with:
//   toePower, heelPower, depthPower  squaring-off exponents for the outline
//       seen from above (lower is boxier), toe and heel side separately
//   crownPower, solePower  the same for the dome above and the dish below
//   rim       height where the crown meets the sole
//   length, setback  half the uncut length front to back, and how far behind
//       the face the widest part of the head sits
//   width(depth, side), crown(depth, across), sole(depth, across)
//       half width, top of the crown and bottom of the sole along the head;
//       depth runs from 1 at the front to -1 at the tail, across from -1 at
//       the toe to 1 at the heel
//   shear     how far the front of the head leans back with the face, so
//       every loft in a family is cut at the same place
//   relief(x, z)  rails or a keel standing proud of the sole
//   bulge, roll   face curvature heel-to-toe and top-to-bottom: the face
//       drops back x²/bulge and y²/roll
//   edge      size of the rounded edge between the face and the body

const DRIVER_RIM = -0.85;
const DRIVER_SOLE = -2.55;

// The 460 cc driver: wide and deep, a rounded-off triangle from above,
// tallest just behind the face and falling away to a blunt back.
function driverShape(club) {
  return {
    family: "driver",
    loft: club.loftDegrees * RADIANS,
    toePower: 0.88,
    heelPower: 0.88,
    depthPower: 0.88,
    crownPower: 0.55,
    solePower: 0.55,
    rim: DRIVER_RIM,
    length: 7.7,
    setback: 2.75,
    shear: 0,
    // Narrower at the face, widest a third of the way back, easing in again
    // toward the tail.
    width: (depth) =>
      6.25 *
      (0.9 + 0.1 * smoothstep(0.45, 0.05, depth)) *
      (1 - 0.14 * smoothstep(-0.25, -1, depth)),
    // The crown peaks a little behind the face and slopes down to the tail.
    crown: (depth) =>
      3.35 * (0.36 + 0.64 * smoothstep(-1.1, 0.15, depth)) -
      0.25 * smoothstep(0.15, 0.5, depth),
    // The sole is nearly flat and sweeps up toward the tail.
    sole: (depth) => DRIVER_SOLE + 1.1 * smoothstep(-0.35, -1.05, depth),
    relief: null,
    bulge: 60,
    roll: 60,
    edge: 0.2,
    crownFinish: "carbon",
    bandRows: 0,
    face: {
      top: "#c9ced6",
      bottom: "#8d949f",
      lineWidth: 0.067,
      rows: Array.from({ length: 9 }, (_, i) => 1.86 - 0.4275 * i),
      spans: [
        [-4.56, -1.596],
        [1.596, 4.56],
      ],
      box: { x: 0.684, bottom: -0.762, top: 1.062 },
      // The drawing is laid out on the face plate of the original driver.
      rect: { x0: -5.7, x1: 5.7, y0: -2.7, y1: 3 },
      metalness: 0.9,
      roughness: 0.38,
    },
    hosel: {
      direction: [0.8, 0.5, 0.22],
      sink: 1,
      neck: 4.9,
      baseRadius: 0.86,
      topRadius: 0.6,
      shoulder: 1.1,
    },
    tipRadius: 0.44,
    mark: 0.22,
    port: { at: 0.682, radius: 0.85 },
    stamp: { z: -2.6, width: 2.6 },
  };
}

// Fairway woods: a shallow, pear-shaped steel head that sits low on the
// turf on a pair of rails. Smaller and more lofted as the number goes up.
function woodShape(club) {
  const step = clamp((club.loftDegrees - 15) / 9, 0, 1.2);
  const size = 1 - 0.072 * step;
  return {
    family: "wood",
    loft: club.loftDegrees * RADIANS,
    toePower: 0.86,
    heelPower: 0.9,
    depthPower: 0.9,
    crownPower: 0.58,
    solePower: 0.6,
    rim: -0.55 * size,
    length: 5.6 * size,
    setback: 2.25 * size,
    shear: Math.tan(club.loftDegrees * RADIANS),
    // A pear: full at the toe, widest a third of the way back, and drawn
    // in toward the tail, more so along the heel.
    width: (depth, side) =>
      5.08 *
      size *
      (0.92 + 0.08 * smoothstep(0.5, 0.05, depth)) *
      (1 - 0.28 * smoothstep(-0.15, -1, depth)) *
      (side < 0 ? 1.02 : 1 - 0.05 * smoothstep(0.1, -0.9, depth)),
    // Low and flat, a touch taller toward the toe at the face.
    crown: (depth, across) =>
      size *
      (2.02 * (0.3 + 0.7 * smoothstep(-1.1, 0.1, depth)) -
        0.2 * smoothstep(0.1, 0.5, depth)) *
      (1 - 0.07 * across * smoothstep(-0.1, 0.4, depth)),
    sole: (depth) => size * (-1.84 + 0.8 * smoothstep(-0.3, -1.05, depth)),
    // Two rails running back from just behind the leading edge.
    relief: (x, z) => {
      const rail = (centre) => {
        const u = clamp((x - centre) / (0.75 * size), -1, 1);
        return 0.5 + 0.5 * Math.cos(Math.PI * u);
      };
      return (
        0.14 *
        (rail(1.75 * size) + rail(-1.75 * size)) *
        smoothstep(-5.4 * size, -3.8 * size, z) *
        smoothstep(0.5, -0.3, z)
      );
    },
    bulge: 64,
    roll: 64,
    edge: 0.15,
    crownFinish: "carbon",
    bandRows: 0,
    face: {
      top: "#d6dae0",
      bottom: "#9da4ae",
      lineWidth: 0.05,
      rows: Array.from({ length: 7 }, (_, i) => (1.14 - 0.38 * i) * size),
      spans: [
        [-9, -1],
        [1, 9],
      ],
      box: { x: 0.55, bottom: -0.6 * size, top: 0.6 * size },
      rect: null,
      metalness: 0.95,
      roughness: 0.32,
    },
    hosel: {
      direction: [0.76, 0.56, 0.09],
      sink: 0.9,
      neck: 3.7,
      baseRadius: 0.76,
      topRadius: 0.58,
      flare: 0.3,
    },
    tipRadius: 0.44,
    mark: 0.19,
    port: { at: 0.7, radius: 0.62 },
    stamp: { z: -1.9, width: 2.5 },
  };
}

// Hybrids: compact and iron-like. A tall, upright face with a square toe, a
// short body whose crown falls away quickly, and a keel down the sole.
function hybridShape(club) {
  const step = clamp((club.loftDegrees - 17) / 11, 0, 1.2);
  const size = 1 - 0.056 * step;
  return {
    family: "hybrid",
    loft: club.loftDegrees * RADIANS,
    toePower: 0.72,
    heelPower: 0.92,
    depthPower: 0.82,
    crownPower: 0.58,
    solePower: 0.66,
    rim: -0.5 * size,
    length: 3.98 * size,
    setback: 1.66 * size,
    shear: Math.tan(club.loftDegrees * RADIANS),
    // Nearly parallel sides, closing to a blunt back.
    width: (depth, side) =>
      4.9 *
      size *
      (0.96 + 0.04 * smoothstep(0.5, 0.05, depth)) *
      (1 - 0.24 * smoothstep(-0.2, -1, depth)) *
      (side < 0 ? 1 : 1 - 0.06 * smoothstep(0.2, -0.9, depth)),
    // Tallest at the top line, higher at the toe, sloping straight off.
    crown: (depth, across) =>
      size *
      2 *
      (0.24 + 0.76 * smoothstep(-1.05, 0.3, depth)) *
      (1 - 0.2 * across * smoothstep(-0.3, 0.4, depth)),
    sole: (depth) => size * (-1.95 + 0.65 * smoothstep(-0.2, -1.05, depth)),
    // A keel down the middle of the sole.
    relief: (x, z) => {
      const u = clamp(x / (2.4 * size), -1, 1);
      return (
        0.13 *
        (0.5 + 0.5 * Math.cos(Math.PI * u)) *
        smoothstep(-5.6 * size, -4 * size, z) *
        smoothstep(0.6, -0.2, z)
      );
    },
    bulge: 110,
    roll: 110,
    edge: 0.13,
    crownFinish: "satin",
    bandRows: 5,
    face: {
      top: "#c3c8d0",
      bottom: "#8a919c",
      lineWidth: 0.05,
      rows: Array.from({ length: 10 }, (_, i) => (1.32 - 0.3 * i) * size),
      spans: [[-9, 9]],
      box: null,
      rect: null,
      metalness: 0.95,
      roughness: 0.36,
    },
    hosel: {
      direction: [0.78, 0.56, 0.05],
      sink: 0.9,
      neck: 4,
      baseRadius: 0.72,
      topRadius: 0.56,
      flare: 0.28,
    },
    tipRadius: 0.46,
    mark: 0.16,
    port: { at: 0.68, radius: 0.5 },
    stamp: { z: -1.6, width: 2.5 },
  };
}

const SHAPES = { driver: driverShape, wood: woodShape, hybrid: hybridShape };

// The face: tilted back by the head's loft, and gently curved both ways.
const faceDepth = (shape, x, y) =>
  -y * Math.tan(shape.loft) - (x * x) / shape.bulge - (y * y) / shape.roll;

// Map a point on the unit sphere onto the head, before the face is cut.
function headPoint(shape, point, target) {
  const across = power(
    point.x,
    point.x < 0 ? shape.toePower : shape.heelPower,
  );
  const depth = power(point.z, shape.depthPower);
  const x = across * shape.width(depth, across);

  // `rise` is 0 at the rim, 1 at the top of the crown or bottom of the sole.
  let y;
  if (point.y >= 0) {
    const rise = Math.pow(point.y, shape.crownPower);
    y = shape.rim + rise * (shape.crown(depth, across) - shape.rim);
  } else {
    const rise = Math.pow(-point.y, shape.solePower);
    y = shape.rim - rise * (shape.rim - shape.sole(depth, across));
  }
  const z =
    depth * shape.length -
    shape.setback -
    y * shape.shear * smoothstep(-0.5, 0.25, depth);
  if (shape.relief && point.y < 0) {
    y -= shape.relief(x, z) * smoothstep(0.3, 0.75, -point.y);
  }
  return target.set(x, y, z);
}

// The point on the crown (`top`) or the sole over a place on the ground.
function surfacePoint(shape, x, z, top) {
  const point = new THREE.Vector3(0, top ? 1 : -1, 0);
  let y = headPoint(shape, point, new THREE.Vector3()).y;
  const found = new THREE.Vector3(x, y, z);
  // Undo headPoint a step at a time: the lean of the front and the height
  // depend on each other, but only weakly.
  for (let i = 0; i < 12; i++) {
    let depth = (z + shape.setback) / shape.length;
    for (let k = 0; k < 6; k++) {
      depth =
        (z + shape.setback + y * shape.shear * smoothstep(-0.5, 0.25, depth)) /
        shape.length;
    }
    depth = clamp(depth, -1, 1);
    const across = clamp(x / shape.width(depth, x < 0 ? -1 : 1), -1, 1);
    const px = power(across, 1 / (x < 0 ? shape.toePower : shape.heelPower));
    const pz = power(depth, 1 / shape.depthPower);
    const py = Math.sqrt(Math.max(0, 1 - px * px - pz * pz));
    headPoint(shape, point.set(px, top ? py : -py, pz), found);
    y = found.y;
  }
  return found;
}

// --- head geometry ---

// Columns of the body run front to back, spaced round the face like the
// hours of a clock: 0 at the heel end of the rim, a quarter turn at the top.
// They crowd toward the rim, where the wall of the head turns upright.
const QUARTER_COLUMNS = 56;
const EDGE_ROWS = 6;
const BODY_ROWS = 64;
const FACE_RINGS = 12;

function columnAngles() {
  const angles = [];
  const ease = (s) => 0.35 * s + 0.65 * s * s;
  for (let quarter = 0; quarter < 4; quarter++) {
    for (let i = 0; i < QUARTER_COLUMNS; i++) {
      const s = i / QUARTER_COLUMNS;
      const within = quarter % 2 === 0 ? ease(s) : 1 - ease(1 - s);
      angles.push(((quarter + within) * Math.PI) / 2);
    }
  }
  return angles;
}

// Step a closed loop of points inward (in x and y) by `amount`.
function insetLoop(loop, amount) {
  const count = loop.length;
  return loop.map((point, j) => {
    const next = loop[(j + 1) % count];
    const previous = loop[(j + count - 1) % count];
    const tx = next.x - previous.x;
    const ty = next.y - previous.y;
    const length = Math.hypot(tx, ty) || 1;
    return new THREE.Vector2(
      point.x - (ty / length) * amount,
      point.y + (tx / length) * amount,
    );
  });
}

// Build the head as one watertight skin: the face, a rounded edge round it,
// and the body running back to the tail. Returns a geometry per finish, all
// sharing one set of smooth normals so no seam shows between them.
function buildShell(shape) {
  const angles = columnAngles();
  const columns = angles.length;
  const unit = new THREE.Vector3();
  const onSphere = (theta, phi) =>
    unit.set(
      Math.sin(theta) * Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
    );
  const body = (theta, phi, target) =>
    headPoint(shape, onSphere(theta, phi), target);

  // Where each column comes through the face.
  const scratch = new THREE.Vector3();
  const edgeTheta = angles.map((phi) => {
    let front = 0.05;
    let back = 2.6;
    for (let i = 0; i < 44; i++) {
      const middle = (front + back) / 2;
      body(middle, phi, scratch);
      if (scratch.z > faceDepth(shape, scratch.x, scratch.y)) front = middle;
      else back = middle;
    }
    return (front + back) / 2;
  });
  const edge = angles.map((phi, j) =>
    body(edgeTheta[j], phi, new THREE.Vector3()),
  );

  // The corner is rounded off between a loop on the face just inside it and
  // a loop on the body just behind it.
  const faceLoop = insetLoop(edge, shape.edge).map(
    (point) =>
      new THREE.Vector3(point.x, point.y, faceDepth(shape, point.x, point.y)),
  );
  const bodyTheta = angles.map((phi, j) => {
    let step = 0.03;
    for (let i = 0; i < 10; i++) {
      const reach = body(edgeTheta[j] + step, phi, scratch).distanceTo(edge[j]);
      step *= shape.edge / reach;
    }
    return edgeTheta[j] + step;
  });
  const bodyLoop = angles.map((phi, j) =>
    body(bodyTheta[j], phi, new THREE.Vector3()),
  );

  const rows = EDGE_ROWS + BODY_ROWS;
  const count = rows * columns + 1;
  const positions = new Float32Array(count * 3);
  // Where each vertex came from on the unit sphere, for laying out textures.
  const sphere = new Float32Array(count * 3);
  const put = (index, point, theta, phi) => {
    point.toArray(positions, index * 3);
    onSphere(theta, phi).toArray(sphere, index * 3);
  };
  for (let j = 0; j < columns; j++) {
    const phi = angles[j];
    for (let k = 0; k <= EDGE_ROWS; k++) {
      const t = k / EDGE_ROWS;
      scratch
        .copy(faceLoop[j])
        .multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(edge[j], 2 * t * (1 - t))
        .addScaledVector(bodyLoop[j], t * t);
      const theta = edgeTheta[j] + (bodyTheta[j] - edgeTheta[j]) * t;
      put(k * columns + j, scratch, theta, phi);
    }
    for (let i = 1; i < BODY_ROWS; i++) {
      const t = i / BODY_ROWS;
      const theta =
        bodyTheta[j] + (Math.PI - bodyTheta[j]) * (0.7 * t + 0.3 * t * t);
      put((EDGE_ROWS + i) * columns + j, body(theta, phi, scratch), theta, phi);
    }
  }
  const tail = rows * columns;
  put(tail, body(Math.PI, 0, scratch), Math.PI, 0);

  // Triangles, sorted by the finish they wear.
  const parts = { crown: [], band: [], sole: [] };
  for (let j = 0; j < columns; j++) {
    const next = (j + 1) % columns;
    for (let row = 0; row < rows; row++) {
      let part = parts.sole;
      if (j < columns / 2) {
        part = row < EDGE_ROWS + shape.bandRows ? parts.band : parts.crown;
        if (!shape.bandRows) part = parts.crown;
      }
      const a = row * columns + j;
      const b = row * columns + next;
      if (row === rows - 1) {
        part.push(a, tail, b);
      } else {
        const c = a + columns;
        const d = b + columns;
        part.push(a, c, b, b, c, d);
      }
    }
  }

  const position = new THREE.BufferAttribute(positions, 3);
  const whole = new THREE.BufferGeometry();
  whole.setAttribute("position", position);
  whole.setIndex([...parts.crown, ...parts.band, ...parts.sole]);
  whole.computeVertexNormals();
  const normal = whole.attributes.normal;

  // Crown: the weave is draped over the top like cloth, a tile every 1.2 cm.
  // Sole: brush marks in rings round the bottom of the head.
  const crownUv = new Float32Array(count * 2);
  const soleUv = new Float32Array(count * 2);
  const drape = shape.width(0, -1) / (Math.PI / 2) / 1.2;
  for (let i = 0; i < count; i++) {
    const px = sphere[i * 3];
    const py = sphere[i * 3 + 1];
    const pz = sphere[i * 3 + 2];
    const fromTop = Math.acos(clamp(py, -1, 1));
    const round = Math.atan2(pz, px);
    crownUv[i * 2] = fromTop * Math.cos(round) * drape;
    crownUv[i * 2 + 1] = fromTop * Math.sin(round) * drape;
    soleUv[i * 2] = 0.5;
    soleUv[i * 2 + 1] = 1 - fromTop / Math.PI;
  }
  const geometry = (indices, uv) => {
    const part = new THREE.BufferGeometry();
    part.setAttribute("position", position);
    part.setAttribute("normal", normal);
    part.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    part.setIndex(indices);
    return part;
  };

  // The face plate fills the loop, sharing its outer vertices with the edge.
  const box = new THREE.Box2().setFromPoints(
    faceLoop.map((point) => new THREE.Vector2(point.x, point.y)),
  );
  const centre = box.getCenter(new THREE.Vector2());
  const rect = shape.face.rect || {
    x0: box.min.x,
    x1: box.max.x,
    y0: box.min.y,
    y1: box.max.y,
  };
  const faceCount = FACE_RINGS * columns + 1;
  const facePositions = new Float32Array(faceCount * 3);
  const faceUv = new Float32Array(faceCount * 2);
  const putFace = (index, x, y, z) => {
    facePositions.set([x, y, z], index * 3);
    faceUv[index * 2] = (x - rect.x0) / (rect.x1 - rect.x0);
    faceUv[index * 2 + 1] = (y - rect.y0) / (rect.y1 - rect.y0);
  };
  putFace(0, centre.x, centre.y, faceDepth(shape, centre.x, centre.y));
  const faceIndices = [];
  for (let j = 0; j < columns; j++) {
    const next = (j + 1) % columns;
    for (let ring = 1; ring <= FACE_RINGS; ring++) {
      const index = 1 + (ring - 1) * columns + j;
      if (ring === FACE_RINGS) {
        putFace(index, faceLoop[j].x, faceLoop[j].y, faceLoop[j].z);
      } else {
        const out = ring / FACE_RINGS;
        const x = centre.x + (faceLoop[j].x - centre.x) * out;
        const y = centre.y + (faceLoop[j].y - centre.y) * out;
        putFace(index, x, y, faceDepth(shape, x, y));
      }
      const a = index;
      const b = 1 + (ring - 1) * columns + next;
      if (ring === 1) faceIndices.push(0, a, b);
      if (ring < FACE_RINGS) {
        faceIndices.push(a, a + columns, b + columns, a, b + columns, b);
      }
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute("position", new THREE.BufferAttribute(facePositions, 3));
  face.setAttribute("uv", new THREE.BufferAttribute(faceUv, 2));
  face.setIndex(faceIndices);
  face.computeVertexNormals();

  // Six times the volume inside the skin, summed a triangle at a time.
  const volume = (attribute, indices) => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let total = 0;
    for (let i = 0; i < indices.length; i += 3) {
      a.fromBufferAttribute(attribute, indices[i]);
      b.fromBufferAttribute(attribute, indices[i + 1]);
      c.fromBufferAttribute(attribute, indices[i + 2]);
      total += a.dot(b.cross(c));
    }
    return total;
  };
  const volumeCc =
    (volume(position, whole.index.array) +
      volume(face.attributes.position, faceIndices)) /
    6;
  whole.dispose();

  // The lowest reaches of the sole, a few to each patch of it, and points
  // round the bottom of the leading edge.
  const solePoints = [];
  const lowest = new Map();
  const vertex = new THREE.Vector3();
  const body3 = new THREE.Box3().setFromBufferAttribute(position);
  for (let i = EDGE_ROWS * columns; i < count; i++) {
    if (sphere[i * 3 + 1] > -0.45) continue;
    vertex.fromBufferAttribute(position, i);
    const cell =
      Math.floor(((vertex.x - body3.min.x) / (body3.max.x - body3.min.x)) * 5) *
        10 +
      Math.floor(((vertex.z - body3.min.z) / (body3.max.z - body3.min.z)) * 4);
    if (!lowest.has(cell) || vertex.y < lowest.get(cell).y) {
      lowest.set(cell, vertex.clone());
    }
  }
  solePoints.push(...lowest.values());
  for (const target of [-0.7, -0.35, 0, 0.35, 0.7]) {
    const x = target * box.max.x;
    let nearest = columns / 2;
    for (let j = columns / 2; j < columns; j++) {
      if (Math.abs(edge[j].x - x) < Math.abs(edge[nearest].x - x)) nearest = j;
    }
    for (const row of [EDGE_ROWS / 2, EDGE_ROWS]) {
      solePoints.push(
        new THREE.Vector3().fromBufferAttribute(
          position,
          row * columns + nearest,
        ),
      );
    }
  }

  return {
    crown: geometry(parts.crown, crownUv),
    band: shape.bandRows ? geometry(parts.band, crownUv) : null,
    sole: geometry(parts.sole, soleUv),
    face,
    faceLoop,
    faceBox: box,
    rect,
    bounds: body3,
    topEdge: bodyLoop[columns / 4],
    volumeCc,
    solePoints,
  };
}

// --- finishes ---

// Woven carbon for the crown: a fine twill that only shows under the gloss.
function carbonTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#040506";
  ctx.fillRect(0, 0, 64, 64);
  const cell = 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // 2/2 twill: the lit tow steps one cell each row
      const over = (col + row) % 4 < 2;
      const gradient = over
        ? ctx.createLinearGradient(col * cell, 0, (col + 1) * cell, 0)
        : ctx.createLinearGradient(0, row * cell, 0, (row + 1) * cell);
      gradient.addColorStop(0, "#050608");
      gradient.addColorStop(0.5, over ? "#15171c" : "#0c0d11");
      gradient.addColorStop(1, "#050608");
      ctx.fillStyle = gradient;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Brushed metal for the sole.
function soleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3a3e46";
  ctx.fillRect(0, 0, 512, 256);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // brush marks running round the head
  for (let i = 0; i < 900; i++) {
    const shade = 46 + Math.floor(random() * 34);
    ctx.strokeStyle = `rgba(${shade},${shade + 3},${shade + 9},0.5)`;
    ctx.lineWidth = 1;
    const y = random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// The milled face: score lines that stop short of the edge all the way
// round, as a colour map and a matching bump map that sinks them in.
function faceTextures(shape, shell) {
  const { rect } = shell;
  const style = shape.face;
  const width = 1024;
  const height = 512;
  const toX = (x) => ((x - rect.x0) / (rect.x1 - rect.x0)) * width;
  const toY = (y) => (1 - (y - rect.y0) / (rect.y1 - rect.y0)) * height;
  const perCm = height / (rect.y1 - rect.y0);
  const margin = insetLoop(shell.faceLoop, 0.32);

  const paint = (background, lineColor, boxColor) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background(ctx);
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    margin.forEach((point, i) => {
      if (i === 0) ctx.moveTo(toX(point.x), toY(point.y));
      else ctx.lineTo(toX(point.x), toY(point.y));
    });
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = style.lineWidth * perCm;
    for (const y of style.rows) {
      for (const [from, to] of style.spans) {
        ctx.beginPath();
        ctx.moveTo(toX(from), toY(y));
        ctx.lineTo(toX(to), toY(y));
        ctx.stroke();
      }
    }
    ctx.restore();

    if (style.box && boxColor) {
      // sweet-spot marks
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = style.lineWidth * perCm * 0.67;
      ctx.strokeRect(
        toX(-style.box.x),
        toY(style.box.top),
        toX(style.box.x) - toX(-style.box.x),
        toY(style.box.bottom) - toY(style.box.top),
      );
    }
    return canvas;
  };

  const map = new THREE.CanvasTexture(
    paint(
      (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, style.top);
        gradient.addColorStop(1, style.bottom);
        return gradient;
      },
      "rgba(30,34,40,0.75)",
      "rgba(30,34,40,0.55)",
    ),
  );
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(paint(() => "#fff", "#000", null));
  bumpMap.anisotropy = 8;
  return { map, bumpMap };
}

// The club's number and loft, to be engraved on the sole.
function stampTexture(club) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const number = parseInt(club.shortName, 10);
  const loft = `${club.loftDegrees}°`;
  const family = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textBaseline = "alphabetic";
  const write = (text, x, y) => {
    // a lit lower lip under the dark cut reads as engraving
    ctx.fillStyle = "rgba(235,238,244,0.5)";
    ctx.fillText(text, x, y + 3);
    ctx.fillStyle = "#0b0c0f";
    ctx.fillText(text, x, y);
  };
  if (Number.isFinite(number)) {
    ctx.textAlign = "right";
    ctx.font = `italic 700 200px ${family}`;
    write(String(number), 236, 208);
    ctx.textAlign = "left";
    ctx.font = `600 82px ${family}`;
    write(loft, 272, 150);
    ctx.fillStyle = `#${new THREE.Color(ACCENT_COLOR).getHexString()}`;
    ctx.fillRect(274, 172, 190, 14);
  } else {
    ctx.textAlign = "center";
    ctx.font = `italic 700 150px ${family}`;
    write(loft, 256, 170);
    ctx.fillStyle = `#${new THREE.Color(ACCENT_COLOR).getHexString()}`;
    ctx.fillRect(96, 198, 320, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// --- the club ---

export function buildWoodHead(club) {
  const shape = (SHAPES[club.category] || woodShape)(club);
  const shell = buildShell(shape);
  const group = new THREE.Group();
  group.name = club.id;

  const crownMaterial =
    shape.crownFinish === "carbon"
      ? new THREE.MeshPhysicalMaterial({
          map: carbonTexture(),
          metalness: 0.1,
          roughness: 0.6,
          // Keep the weave dark: the shine comes from the clear coat on top.
          specularIntensity: 0.25,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x0d0e12,
          metalness: 0.35,
          roughness: 0.46,
          clearcoat: 0.6,
          clearcoatRoughness: 0.38,
        });
  // Painted parts that join the crown (hosel, top line) without the weave.
  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0c0d11,
    metalness: 0.3,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const soleMaterial = new THREE.MeshPhysicalMaterial({
    map: soleTexture(),
    metalness: 0.9,
    roughness: 0.36,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dde3,
    metalness: 1,
    roughness: 0.18,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    metalness: 0.6,
    roughness: 0.35,
  });

  const crown = new THREE.Mesh(shell.crown, crownMaterial);
  crown.name = "crown";
  const sole = new THREE.Mesh(shell.sole, soleMaterial);
  sole.name = "sole";
  const face = new THREE.Mesh(
    shell.face,
    new THREE.MeshStandardMaterial({
      ...faceTextures(shape, shell),
      bumpScale: 0.6,
      metalness: shape.face.metalness,
      roughness: shape.face.roughness,
    }),
  );
  face.name = "face";
  // The face closes the skin, so it has to block the sun with the rest.
  crown.castShadow = sole.castShadow = face.castShadow = true;
  group.add(crown, sole, face);
  if (shell.band) {
    const band = new THREE.Mesh(shell.band, paintMaterial);
    band.name = "top-line";
    band.castShadow = true;
    group.add(band);
  }

  // A flat disc laid on the head at a point of the crown or sole.
  const seat = (object, x, z, top, lift) => {
    const spot = surfacePoint(shape, x, z, top);
    const behind = surfacePoint(shape, x, z - 0.2, top);
    // tip it to the slope of the head there
    const slope = Math.atan2(behind.y - spot.y, 0.2);
    object.position.copy(spot);
    object.position.y += top ? lift : -lift;
    object.rotation.x = slope;
    return object;
  };

  // Alignment mark on the crown, just behind the top of the face.
  const markHolder = new THREE.Group();
  const mark = new THREE.Mesh(
    new THREE.CircleGeometry(shape.mark, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  mark.rotation.x = -Math.PI / 2;
  markHolder.add(mark);
  seat(markHolder, 0, shell.topEdge.z - 0.35 - shape.mark, true, 0.02);
  group.add(markHolder);

  // A weight port set into the back of the sole, with a chrome surround. It
  // stands less proud on the heads that are played off the turf.
  const port = shape.port;
  const proud = club.teed ? 1 : 0.5;
  const weight = new THREE.Group();
  const plug = new THREE.Mesh(
    new THREE.CylinderGeometry(port.radius, port.radius, 0.2 * proud, 40),
    accentMaterial,
  );
  const surround = new THREE.Mesh(
    new THREE.TorusGeometry(port.radius + 0.07, 0.09 * proud, 12, 48),
    chromeMaterial,
  );
  surround.rotation.x = Math.PI / 2;
  surround.position.y = -0.08 * proud;
  weight.add(plug, surround);
  seat(weight, 0, shell.bounds.min.z * port.at, false, 0);
  group.add(weight);
  // The surround is the lowest thing on the back of the sole.
  weight.updateMatrix();
  const reach = port.radius + 0.07;
  const solePoints = shell.solePoints.concat(
    [
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ].map(([x, z]) =>
      new THREE.Vector3(x, -0.17 * proud, z).applyMatrix4(weight.matrix),
    ),
  );

  // The number and loft, engraved in the sole behind the leading edge.
  group.add(buildStamp(club, shape));

  const shaft = buildShaft(club, shape, shell.bounds.min.y);
  group.add(shaft);

  const loop = shell.faceBox;
  const crownTop = surfacePoint(
    shape,
    0,
    Math.max(-5, shell.bounds.min.z * 0.62),
    true,
  );
  group.userData = {
    solePoints,
    // The shaft's axis: a point on it, the way it rises, and how far up it
    // from that point the grip ends.
    shaft: shaft.userData,
    faceHeight: loop.max.y - loop.min.y,
    faceWidth: loop.max.x - loop.min.x,
    crownTop,
    // Not part of the contract, but handy for framing and for tests.
    headWidth: shell.bounds.max.x - shell.bounds.min.x,
    headDepth: shell.bounds.max.z - shell.bounds.min.z,
    headHeight: shell.bounds.max.y - shell.bounds.min.y,
    volumeCc: shell.volumeCc,
  };
  return group;
}

// A patch of the sole carrying the engraving. Seen from underneath with the
// face away from you it reads left to right, and it turns itself round when
// the club is mirrored for a left-hander so it still does.
function buildStamp(club, shape) {
  const { z, width } = shape.stamp;
  const depth = width / 2;
  const across = 16;
  const along = 8;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= along; i++) {
    for (let j = 0; j <= across; j++) {
      const u = j / across;
      const v = i / along;
      const spot = surfacePoint(
        shape,
        (u - 0.5) * width,
        z + (v - 0.5) * depth,
        false,
      );
      positions.push(spot.x, spot.y, spot.z);
      uvs.push(u, v);
      if (i < along && j < across) {
        const a = i * (across + 1) + j;
        const b = a + 1;
        const c = a + across + 1;
        indices.push(a, b, c, b, c + 1, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const map = stampTexture(club);
  const stamp = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      metalness: 0.5,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  stamp.name = "stamp";
  stamp.onBeforeRender = () => {
    const mirrored = stamp.matrixWorld.determinant() < 0;
    map.repeat.x = mirrored ? -1 : 1;
    map.offset.x = mirrored ? 1 : 0;
  };
  return stamp;
}

// Hosel, ferrule, shaft and grip, rising from the heel toward the hands.
function buildShaft(club, shape, soleHeight) {
  const parts = new THREE.Group();
  parts.name = "shaft";
  const { direction, sink, neck, baseRadius, topRadius, shoulder, flare } =
    shape.hosel;
  const lie = club.lieDegrees * RADIANS;
  const shaftDirection = new THREE.Vector3(Math.cos(lie), Math.sin(lie), 0);
  const upright = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    shaftDirection,
  );
  // Start a little inside the crown at the heel so the neck grows out of it.
  const base = headPoint(
    shape,
    new THREE.Vector3(...direction).normalize(),
    new THREE.Vector3(),
  ).addScaledVector(shaftDirection, -sink);
  // Lay a part along the shaft with its middle `distance` up from the base.
  const place = (mesh, distance) => {
    mesh.position.copy(base).addScaledVector(shaftDirection, distance);
    mesh.quaternion.copy(upright);
    parts.add(mesh);
    return mesh;
  };

  const paintMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0c0d11,
    metalness: 0.3,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dde3,
    metalness: 1,
    roughness: 0.18,
  });

  // The neck. On the driver it leaves the head through a round shoulder; on
  // the smaller heads it flares out of the heel like the bell of a trumpet.
  const profile = [];
  const foot = shoulder ? 0.6 - shoulder * 1.2 : -1.6;
  for (let i = 0; i <= 56; i++) {
    const h = foot + (neck - foot) * (i / 56);
    const taper =
      baseRadius + (topRadius - baseRadius) * clamp(h / neck, 0, 1);
    let radius;
    if (shoulder) {
      const offset = (h - 0.6) / (shoulder * 1.2);
      const bulb = shoulder * Math.sqrt(Math.max(0, 1 - offset * offset));
      // the larger of the two, with the hollow between them filled in
      const blend = clamp(0.5 + (bulb - taper) / 0.6, 0, 1);
      radius = taper + (bulb - taper) * blend + 0.3 * blend * (1 - blend);
      if (h < 0.6) radius = Math.min(radius, bulb + 0.02);
    } else {
      radius = taper + flare * Math.exp(-Math.max(h, 0) / 0.8);
    }
    profile.push(new THREE.Vector2(radius, h));
  }
  const hosel = place(
    new THREE.Mesh(new THREE.LatheGeometry(profile, 40), paintMaterial),
    0,
  );
  hosel.name = "hosel";
  hosel.castShadow = true;

  place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        topRadius + 0.03,
        topRadius + 0.03,
        0.16,
        40,
      ),
      chromeMaterial,
    ),
    neck + 0.05,
  );
  place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        shape.tipRadius + 0.03,
        topRadius + 0.02,
        1.6,
        32,
      ),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    ),
    neck + 0.9,
  );

  // The club's length runs from the ground at the heel to the end of the
  // grip, measured along the shaft.
  const toGround = (base.y - soleHeight) / Math.sin(lie);
  const butt = club.lengthInches * CM_PER_INCH - toGround;
  const shaftStart = neck + 1.6;
  const shaftEnd = butt - GRIP_LENGTH + 1;
  const shaft = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.62,
        shape.tipRadius,
        shaftEnd - shaftStart,
        32,
      ),
      new THREE.MeshPhysicalMaterial({
        color: SHAFT_COLOR,
        metalness: 0.3,
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      }),
    ),
    (shaftStart + shaftEnd) / 2,
  );
  shaft.castShadow = true;

  const grip = place(
    new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 0.95, GRIP_LENGTH, 32),
      new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }),
    ),
    butt - GRIP_LENGTH / 2,
  );
  grip.castShadow = true;
  parts.userData = { point: base, direction: shaftDirection, length: butt };
  return parts;
}
