import * as THREE from "three";
import {
  RANGE_LENGTH,
  FAIRWAY_HALF_WIDTH,
  SUN_DIRECTION,
  SUN_COLOR,
  HORIZON_COLOR,
  canvasTexture,
  valueNoise,
  fbm,
  terrainHeight,
} from "./shared";

// Scene units are yards. The tee is at the origin and the range runs down +z.

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// The ground is a disc (a square grid with its corners pulled in) and the
// mountain rings share its centre, a little downrange of the tee.
const CENTRE_Z = 100;
const GROUND = {
  radius: 1540,
  // 5 yd cells out to here, growing by `growth` per cell beyond.
  fineHalfWidth: 420,
  fineZMin: -360,
  fineZMax: 800,
  fineStep: 5,
  growth: 1.2,
};

const TURF_COLORS = {
  fairwayLight: 0x66b548, // stripe mown away from the tee
  fairwayDark: 0x4a9a3c, // stripe mown toward the tee
  firstCut: 0x4a9237,
  roughLight: 0x4f8a33,
  roughDark: 0x2f6424,
  meadow: 0x66883a, // wild grass beyond the rough
  straw: 0xa89f5c, // wild grass where it has dried out on the slopes
  dry: 0xa9b356, // tint of worn patches on the mown turf
};

const TURF = {
  fairwayZMin: -10,
  fairwayZMax: RANGE_LENGTH + 20,
  fairwayFarRadius: 48, // rounding of the far end
  fairwayNearRadius: 5,
  edgeOutset: 1.5, // fairway edge sits this far outside FAIRWAY_HALF_WIDTH...
  edgeWobble: 2.6, // ...and wanders by this much either way
  edgeNoise: 3, // extra irregularity from the mottling noise
  firstCutWidth: 4.5,
  meadowStart: 62, // yards beyond the fairway edge where rough gives way
  meadowBlend: 45,
  stripeWidth: 12.5,
  crossWidth: 8.4, // the faint diagonal cut
  crossContrast: 0.04,
  // Tile sizes in yards of the repeating textures.
  detailNear: 2, // blade scale
  detailMid: 9.7, // the same texture again, as clumps
  tuft: 14,
  mottle: 67,
  patch: 420,
  // How strongly blade detail (albedo and normal) shows per zone.
  fairwayRelief: 0.65,
  firstCutRelief: 0.7,
  roughRelief: 1,
  bump: 0.55, // normal-map strength
  bumpMid: 0.6, // weight of the clump-scale normals
  roughness: 0.95,
  fairwayRoughness: 0.88, // multiplier: mown grass has a little more sheen
};

// Rings of mountains, nearest first. `inner`/`outer` are radii from
// (0, CENTRE_Z); `height` is the tallest downrange peak above the land it
// stands on; `feature` the size of the largest ridges; `haze` how far the
// layer has faded toward the horizon colour.
const MOUNTAIN_LAYERS = [
  { inner: 620, outer: 900, height: 88, feature: 170, haze: 0.18, seed: 11.3 },
  { inner: 820, outer: 1140, height: 155, feature: 220, haze: 0.32, seed: 47.9 },
  { inner: 1020, outer: 1340, height: 210, feature: 270, haze: 0.45, seed: 83.1 },
  { inner: 1210, outer: 1500, height: 260, feature: 310, haze: 0.56, seed: 129.7 },
];

const MOUNTAINS = {
  columns: 640, // around the ring, packed tighter downrange
  rows: 22, // across each ring
  downrangeDensity: 0.45, // 0 = even spacing; toward 1 = all detail downrange
  crest: 0.55, // where across the ring the ridge line runs
  behindScale: 0.5, // height behind the tee relative to downrange
  massif: 420, // length scale of peaks and passes along a range
  sink: 4, // rings start this far under the land so they grow out of it
  treeline: 95, // yards above the surrounding land
  snowline: 160,
  sun: 0.85, // direct light strength in the baked shading
  ambient: 0.4, // sky light strength
  shadow: 0.8, // darkness of shadows cast by ridges toward the sun
  blue: 0.55, // how much haze also shifts a layer toward `blueTint`
  mist: 0.15, // extra haze pooled at the foot of each range
  mistDepth: 0.4, // fraction of a layer's height the mist reaches up
  // Fallbacks; the live scene fog is read every frame when there is one.
  fogNear: 260,
  fogFar: 1500,
};

