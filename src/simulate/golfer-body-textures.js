import * as THREE from "three";

// Cloth, leather and stitching for the golfer, painted on canvases: a colour
// map and a height map that is turned into a normal map. Canvas x runs around
// the body (u), canvas y from the top of the garment down.

// jsdom has no canvas to paint on.
export const canPaint = () =>
  typeof document !== "undefined" &&
  !(typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent));

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = (hex) => `#${hex.toString(16).padStart(6, "0")}`;

function canvas(size) {
  const element = document.createElement("canvas");
  element.width = element.height = size;
  return element;
}

// Fill both canvases pixel by pixel: colour(x, y, noise) -> [r, g, b] and
// height(x, y) -> 0..255 (128 is flat).
function weave(size, colour, height, seed) {
  const colourCanvas = canvas(size);
  const heightCanvas = canvas(size);
  const colourCtx = colourCanvas.getContext("2d");
  const heightCtx = heightCanvas.getContext("2d");
  const colourData = colourCtx.createImageData(size, size);
  const heightData = heightCtx.createImageData(size, size);
  const next = random(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = colour(x, y, next());
      const h = height(x, y);
      colourData.data.set([r, g, b, 255], i);
      heightData.data.set([h, h, h, 255], i);
    }
  }
  colourCtx.putImageData(colourData, 0, 0);
  heightCtx.putImageData(heightData, 0, 0);
  return { colourCanvas, heightCanvas, colourCtx, heightCtx };
}

// Folds in the cloth, as a smooth height (in texels) over the canvas: each is
// a patch of ripples - centre (u, v), spread, the heading the ripples run
// across, their wavelength in texels and their depth. Too gentle to survive
// eight bits of height map, so they are added while the normals are worked out.
function folds(size, list) {
  return (x, y) => {
    const u = x / size;
    const v = y / size;
    let h = 0;
    for (const [u0, v0, su, sv, heading, wave, depth, phase = 0] of list) {
      let du = Math.abs(u - u0);
      if (du > 0.5) du = 1 - du;
      const dv = v - v0;
      const mask = Math.exp(-(du * du) / (su * su) - (dv * dv) / (sv * sv));
      if (mask < 0.02) continue;
      const across = x * Math.cos(heading) + y * Math.sin(heading);
      const bend =
        0.6 *
        Math.sin(
          (x * Math.sin(heading) - y * Math.cos(heading)) / (wave * 1.7) +
            phase * 3,
        );
      h +=
        depth * mask * Math.sin((across / wave) * 2 * Math.PI + phase + bend);
    }
    return h;
  };
}