const MOUNTAIN_COLORS = {
  forestDark: 0x2c4a2b,
  forestLight: 0x45663a,
  alpine: 0x7b8650,
  rock: 0x8b857a,
  rockDark: 0x5d5a56,
  snow: 0xf2f5fa,
  blueTint: 0x7e9bc0,
  sky: 0xcfe0f5,
};

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

// Tiling value noise: a `cells` x `cells` lattice stretched over the tile.
function periodicNoise(size, cells, random) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const v = ty * ty * (3 - 2 * ty);
    const row0 = (iy % cells) * cells;
    const row1 = ((iy + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const u = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells;
      const x1 = (ix + 1) % cells;
      const top = lattice[row0 + x0] * (1 - u) + lattice[row0 + x1] * u;
      const bottom = lattice[row1 + x0] * (1 - u) + lattice[row1 + x1] * u;
      out[y * size + x] = top * (1 - v) + bottom * v;
    }
  }
  return out;
}

function periodicFbm(size, baseCells, octaves, random) {
  const out = new Float32Array(size * size);
  let amplitude = 1;
  for (let o = 0; o < octaves; o++) {
    const layer = periodicNoise(size, baseCells << o, random);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude;
    amplitude *= 0.5;
  }
  return out;
}

// Recentre a field on `mean` with the given standard deviation. The shader
// reads these as "value - 0.5", so a mip-mapped (averaged) texel contributes
// nothing and detail fades out with distance instead of shimmering.
function normalise(field, mean, deviation) {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += field[i];
  const average = sum / field.length;
  let variance = 0;
  for (let i = 0; i < field.length; i++) {
    variance += (field[i] - average) * (field[i] - average);
  }
  const scale = deviation / Math.sqrt(variance / field.length || 1);
  for (let i = 0; i < field.length; i++) {
    field[i] = Math.min(1, Math.max(0, mean + (field[i] - average) * scale));
  }
  return field;
}

// A tiling texture holding raw numbers rather than colours.
function dataTexture(size, anisotropy, fill) {
  const texture = canvasTexture(size, size, (ctx) => {
    const image = ctx.createImageData(size, size);
    fill(image.data);
    ctx.putImageData(image, 0, 0);
  });
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

// Three independent noise fields in r, g, b. The ground samples it at three
// scales (patches, mottling, tufts) and the mountains at two.
function macroTexture(random, anisotropy) {
  const size = 256;
  const channels = [0, 1, 2].map(() =>
    normalise(periodicFbm(size, 4, 5, random), 0.5, 0.18),
  );
  return dataTexture(size, anisotropy, (data) => {
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = channels[0][i] * 255;
      data[i * 4 + 1] = channels[1][i] * 255;
      data[i * 4 + 2] = channels[2][i] * 255;
      data[i * 4 + 3] = 255;
    }
  });
}

// Blades of grass seen from above, as a height field (blade tips high, the
// thatch between them low) plus a per-blade hue shift. Both the albedo detail
// and the normal map come from it, so highlights sit on the blades.
function grassTextures(random, anisotropy) {
  const size = 512;
  const mask = size - 1;
  const height = periodicFbm(size, 32, 2, random);
  for (let i = 0; i < height.length; i++) height[i] *= 0.16;
  const hue = new Float32Array(size * size);

  const splat = (x, y, h, tint) => {
    const i = ((y & mask) << 9) | (x & mask);
    if (h > height[i]) {
      height[i] = h;
      hue[i] = tint;
    }
  };
  for (let blade = 0; blade < 30000; blade++) {
    let x = random() * size;
    let y = random() * size;
    let angle = random() * Math.PI * 2;
    const bend = (random() - 0.5) * 0.14;
    const length = 7 + random() * 13;
    const top = 0.5 + random() * 0.5;
    const tint = random() * 2 - 1;
    for (let s = 0; s < length; s += 0.6) {
      const h = top * (0.35 + (0.65 * s) / length);
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      splat(ix, iy, h, tint);
      splat(ix + 1, iy, h * 0.8, tint);
      splat(ix, iy + 1, h * 0.8, tint);
      x += Math.cos(angle) * 0.6;
      y += Math.sin(angle) * 0.6;
      angle += bend;
    }
  }

  // Albedo detail is a multiplier around 0.5 (the shader doubles it).
  const channels = [0.1, 0, -0.12].map((shift) => {
    const channel = new Float32Array(size * size);
    let sum = 0;
    for (let i = 0; i < channel.length; i++) {
      channel[i] = (0.42 + 0.58 * height[i]) * (1 + shift * hue[i]);
      sum += channel[i];
    }
    const scale = 0.5 / (sum / channel.length);
    for (let i = 0; i < channel.length; i++) channel[i] *= scale;
    return channel;
  });
  const detail = dataTexture(size, anisotropy, (data) => {
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = Math.min(255, channels[0][i] * 255);
      data[i * 4 + 1] = Math.min(255, channels[1][i] * 255);
      data[i * 4 + 2] = Math.min(255, channels[2][i] * 255);
      data[i * 4 + 3] = 255;
    }
  });

  const soft = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          sum += height[(((y + oy) & mask) << 9) | ((x + ox) & mask)];
        }
      }
      soft[(y << 9) | x] = sum / 9;
    }
  }
  const normal = dataTexture(size, anisotropy, (data) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = y << 9;
        const dx = soft[row | ((x + 1) & mask)] - soft[row | ((x - 1) & mask)];
        const dy =
          soft[(((y + 1) & mask) << 9) | x] - soft[(((y - 1) & mask) << 9) | x];
        const nx = -dx * 3;
        const ny = -dy * 3;
        const inverse = 1 / Math.hypot(nx, ny, 1);
        const i = (row | x) * 4;
        data[i] = (nx * inverse * 0.5 + 0.5) * 255;
        data[i + 1] = (ny * inverse * 0.5 + 0.5) * 255;
        data[i + 2] = (inverse * 0.5 + 0.5) * 255;
        data[i + 3] = 255;
      }
    }
  });

  return { detail, normal };
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

// Evenly spaced between fineMin and fineMax, then cells that grow out to the
// limits.
function gridAxis(fineMin, fineMax, step, min, max, growth) {
  const values = [];
  const count = Math.round((fineMax - fineMin) / step);
  for (let i = 0; i <= count; i++) values.push(fineMin + i * step);
  let size = step;
  let v = fineMin;
  while (v > min) {
    size *= growth;
    v = Math.max(min, v - size);
    values.unshift(v);
  }
  size = step;
  v = fineMax;
  while (v < max) {
    size *= growth;
    v = Math.min(max, v + size);
    values.push(v);
  }
  return values;
}