function normalsFrom(heightCanvas, strength, fold = null) {
  const size = heightCanvas.width;
  const source = heightCanvas
    .getContext("2d")
    .getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const ctx = out.getContext("2d");
  const image = ctx.createImageData(size, size);
  const at = (x, y) =>
    source[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = ((at(x + 1, y) - at(x - 1, y)) / 255) * strength;
      let dy = ((at(x, y + 1) - at(x, y - 1)) / 255) * strength;
      if (fold) {
        dx += (fold(x + 1, y) - fold(x - 1, y)) / 2;
        dy += (fold(x, y + 1) - fold(x, y - 1)) / 2;
      }
      const length = Math.hypot(dx, dy, 1);
      image.data.set(
        [
          (-dx / length) * 127.5 + 127.5,
          (dy / length) * 127.5 + 127.5,
          (1 / length) * 127.5 + 127.5,
          255,
        ],
        (y * size + x) * 4,
      );
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

function finish({ colourCanvas, heightCanvas }, strength, fold = null) {
  if (fold) shadeFolds(colourCanvas, fold);
  const map = new THREE.CanvasTexture(colourCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(
    normalsFrom(heightCanvas, strength, fold),
  );
  normalMap.anisotropy = 8;
  map.wrapS = normalMap.wrapS = THREE.RepeatWrapping;
  return { map, normalMap };
}

// Darken the colour map a little down in the folds, lighten it on their
// crests: the shading a fold keeps whatever the light is doing.
function shadeFolds(colourCanvas, fold) {
  const size = colourCanvas.width;
  const ctx = colourCanvas.getContext("2d");
  const image = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = 1 + Math.max(-0.16, Math.min(0.08, fold(x, y) * 0.022));
      const i = (y * size + x) * 4;
      image.data[i] *= k;
      image.data[i + 1] *= k;
      image.data[i + 2] *= k;
    }
  }
  ctx.putImageData(image, 0, 0);
}

// Stroke the same path on the colour map and, as a ridge or a groove, on the
// height map.
function seam(painted, path, { colour, level, width }) {
  const { colourCtx, heightCtx } = painted;
  for (const [ctx, style, scale] of [
    [colourCtx, colour, 1],
    [heightCtx, `rgb(${level},${level},${level})`, 1.6],
  ]) {
    if (!style) continue;
    ctx.save();
    ctx.strokeStyle = style;
    ctx.lineWidth = width * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
    ctx.restore();
  }
}

const line = (points) => (ctx) => {
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
};

// Piqué knit in heathered grey.
const SHIRT = [203, 208, 216];
function knit(size, seed) {
  return weave(
    size,
    (x, y, noise) => {
      const streak = Math.sin(y * 1.7 + Math.sin(x * 0.05) * 3) * 2.5;
      const shade = (noise - 0.5) * 14 + streak;
      return SHIRT.map((channel) => channel + shade);
    },
    (x, y) => {
      const row = Math.floor(y / 3);
      const cell = Math.cos(((x + (row % 2) * 3) * Math.PI) / 3);
      return 128 + 30 * cell * Math.cos((y * Math.PI) / 3);
    },
    seed,
  );
}

// The polo's body: u = 0.5 is the middle of the chest, the top edge is the
// collar. An open neck shows skin; below it a placket with two buttons.
export function shirtMaps(skinColor) {
  const size = 1024;
  const painted = knit(size, 11);
  const { colourCtx, heightCtx } = painted;
  const mid = size / 2;
  const neck = [
    [mid - 120, 0],
    [mid - 62, 44],
    [mid - 26, 96],
    [mid, 150],
    [mid + 26, 96],
    [mid + 62, 44],
    [mid + 120, 0],
  ];

  // placket
  const top = 138;
  const bottom = 300;
  const half = 17;
  colourCtx.fillStyle = "rgba(255,255,255,0.10)";
  colourCtx.fillRect(mid - half, top, half * 2, bottom - top);
  heightCtx.fillStyle = "rgba(255,255,255,0.22)";
  heightCtx.fillRect(mid - half, top, half * 2, bottom - top);
  seam(
    painted,
    line([
      [mid - half, top],
      [mid - half, bottom],
      [mid + half, bottom],
      [mid + half, top],
    ]),
    { colour: "rgba(120,126,138,0.75)", level: 40, width: 2 },
  );
  seam(
    painted,
    line([
      [mid - half, bottom - 20],
      [mid + half, bottom - 20],
    ]),
    { colour: "rgba(120,126,138,0.6)", level: 60, width: 1.5 },
  );
  for (const y of [190, 252]) {
    for (const [ctx, fill, rim] of [
      [colourCtx, "#f1efe8", "#9a9fa8"],
      [heightCtx, "#ffffff", "#606060"],
    ]) {
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(mid, y, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(mid, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    colourCtx.fillStyle = "#8d9097";
    for (const [dx, dy] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ]) {
      colourCtx.fillRect(mid + dx - 0.75, y + dy - 0.75, 1.5, 1.5);
    }
  }

  // open neck
  for (const [ctx, fill] of [
    [colourCtx, css(skinColor)],
    [heightCtx, "#5a5a5a"],
  ]) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    line(neck)(ctx);
    ctx.closePath();
    ctx.fill();
  }
  seam(painted, line(neck), {
    colour: "rgba(150,156,166,0.9)",
    level: 215,
    width: 5,
  });

  // side seams
  for (const u of [0.25, 0.75]) {
    seam(
      painted,
      line([
        [u * size, 0],
        [u * size, size],
      ]),
      { colour: "rgba(120,126,138,0.35)", level: 70, width: 1.5 },
    );
  }
  return finish(
    painted,
    1.8,
    // u: 0 the middle of the back, 0.25 and 0.75 the sides, 0.5 the chest
    folds(size, [
      // gathered into the belt, all the way round
      [0, 0.86, 0.5, 0.1, 0.12, 46, 1.92, 0.4],
      [0.5, 0.86, 0.5, 0.1, -0.15, 58, 1.8, 2.1],
      [0.25, 0.8, 0.12, 0.14, 0.5, 64, 2.4, 1],
      [0.75, 0.8, 0.12, 0.14, -0.5, 64, 2.4, 4],
      // dragged out of the armpits toward the chest and the shoulder blades
      [0.33, 0.36, 0.07, 0.1, 0.95, 52, 2.7, 0.7],
      [0.67, 0.36, 0.07, 0.1, -0.95, 52, 2.7, 2.9],
      [0.17, 0.36, 0.07, 0.1, -0.95, 52, 2.4, 5],
      [0.83, 0.36, 0.07, 0.1, 0.95, 52, 2.4, 1.6],
      // hanging off the shoulder blades and across the small of the back
      [0, 0.56, 0.16, 0.12, 1.45, 70, 1.92, 2],
      [0.08, 0.3, 0.06, 0.07, 0.3, 60, 1.32, 3],
      [0.92, 0.3, 0.06, 0.07, -0.3, 60, 1.32, 0.3],
      // slack down the front
      [0.5, 0.62, 0.14, 0.14, 1.3, 84, 1.56, 1.2],
    ]),
  );
}

// A sleeve: the bottom edge is the hem, with a ribbed band above it.
export function sleeveMaps() {
  const size = 512;
  const painted = knit(size, 23);
  const { colourCtx, heightCtx } = painted;
  const band = 40;
  colourCtx.fillStyle = "rgba(60,66,80,0.16)";
  colourCtx.fillRect(0, size - band, size, band);
  heightCtx.fillStyle = "#808080";
  heightCtx.fillRect(0, size - band, size, band);
  for (let x = 0; x < size; x += 6) {
    heightCtx.fillStyle = "#b8b8b8";
    heightCtx.fillRect(x, size - band, 3, band);
  }
  seam(
    painted,
    line([
      [0, size - band],
      [size, size - band],
    ]),
    { colour: "rgba(110,116,128,0.7)", level: 50, width: 2.5 },
  );
  return finish(painted, 1.8);
}

// One trouser leg: the top edge is the waistband, the bottom the hem. u = 0
// is the back of the leg, 0.25 the outside, 0.5 the front, 0.75 the inside.
// Above the crotch only u < 0.5 shows (back seam round to the fly).
export function trouserMaps() {
  const size = 1024;
  const painted = weave(
    size,
    (x, y, noise) => {
      const shade = (noise - 0.5) * 12 + Math.sin((x + y) * 1.2566) * 0.8;
      return [27 + shade, 36 + shade, 62 + shade];
    },
    (x, y) => 128 + 16 * Math.sin((x + y) * 1.2566),
    37,
  );
  const stitch = "rgba(74,88,124,0.75)";
  const crotch = 0.2 * size;

  // pressed creases, front and back, from the hip down
  for (const u of [0, 0.5, 1]) {
    seam(
      painted,
      line([
        [u * size, crotch + 40],
        [u * size, size],
      ]),
      { colour: "rgba(120,134,170,0.22)", level: 235, width: 5 },
    );
  }
  // outside and inside leg seams
  seam(
    painted,
    line([
      [0.25 * size, 0],
      [0.25 * size, size],
    ]),
    { colour: stitch, level: 60, width: 1.5 },
  );
  seam(
    painted,
    line([
      [0.75 * size, crotch],
      [0.75 * size, size],
    ]),
    { colour: stitch, level: 60, width: 1.5 },
  );
  // waistband and hem
  seam(
    painted,
    line([
      [0, 46],
      [size, 46],
    ]),
    { colour: stitch, level: 55, width: 2 },
  );
  seam(
    painted,
    line([
      [0, size - 16],
      [size, size - 16],
    ]),
    { colour: stitch, level: 60, width: 1.5 },
  );
  // slant pocket at the front of the hip
  seam(
    painted,
    line([
      [0.385 * size, 50],
      [0.3 * size, 150],
      [0.262 * size, 176],
    ]),
    { colour: "rgba(10,14,28,0.9)", level: 20, width: 3.5 },
  );
  seam(
    painted,
    line([
      [0.397 * size, 50],
      [0.312 * size, 154],
    ]),
    { colour: stitch, level: 90, width: 1 },
  );
  // welt pocket on the seat
  seam(
    painted,
    line([
      [0.07 * size, 104],
      [0.185 * size, 98],
    ]),
    { colour: "rgba(10,14,28,0.9)", level: 20, width: 4 },
  );
  // fly
  seam(
    painted,
    (ctx) => {
      ctx.moveTo(0.462 * size, 46);
      ctx.lineTo(0.462 * size, 150);
      ctx.quadraticCurveTo(0.465 * size, 178, 0.497 * size, 186);
    },
    { colour: stitch, level: 70, width: 1.5 },
  );
  return finish(
    painted,
    2.6,
    // v: 0.2 the crotch, 0.59 the knee, 1 the hem
    folds(size, [
      // whiskers out of the crotch, across the front of the hip and thigh
      [0.6, 0.24, 0.13, 0.07, 1.1, 58, 5, 0.3],
      [0.42, 0.27, 0.1, 0.08, 1.95, 66, 4, 2],
      // under the seat
      [0.06, 0.3, 0.12, 0.035, 1.5, 44, 5, 1],
      [0.94, 0.3, 0.12, 0.035, 1.64, 44, 5, 3],
      // behind the knee, and the cloth bagging over the front of it
      [0, 0.6, 0.2, 0.045, 1.52, 40, 6, 0.6],
      [0.5, 0.55, 0.14, 0.05, 1.4, 60, 3.4, 4],
      [0.5, 0.66, 0.14, 0.04, 1.75, 56, 3, 1.3],
      // down the shin
      [0.4, 0.8, 0.2, 0.1, 0.5, 90, 2.4, 2.2],
      // stacked on the shoe
      [0.5, 0.95, 0.5, 0.045, 1.5, 34, 6, 0.9],
    ]),
  );
}

// A shoe upper: canvas y runs from the heel (top) to the toe; x around the
// foot with the top of the foot at u = 0. White leather with a navy saddle.
export function shoeMaps() {
  const size = 512;
  const next = random(53);
  const grain = new Float32Array(size * size);
  for (let i = 0; i < grain.length; i++) grain[i] = next();
  const painted = weave(
    size,
    (x, y, noise) => {
      const shade = (noise - 0.5) * 6;
      return [244 + shade, 244 + shade, 240 + shade];
    },
    (x, y) => 128 + (grain[y * size + x] - 0.5) * 36,
    59,
  );
  const { colourCtx, heightCtx } = painted;
  const saddle = [0.27 * size, 0.6 * size];
  colourCtx.fillStyle = "#1c2742";
  colourCtx.fillRect(0, saddle[0], size, saddle[1] - saddle[0]);
  colourCtx.fillRect(0, 0, size, 0.05 * size);
  heightCtx.fillStyle = "rgba(255,255,255,0.25)";
  heightCtx.fillRect(0, saddle[0], size, saddle[1] - saddle[0]);
  for (const y of [saddle[0] - 5, saddle[1] + 5, 0.05 * size + 5]) {
    seam(
      painted,
      (ctx) => {
        ctx.setLineDash([5, 4]);
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
      },
      { colour: "rgba(150,152,158,0.9)", level: 70, width: 1.5 },
    );
  }
  // toe cap
  seam(
    painted,
    (ctx) => {
      ctx.setLineDash([2, 5]);
      ctx.moveTo(0, 0.8 * size);
      ctx.lineTo(size, 0.8 * size);
    },
    { colour: "rgba(120,122,128,0.9)", level: 40, width: 2.5 },
  );
  return finish(painted, 1.6);
}

// Leather grain for the glove and belt.
export function leatherNormals() {
  const size = 128;
  const next = random(71);
  const painted = weave(
    size,
    () => [255, 255, 255],
    () => 128 + (next() - 0.5) * 70,
    73,
  );
  const normalMap = new THREE.CanvasTexture(
    normalsFrom(painted.heightCanvas, 1.2),
  );
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 6);
  return normalMap;
}

// The range has no environment map, and metal with nothing to reflect is
// black: sky above, turf below, for the buckle and the chain to mirror.
export function surroundings() {
  const element = document.createElement("canvas");
  element.width = 64;
  element.height = 32;
  const ctx = element.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 32);
  sky.addColorStop(0, "#6f9fdc");
  sky.addColorStop(0.45, "#f4f6f8");
  sky.addColorStop(0.55, "#8fa27c");
  sky.addColorStop(1, "#2f4a25");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(12, 4, 8, 5);
  const texture = new THREE.CanvasTexture(element);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