function buildGroundGeometry() {
  const { radius, fineHalfWidth, fineZMin, fineZMax, fineStep, growth } =
    GROUND;
  const xs = gridAxis(
    -fineHalfWidth,
    fineHalfWidth,
    fineStep,
    -radius,
    radius,
    growth,
  );
  const zs = gridAxis(
    fineZMin,
    fineZMax,
    fineStep,
    CENTRE_Z - radius,
    CENTRE_Z + radius,
    growth,
  );
  const nx = xs.length;
  const nz = zs.length;
  const positions = new Float32Array(nx * nz * 3);
  const normals = new Float32Array(nx * nz * 3);
  const e = 2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let x = xs[i];
      let z = zs[j];
      const r = Math.hypot(x, z - CENTRE_Z);
      if (r > radius) {
        x *= radius / r;
        z = CENTRE_Z + ((z - CENTRE_Z) * radius) / r;
      }
      const slopeX =
        (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
      const slopeZ =
        (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
      const inverse = 1 / Math.hypot(slopeX, 1, slopeZ);
      const o = (j * nx + i) * 3;
      positions[o] = x;
      positions[o + 1] = terrainHeight(x, z);
      positions[o + 2] = z;
      normals[o] = -slopeX * inverse;
      normals[o + 1] = inverse;
      normals[o + 2] = -slopeZ * inverse;
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

const f = (value) => Number(value).toFixed(4);

const TURF_VERTEX_PARS = /* glsl */ `
varying vec3 vTerrainPos;
varying float vTerrainSlope;
`;

const TURF_VERTEX = /* glsl */ `
vTerrainPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vTerrainSlope = 1.0 - normal.y;
`;

function turfFragmentPars() {
  const centre = (TURF.fairwayZMin + TURF.fairwayZMax) / 2;
  const halfLength = (TURF.fairwayZMax - TURF.fairwayZMin) / 2;
  return /* glsl */ `
uniform sampler2D turfDetailMap;
uniform sampler2D turfNormalMap;
uniform sampler2D turfMacroMap;
uniform vec3 turfFairwayLight;
uniform vec3 turfFairwayDark;
uniform vec3 turfFirstCut;
uniform vec3 turfRoughLight;
uniform vec3 turfRoughDark;
uniform vec3 turfMeadow;
uniform vec3 turfStraw;
uniform vec3 turfDry;
varying vec3 vTerrainPos;
varying float vTerrainSlope;

// Signed distance in yards to the edge of the fairway: a long box with
// rounded ends, negative inside.
float turfFairwayDistance( vec2 p ) {
	vec2 q = vec2( abs( p.x ), p.y - ${f(centre)} );
	float r = q.y > 0.0 ? ${f(TURF.fairwayFarRadius)} : ${f(TURF.fairwayNearRadius)};
	vec2 a = vec2( q.x, abs( q.y ) ) - vec2( ${f(FAIRWAY_HALF_WIDTH)}, ${f(halfLength)} ) + r;
	return length( max( a, 0.0 ) ) + min( max( a.x, a.y ), 0.0 ) - r;
}

// Alternating bands one unit wide: crisp up close, and averaged out to a flat
// 0.5 once a band is narrower than a pixel so they cannot alias.
float turfStripes( float coordinate ) {
	float width = fwidth( coordinate );
	float wave = abs( fract( coordinate * 0.5 ) * 2.0 - 1.0 );
	float edge = clamp( width * 0.75, 0.008, 0.5 );
	float stripe = smoothstep( 0.5 - edge, 0.5 + edge, wave );
	return mix( 0.5, stripe, 1.0 - smoothstep( 0.4, 1.2, width ) );
}
`;
}

// Replaces <map_fragment>: works out the turf colour from world position.
function turfFragmentColor() {
  return /* glsl */ `
vec2 turfP = vTerrainPos.xz;
vec3 turfA = texture2D( turfMacroMap, turfP / ${f(TURF.patch)} ).rgb - 0.5;
vec3 turfB = texture2D( turfMacroMap, turfP.yx / ${f(TURF.mottle)} + 0.37 ).rgb - 0.5;
vec3 turfC = texture2D( turfMacroMap, turfP / ${f(TURF.tuft)} + 0.71 ).rgb - 0.5;
vec3 turfDetailNear = texture2D( turfDetailMap, turfP / ${f(TURF.detailNear)} ).rgb;
vec3 turfDetailMid = texture2D( turfDetailMap, turfP.yx / ${f(TURF.detailMid)} + 0.19 ).rgb;

float turfWander = 0.5 * sin( turfP.y * 0.043 + turfP.x * 0.02 + 0.8 )
	+ 0.3 * sin( turfP.y * 0.097 - turfP.x * 0.031 + 2.1 )
	+ 0.2 * sin( turfP.x * 0.071 + 4.0 );
float turfEdge = turfFairwayDistance( turfP ) - ${f(TURF.edgeOutset)}
	- turfWander * ${f(TURF.edgeWobble)} - turfB.r * ${f(TURF.edgeNoise)};
float turfSoft = min( fwidth( turfEdge ), 40.0 );
float turfFairway = 1.0 - smoothstep( -0.1 - turfSoft, 0.1 + turfSoft, turfEdge );
float turfCutEdge = turfEdge - ${f(TURF.firstCutWidth)} + turfC.g * 1.2;
float turfCut = 1.0 - smoothstep( -0.25 - turfSoft, 0.25 + turfSoft, turfCutEdge );
float turfWildness = smoothstep( ${f(TURF.meadowStart)}, ${f(TURF.meadowStart + TURF.meadowBlend)},
	turfEdge + turfA.g * 50.0 + turfB.g * 20.0 );

float turfDryness = smoothstep( 0.10, 0.40, turfA.g + turfB.b * 0.4 );
float turfDamp = smoothstep( 0.10, 0.38, turfA.b + turfB.b * 0.2 );

float turfStripe = turfStripes( turfP.y / ${f(TURF.stripeWidth)} + turfB.g * 0.04 );
float turfCross = turfStripes( ( turfP.x + turfP.y ) * 0.70711 / ${f(TURF.crossWidth)} );
vec3 turfFair = mix( turfFairwayDark, turfFairwayLight, turfStripe );
turfFair *= 1.0 + ( turfCross - 0.5 ) * ${f(TURF.crossContrast)};
turfFair *= 1.0 + turfA.r * 0.24 + turfB.r * 0.12 + turfC.r * 0.06;
turfFair = mix( turfFair, turfDry, turfDryness * 0.16 );
turfFair *= 1.0 - turfDamp * 0.12;

vec3 turfCutColor = turfFirstCut * ( 1.0 + turfA.r * 0.2 + turfB.r * 0.2 + turfC.r * 0.22 );

vec3 turfRough = mix( turfRoughDark, turfRoughLight,
	clamp( 0.5 + turfA.r * 0.9 + turfB.r * 1.5 + turfC.g * 0.9, 0.0, 1.0 ) );
turfRough *= 1.0 + turfC.r * 0.38;
turfRough = mix( turfRough, turfDry, turfDryness * 0.22 + smoothstep( 0.18, 0.42, turfC.b ) * 0.2 );
turfRough *= 1.0 - turfDamp * 0.15;

float turfParched = clamp( vTerrainSlope * 7.0 + smoothstep( 6.0, 40.0, vTerrainPos.y ) * 0.45
	+ turfA.g * 1.3 + turfB.b * 0.8 + 0.1, 0.0, 1.0 );
vec3 turfWild = mix( turfMeadow, turfStraw, turfParched ) * ( 1.0 + turfB.r * 0.35 + turfC.r * 0.4 );

vec3 turfColor = mix( turfRough, turfWild, turfWildness );
turfColor = mix( turfColor, turfCutColor, turfCut );
turfColor = mix( turfColor, turfFair, turfFairway );
float turfRelief = mix( mix( ${f(TURF.roughRelief)}, ${f(TURF.firstCutRelief)}, turfCut ), ${f(TURF.fairwayRelief)}, turfFairway );
turfColor *= mix( vec3( 1.0 ), turfDetailNear * turfDetailMid * 4.0, turfRelief );
diffuseColor.rgb = max( turfColor, 0.0 );
`;
}

// Replaces <normal_fragment_maps>: tilts the normal by the blade relief. The
// ground is near enough level that world x/z serve as tangent and bitangent.
function turfFragmentNormal() {
  return /* glsl */ `
vec2 turfBumpNear = texture2D( turfNormalMap, turfP / ${f(TURF.detailNear)} ).xy * 2.0 - 1.0;
vec2 turfBumpMid = texture2D( turfNormalMap, turfP.yx / ${f(TURF.detailMid)} + 0.19 ).xy * 2.0 - 1.0;
vec3 turfNormal = inverseTransformDirection( normal, viewMatrix );
turfNormal.xz += ( turfBumpNear + turfBumpMid.yx * ${f(TURF.bumpMid)} ) * turfRelief * ${f(TURF.bump)};
normal = normalize( ( viewMatrix * vec4( normalize( turfNormal ), 0.0 ) ).xyz );
`;
}

function buildGround(textures) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: TURF.roughness,
    metalness: 0,
  });
  const uniforms = {
    turfDetailMap: { value: textures.detail },
    turfNormalMap: { value: textures.normal },
    turfMacroMap: { value: textures.macro },
    turfFairwayLight: { value: new THREE.Color(TURF_COLORS.fairwayLight) },
    turfFairwayDark: { value: new THREE.Color(TURF_COLORS.fairwayDark) },
    turfFirstCut: { value: new THREE.Color(TURF_COLORS.firstCut) },
    turfRoughLight: { value: new THREE.Color(TURF_COLORS.roughLight) },
    turfRoughDark: { value: new THREE.Color(TURF_COLORS.roughDark) },
    turfMeadow: { value: new THREE.Color(TURF_COLORS.meadow) },
    turfStraw: { value: new THREE.Color(TURF_COLORS.straw) },
    turfDry: { value: new THREE.Color(TURF_COLORS.dry) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${TURF_VERTEX_PARS}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${TURF_VERTEX}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${turfFragmentPars()}`)
      .replace("#include <map_fragment>", turfFragmentColor())
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness * mix( 1.0, ${f(TURF.fairwayRoughness)}, turfFairway );`,
      )
      .replace("#include <normal_fragment_maps>", turfFragmentNormal());
  };
  material.customProgramCacheKey = () => "range-turf";

  const ground = new THREE.Mesh(buildGroundGeometry(), material);
  ground.name = "ground";
  ground.receiveShadow = true;
  return ground;
}

// ---------------------------------------------------------------------------
// Mountains
// ---------------------------------------------------------------------------

// Height of a layer's mountains above the land at (x, z), before the layer's
// own scale: a ridge profile across the ring, taller downrange, broken into
// peaks and passes, carved by ridged noise.
function mountainRelief(layer, x, z) {
  const dz = z - CENTRE_Z;
  const r = Math.hypot(x, dz);
  const t = (r - layer.inner) / (layer.outer - layer.inner);
  if (t <= 0 || t >= 1) return 0;
  const { crest, behindScale, massif } = MOUNTAINS;
  let profile;
  if (t < crest) {
    profile = Math.pow(Math.sin(((t / crest) * Math.PI) / 2), 1.3);
  } else {
    const back = (1 - t) / (1 - crest);
    profile = back * back * (3 - 2 * back);
  }
  const facing = 0.5 + (0.5 * dz) / r;
  const directional = behindScale + (1 - behindScale) * Math.pow(facing, 0.7);
  const s = layer.seed;
  const bulk = Math.min(
    1,
    Math.max(0.45, 0.45 + (fbm(x / massif + s, z / massif - s, 2) - 0.3) * 1.4),
  );

  const size = layer.feature;
  const wx = x + (valueNoise(x / size / 2 + 2 * s, z / size / 2) - 0.5) * size * 0.5;
  const wz = z + (valueNoise(x / size / 2, z / size / 2 + 3 * s) - 0.5) * size * 0.5;
  let frequency = 1 / size;
  let amplitude = 0.5;
  let weight = 1;
  let sum = 0;
  let total = 0;
  for (let o = 0; o < 4; o++) {
    let n = 1 - Math.abs(2 * valueNoise(wx * frequency + s, wz * frequency + 2 * s) - 1);
    n *= n;
    sum += n * amplitude * weight;
    total += amplitude;
    weight = Math.min(1, n * 1.8);
    frequency *= 2.07;
    amplitude *= 0.5;
  }
  return profile * directional * bulk * (0.35 + (0.65 * sum) / total);
}

function buildMountainGeometry(layer) {
  const { columns, rows, downrangeDensity, sink, shadow, mistDepth } =
    MOUNTAINS;
  const across = columns + 1;
  const count = across * (rows + 1);
  const xs = new Float32Array(count);
  const zs = new Float32Array(count);
  const relief = new Float32Array(count);

  let tallest = 0;
  for (let j = 0; j <= rows; j++) {
    const r = layer.inner + ((layer.outer - layer.inner) * j) / rows;
    for (let k = 0; k <= columns; k++) {
      const v = (k % columns) / columns - 0.5;
      const azimuth =
        2 * Math.PI * v - downrangeDensity * Math.sin(2 * Math.PI * v);
      const i = j * across + k;
      xs[i] = Math.sin(azimuth) * r;
      zs[i] = CENTRE_Z + Math.cos(azimuth) * r;
      relief[i] = mountainRelief(layer, xs[i], zs[i]);
      tallest = Math.max(tallest, relief[i]);
    }
  }
  const scale = layer.height / tallest;
  const surface = (x, z) =>
    terrainHeight(x, z) + mountainRelief(layer, x, z) * scale - sink;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = xs[i];
    positions[i * 3 + 1] = terrainHeight(xs[i], zs[i]) + relief[i] * scale - sink;
    positions[i * 3 + 2] = zs[i];
  }

  // x: sunlight (with shadows cast by ridges toward the sun), y: sky light,
  // z: how level the slope is, w: yards above the surrounding land.
  const shade = new Float32Array(count * 4);
  // x: haze toward the horizon colour, y: how deep in the valley mist.
  const haze = new Float32Array(count * 2);
  const sun = SUN_DIRECTION;
  const sunFlat = Math.hypot(sun.x, sun.z);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const at = (j, k, target) =>
    target.fromArray(positions, (j * across + k) * 3);
  for (let j = 0; j <= rows; j++) {
    for (let k = 0; k <= columns; k++) {
      const i = j * across + k;
      const k0 = k === 0 ? columns - 1 : k - 1;
      const k1 = k === columns ? 1 : k + 1;
      at(j, k1, a).sub(at(j, k0, b));
      at(Math.min(rows, j + 1), k, normal).sub(at(Math.max(0, j - 1), k, b));
      normal.cross(a).normalize();
      if (normal.y < 0) normal.negate();

      const x = xs[i];
      const y = positions[i * 3 + 1];
      const z = zs[i];
      let occlusion = 0;
      for (const d of [20, 50, 100, 170]) {
        const above =
          surface(x + (sun.x / sunFlat) * d, z + (sun.z / sunFlat) * d) -
          (y + (sun.y / sunFlat) * d);
        occlusion = Math.max(occlusion, Math.min(1, above / (d * 0.12 + 2)));
      }
      const altitude = relief[i] * scale;
      shade[i * 4] = Math.max(0, normal.dot(sun)) * (1 - shadow * occlusion);
      shade[i * 4 + 1] = 0.5 + 0.5 * normal.y;
      shade[i * 4 + 2] = normal.y;
      shade[i * 4 + 3] = altitude;
      haze[i * 2] = layer.haze * (1 - (0.2 * altitude) / layer.height);
      const lift = Math.min(1, altitude / (layer.height * mistDepth));
      haze[i * 2 + 1] = 1 - lift * lift * (3 - 2 * lift);
    }
  }

  const indices = new Uint32Array(columns * rows * 6);
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let k = 0; k < columns; k++) {
      const p = j * across + k;
      const q = p + across;
      indices[n++] = p;
      indices[n++] = q;
      indices[n++] = p + 1;
      indices[n++] = p + 1;
      indices[n++] = q;
      indices[n++] = q + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aShade", new THREE.BufferAttribute(shade, 4));
  geometry.setAttribute("aHaze", new THREE.BufferAttribute(haze, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

const MOUNTAIN_VERTEX = /* glsl */ `
attribute vec4 aShade;
attribute vec2 aHaze;
varying vec4 vShade;
varying vec2 vHaze;
varying vec3 vWorld;
varying float vDepth;

void main() {
	vShade = aShade;
	vHaze = aHaze;
	vec4 world = modelMatrix * vec4( position, 1.0 );
	vWorld = world.xyz;
	vec4 view = viewMatrix * world;
	vDepth = - view.z;
	gl_Position = projectionMatrix * view;
}
`;

function mountainFragment() {
  const { treeline, snowline, sun, ambient, blue, mist } = MOUNTAINS;
  return /* glsl */ `
uniform sampler2D noiseMap;
uniform vec3 hazeColor;
uniform float fogNear;
uniform float fogFar;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 blueTint;
uniform vec3 forestDark;
uniform vec3 forestLight;
uniform vec3 alpine;
uniform vec3 rock;
uniform vec3 rockDark;
uniform vec3 snow;
varying vec4 vShade;
varying vec2 vHaze;
varying vec3 vWorld;
varying float vDepth;

#include <common>

void main() {
	// Sheared by height so steep faces do not smear the noise into streaks.
	vec2 p = vWorld.xz + vWorld.y * vec2( 0.7, 0.5 );
	vec3 broad = texture2D( noiseMap, p / 173.0 ).rgb - 0.5;
	vec3 fine = texture2D( noiseMap, p / 31.0 + 0.4 ).rgb - 0.5;

	float altitude = vShade.w + broad.r * 70.0 + fine.r * 22.0;
	float level = vShade.z + fine.g * 0.25;

	vec3 albedo = mix( forestDark, forestLight, clamp( 0.5 + broad.g * 1.6 + fine.b * 1.2, 0.0, 1.0 ) );
	albedo = mix( albedo, alpine, smoothstep( ${f(treeline - 28)}, ${f(treeline - 4)}, altitude ) );
	vec3 stone = mix( rockDark, rock, clamp( 0.5 + fine.g * 1.8 + broad.b, 0.0, 1.0 ) );
	float bare = max( smoothstep( ${f(treeline - 5)}, ${f(treeline + 10)}, altitude ),
		( 1.0 - smoothstep( 0.42, 0.6, level ) ) * smoothstep( ${f(treeline * 0.4)}, ${f(treeline * 0.8)}, altitude ) );
	albedo = mix( albedo, stone, bare );
	float snowCover = smoothstep( ${f(snowline - 8)}, ${f(snowline + 10)}, altitude + ( level - 0.7 ) * 60.0 )
		* smoothstep( 0.3, 0.5, level );
	albedo = mix( albedo, snow, snowCover );

	float sunlight = vShade.x * ( 1.0 + fine.g * 0.6 * ( 1.0 - snowCover ) );
	vec3 lit = albedo * ( skyColor * vShade.y * ${f(ambient)} + sunColor * sunlight * ${f(sun)} );
	lit = mix( lit, blueTint, vHaze.x * ${f(blue)} );

	gl_FragColor = vec4( lit, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	// Like the built-in fog, haze goes on after tone mapping so it lands on
	// exactly the horizon colour. At its foot each range takes the scene fog
	// the ground beside it has (plus a little mist); higher up, its own haze.
	float sceneFog = smoothstep( fogNear, fogFar, vDepth );
	float haze = mix( vHaze.x, max( vHaze.x, min( 1.0, sceneFog + ${f(mist)} ) ), vHaze.y );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, haze );
}
`;
}

function buildMountains(macro) {
  const uniforms = {
    noiseMap: { value: macro },
    hazeColor: { value: new THREE.Color(HORIZON_COLOR).convertLinearToSRGB() },
    fogNear: { value: MOUNTAINS.fogNear },
    fogFar: { value: MOUNTAINS.fogFar },
    sunColor: { value: new THREE.Color(SUN_COLOR) },
    skyColor: { value: new THREE.Color(MOUNTAIN_COLORS.sky) },
    blueTint: { value: new THREE.Color(MOUNTAIN_COLORS.blueTint) },
    forestDark: { value: new THREE.Color(MOUNTAIN_COLORS.forestDark) },
    forestLight: { value: new THREE.Color(MOUNTAIN_COLORS.forestLight) },
    alpine: { value: new THREE.Color(MOUNTAIN_COLORS.alpine) },
    rock: { value: new THREE.Color(MOUNTAIN_COLORS.rock) },
    rockDark: { value: new THREE.Color(MOUNTAIN_COLORS.rockDark) },
    snow: { value: new THREE.Color(MOUNTAIN_COLORS.snow) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MOUNTAIN_VERTEX,
    fragmentShader: mountainFragment(),
    side: THREE.DoubleSide,
    fog: false,
  });

  // The mountains do their own haze, but it has to agree with the fog on the
  // ground at their feet, so follow whatever linear fog the scene has. The
  // colour is taken the way three hands fogColor to its own shaders.
  const syncFog = (renderer, scene) => {
    const fog = scene.fog;
    if (!fog || !fog.isFog) return;
    uniforms.fogNear.value = fog.near;
    uniforms.fogFar.value = fog.far;
    fog.color.getRGB(
      uniforms.hazeColor.value,
      renderer.getRenderTarget() === null
        ? renderer.outputColorSpace
        : THREE.LinearSRGBColorSpace,
    );
  };

  const group = new THREE.Group();
  group.name = "mountains";
  MOUNTAIN_LAYERS.forEach((layer, i) => {
    const mesh = new THREE.Mesh(buildMountainGeometry(layer), material);
    mesh.name = `mountains-${i}`;
    mesh.onBeforeRender = syncFog;
    group.add(mesh);
  });
  return group;
}

// ---------------------------------------------------------------------------

export function buildTerrain({ random, anisotropy }) {
  const macro = macroTexture(random, anisotropy);
  const { detail, normal } = grassTextures(random, anisotropy);

  const object = new THREE.Group();
  object.name = "terrain";
  object.add(buildGround({ macro, detail, normal }));
  object.add(buildMountains(macro));

  return { object, update() {} };
}
