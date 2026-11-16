import * as THREE from "three";
import { HORIZON_COLOR, SUN_COLOR, SUN_DIRECTION } from "./shared";

// Linear fog for aerial perspective: the tree lines 95-200 yd out pick up a
// first breath of haze, the far end of the range is about a quarter of the way
// to the horizon colour, and the ground is fully that colour before it meets
// the sky.
export const FOG = { color: HORIZON_COLOR, near: 70, far: 1250 };

const DOME_RADIUS = 1800;
const NOISE_SIZE = 256;

// --- tiling noise texture ---------------------------------------------------
// The clouds read all their noise from one small repeating texture rather than
// hashing octaves per pixel. R: billowy fbm (cumulus shape). G: fine cellular
// billows (edge erosion and surface detail). B: plain fbm (cirrus).

function tilingPerlin(random, period) {
  const gradients = new Float32Array(period * period * 2);
  for (let i = 0; i < period * period; i++) {
    const angle = random() * Math.PI * 2;
    gradients[i * 2] = Math.cos(angle);
    gradients[i * 2 + 1] = Math.sin(angle);
  }
  const corner = (ix, iy, dx, dy) => {
    const i = ((iy % period) * period + (ix % period)) * 2;
    return gradients[i] * dx + gradients[i + 1] * dy;
  };
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = corner(ix, iy, fx, fy);
    const b = corner(ix + 1, iy, fx - 1, fy);
    const c = corner(ix, iy + 1, fx, fy - 1);
    const d = corner(ix + 1, iy + 1, fx - 1, fy - 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// 1 at each cell's feature point, falling to 0 a cell away: round puffs.
function tilingBillows(random, cells) {
  const points = new Float32Array(cells * cells * 2);
  for (let i = 0; i < points.length; i++) points[i] = random();
  return (x, y) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let nearest = 4;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const i =
          ((((gy % cells) + cells) % cells) * cells +
            (((gx % cells) + cells) % cells)) *
          2;
        const dx = gx + points[i] - x;
        const dy = gy + points[i + 1] - y;
        nearest = Math.min(nearest, dx * dx + dy * dy);
      }
    }
    return 1 - Math.min(1, Math.sqrt(nearest));
  };
}

function octaves(makeLayer, random, basePeriod, count, gain) {
  const field = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  let amplitude = 1;
  for (let o = 0; o < count; o++) {
    const period = basePeriod << o;
    const layer = makeLayer(random, period);
    const scale = period / NOISE_SIZE;
    for (let j = 0; j < NOISE_SIZE; j++) {
      for (let i = 0; i < NOISE_SIZE; i++) {
        field[j * NOISE_SIZE + i] += layer(i * scale, j * scale) * amplitude;
      }
    }
    amplitude *= gain;
  }
  return field;
}

function normalizeField(field) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of field) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  for (let i = 0; i < field.length; i++) {
    field[i] = (field[i] - min) / (max - min);
  }
  return field;
}

function buildNoiseTexture(random) {
  const smooth = normalizeField(octaves(tilingPerlin, random, 4, 5, 0.55));
  const puffs = normalizeField(octaves(tilingBillows, random, 5, 3, 0.5));
  const detail = normalizeField(octaves(tilingBillows, random, 6, 3, 0.45));
  const wisps = normalizeField(octaves(tilingPerlin, random, 4, 5, 0.5));
  const shape = new Float32Array(smooth.length);
  for (let i = 0; i < shape.length; i++) {
    shape[i] = smooth[i] * 0.68 + puffs[i] * 0.32;
  }
  normalizeField(shape);

  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let i = 0; i < shape.length; i++) {
    data[i * 4] = Math.round(shape[i] * 255);
    data[i * 4 + 1] = Math.round(detail[i] * 255);
    data[i * 4 + 2] = Math.round(wisps[i] * 255);
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// --- sky dome ---------------------------------------------------------------

const vertexShader = /* glsl */ `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Colours are scene-linear and chosen for how they land after ACES at the
// renderer's exposure, which desaturates and compresses anything bright.
const fragmentShader = /* glsl */ `
  uniform sampler2D uNoise;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uZenith;
  uniform vec3 uMidSky;
  uniform vec3 uHaze;
  uniform vec3 uWarmTint;
  uniform vec3 uHorizonDisplay;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform vec3 uCirrusColor;
  uniform float uTime;
  uniform float uWarmth;
  uniform float uMieStrength;
  uniform float uMieG;
  uniform float uSunSize;
  uniform float uSunIntensity;
  uniform float uSunBloom;
  uniform float uGlowBrightness;
  uniform float uThreshold;
  uniform float uGain;
  uniform float uErosion;
  uniform float uEdgeSoftness;
  uniform float uHazeFalloff;
  uniform float uRelief;
  uniform float uReliefFloor;
  uniform float uSelfShadow;
  uniform float uBaseShadow;
  uniform float uThickShadow;
  uniform float uSilver;
  uniform float uCloudHaze;
  uniform float uCumulusOpacity;
  uniform float uCirrusCoverage;
  uniform float uCirrusOpacity;
  uniform float uCurve;
  uniform float uCloudScale;
  uniform float uTopLight;
  uniform float uParallax;
  uniform float uWind;
  uniform float uHorizonBand;
  uniform float uGroundDarken;

  varying vec3 vPosition;

  // Cloud-deck units per second; one unit is the height of the deck.
  const vec2 WIND = vec2(0.009, 0.0035);
  const mat2 SHAPE_TURN = mat2(0.8, -0.6, 0.6, 0.8);
  const mat2 BILLOW_TURN = mat2(0.6, 0.8, -0.8, 0.6);
  const mat2 CIRRUS_TURN = mat2(0.891, 0.454, -0.454, 0.891);

  // Two taps of the billowy fbm at unrelated scales and headings: the large
  // one lays out banks and gaps, the small one the individual clouds. They
  // drift at different rates so the clouds slowly change shape as they move.
  float cumulusShape(vec2 p) {
    vec2 drift = uTime * uWind * WIND;
    float banks = texture2D(uNoise, (p + drift) * 0.085).r;
    float clouds = texture2D(uNoise, SHAPE_TURN * (p + drift * 1.15) * 0.27).r;
    return (banks * 0.54 + clouds * 0.46 - uThreshold) * uGain;
  }

  // The cloud as a height field: the broad shape with rounded lumps bitten
  // out of it at two sizes. The cores keep most of their mass, so the bites
  // carve the edges into cauliflower and only dimple the middle.
  float cumulusHeight(vec2 p) {
    vec2 drift = uTime * uWind * WIND;
    float body = cumulusShape(p);
    float lumps = texture2D(uNoise, BILLOW_TURN * (p + drift * 1.2) * 1.1).g;
    float crumbs = texture2D(uNoise, (p + drift * 1.24) * 3.7).g;
    float bite = (1.0 - lumps) * 0.62 + (1.0 - crumbs) * 0.38;
    return body - bite * uErosion * (1.0 - 0.5 * clamp(body, 0.0, 1.0));
  }

  // Cheaper stand-in for the broad lighting probes.
  float cumulusBody(vec2 p) {
    return clamp(cumulusShape(p) - 0.5 * uErosion, 0.0, 1.0);
  }

  void main() {
    vec3 dir = normalize(vPosition);
    float y = dir.y;
    float up = max(y, 0.0);
    float mu = dot(dir, uSunDirection);
    float sunDistance = length(dir - uSunDirection);
    vec2 heading = dir.xz / max(length(dir.xz), 1e-4);
    vec2 sunHeading = normalize(uSunDirection.xz);
    float towardSun = dot(heading, sunHeading) * 0.5 + 0.5;

    // Atmosphere: blue deepening to the zenith, a pale haze layer that
    // thickens to the horizon, warmed on the sun's side of the sky.
    float haze = 0.55 * exp(-up * uHazeFalloff) + 0.45 * exp(-up * uHazeFalloff * 4.0);
    vec3 sky = mix(uMidSky, uZenith, pow(up, 0.6));
    sky *= 0.88 + 0.2 * (mu * 0.5 + 0.5);
    float warm = towardSun * towardSun * towardSun * smoothstep(0.0, 0.07, up) * uWarmth;
    vec3 hazeColor = uHaze * mix(vec3(1.0), uWarmTint, warm);
    sky = mix(sky, hazeColor, haze);

    // Forward scattering around the sun, strongest low down where the air is
    // thickest: it pales the blue across a wide arc and turns golden close in.
    float g = uMieG;
    float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
    float aureole = phase * uMieStrength * (0.4 + 0.6 * haze);
    sky = mix(sky, hazeColor, 1.0 - exp(-aureole));
    float bloom = uSunBloom * (exp(-sunDistance * 24.0) + 0.3 * exp(-sunDistance * 6.0));
    sky = mix(sky, uSunColor * uGlowBrightness, 1.0 - exp(-bloom));

    float sunVisible = 1.0;

    if (y > 0.0) {
      // --- cirrus: streaks of fbm combed along the upper wind ---
      vec2 cq = CIRRUS_TURN * (dir.xz / (y + 0.3) + cameraPosition.xz * uParallax * 0.25);
      float tc = uTime * uWind;
      float patches = texture2D(uNoise, cq * 0.043 + tc * vec2(0.0002, 0.00006)).r;
      vec2 cuv = cq * vec2(0.032, 0.15) + patches * vec2(0.3, 0.16) + tc * vec2(0.0003, 0.0);
      float streaks = texture2D(uNoise, cuv).b;
      float fibres = texture2D(uNoise, cuv * vec2(2.3, 3.1) + 0.41).b;
      // Only where the broad field is high is there any cirrus at all, and
      // within those patches the combed noise breaks it into fibres.
      float sheet = smoothstep(1.0 - uCirrusCoverage, 1.3 - uCirrusCoverage, patches);
      float cirrus = sheet * smoothstep(0.38, 0.74, streaks * 0.55 + fibres * 0.45);
      cirrus *= uCirrusOpacity * smoothstep(0.03, 0.32, y);
      vec3 cirrusColor = uCirrusColor + uSunColor * (0.3 * pow(max(mu, 0.0), 6.0));
      sky = mix(sky, mix(cirrusColor, hazeColor, haze * 0.7), cirrus);

      // --- cumulus ---
      // Dividing by height projects the view ray onto a flat cloud deck, so
      // clouds shrink and bunch toward the horizon; uCurve bends the deck
      // down like the real one so they never squash to infinity.
      vec2 q = (dir.xz / (y + uCurve) + cameraPosition.xz * uParallax) * uCloudScale;

      // A deck seen from the ground shows its underside, and lighting that
      // literally would put the bright edges at the bottom of every cloud.
      // Low in the sky, where clouds read as side views, light them as side
      // views instead: from the sun's side and from above (up the screen is
      // back toward the viewer on the deck). Overhead, use the true heading.
      // Right beside the sun the two cancel and the probes close up, which
      // leaves those clouds flatly backlit, as they should be.
      float along = dot(sunHeading, heading);
      vec2 sideways = sunHeading - heading * along;
      float overhead = smoothstep(0.35, 0.85, y);
      vec2 lightHeading = sideways + heading * mix(-uTopLight, along, overhead);
      lightHeading /= max(length(lightHeading), 0.3);
      float height = cumulusHeight(q);
      float thick = clamp(height, 0.0, 1.0);
      float alpha = smoothstep(0.0, uEdgeSoftness, height);

      // Relief: where the height field falls away toward the sun the surface
      // faces it and is lit; where it rises, this point is on the far side
      // of a lump.
      float towardSunHeight = cumulusHeight(q + lightHeading * 0.022);
      float relief = clamp(0.5 + (height - towardSunHeight) * uRelief, 0.0, 1.0);
      // Broad self-shadowing: how much cloud lies between here and the sun,
      // and (low in the sky, where clouds show their sides) how much hangs
      // above this point, which is what makes a flat grey base.
      float sunward = cumulusBody(q + lightHeading * 0.22);
      float above = cumulusBody(q - heading * 0.13);
      float shadow =
        uSelfShadow * sunward +
        uBaseShadow * above * (1.0 - y) +
        uThickShadow * thick;
      float light = mix(uReliefFloor, 1.0, relief) * exp(-shadow);
      vec3 cloud = mix(uCloudShade, uCloudLit, light);

      // Silver lining: thin edges light up when the sun is behind them.
      float thin = (1.0 - thick) * (1.0 - thick);
      cloud += uSunColor * thin * uSilver *
        (pow(max(mu, 0.0), 10.0) + 5.0 * exp(-sunDistance * 9.0));

      cloud = mix(cloud, hazeColor, exp(-y * uCloudHaze) * 0.9);
      alpha *= uCumulusOpacity * smoothstep(0.012, 0.15, y);
      sky = mix(sky, cloud, alpha);
      sunVisible = pow(1.0 - alpha, 4.0) * (1.0 - 0.6 * cirrus);
    }

    float disc = 1.0 - smoothstep(uSunSize * 0.8, uSunSize, sunDistance);
    sky += uSunColor * (disc * uSunIntensity * sunVisible);

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    // Scene fog is mixed in after tone mapping, so the fog colour reaches the
    // screen untouched. Meet it the same way: the last few degrees above the
    // horizon ease to exactly that colour in output space.
    float band = 1.0 - smoothstep(0.0, uHorizonBand, y);
    float ground = 1.0 - uGroundDarken * smoothstep(0.02, 0.45, -y);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHorizonDisplay, band) * ground;

    // Half a code value of noise so the smooth gradient cannot band.
    float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    gl_FragColor.rgb += (grain - 0.5) / 255.0;
  }`;

export function buildSky({ random }) {
  const horizon = new THREE.Color(HORIZON_COLOR);
  const uniforms = {
    uNoise: { value: buildNoiseTexture(random) },
    uSunDirection: { value: SUN_DIRECTION.clone().normalize() },
    uSunColor: { value: new THREE.Color(SUN_COLOR) },
    uZenith: { value: new THREE.Color(0.036, 0.125, 0.43) },
    uMidSky: { value: new THREE.Color(0.075, 0.26, 0.8) },
    uHaze: { value: new THREE.Color(0.549, 0.941, 1.419) },
    uWarmTint: { value: new THREE.Color(1.75, 1.0, 0.56) },
    uHorizonDisplay: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color(2.9, 2.3, 1.6) },
    uCloudShade: { value: new THREE.Color(0.23, 0.28, 0.41) },
    uCirrusColor: { value: new THREE.Color(1.2, 1.28, 1.4) },
    uTime: { value: 0 },
    uWarmth: { value: 0.75 },
    uMieStrength: { value: 0.028 },
    uMieG: { value: 0.72 },
    uSunSize: { value: 0.021 },
    uSunIntensity: { value: 40 },
    uSunBloom: { value: 1.3 },
    uGlowBrightness: { value: 2.2 },
    uThreshold: { value: 0.5 },
    uGain: { value: 8 },
    uErosion: { value: 1.3 },
    uEdgeSoftness: { value: 0.1 },
    uHazeFalloff: { value: 4.5 },
    uRelief: { value: 4 },
    uReliefFloor: { value: 0.3 },
    uSelfShadow: { value: 3 },
    uBaseShadow: { value: 5 },
    uThickShadow: { value: 1 },
    uSilver: { value: 0.9 },
    uCloudHaze: { value: 6.5 },
    uCumulusOpacity: { value: 0.97 },
    uCirrusCoverage: { value: 0.5 },
    uCirrusOpacity: { value: 0.5 },
    uCurve: { value: 0.2 },
    uCloudScale: { value: 1.7 },
    uTopLight: { value: 0.9 },
    uParallax: { value: 1 / 2500 },
    uWind: { value: 1 },
    uHorizonBand: { value: 0.06 },
    uGroundDarken: { value: 0.16 },
  };

  const material = new THREE.ShaderMaterial({
    name: "sky",
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms,
    vertexShader,
    fragmentShader,
  });

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_RADIUS, 48, 24),
    material,
  );
  dome.name = "sky-dome";
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  // The same rule three applies to the fog colour: output space on screen,
  // working space when rendering into a post-processing target.
  dome.onBeforeRender = (renderer) => {
    horizon.getRGB(
      uniforms.uHorizonDisplay.value,
      renderer.getRenderTarget() === null
        ? renderer.outputColorSpace
        : THREE.ColorManagement.workingColorSpace,
    );
  };

  const object = new THREE.Group();
  object.name = "sky";
  object.add(dome);

  return {
    object,
    update(elapsedSeconds, camera) {
      uniforms.uTime.value = elapsedSeconds;
      camera.getWorldPosition(dome.position);
    },
  };
}

// --- lights -----------------------------------------------------------------

const SHADOW_MAP_SIZE = 4096;
// Centre of the shadowed patch of ground: x ±30, z -12..25.
const SHADOW_TARGET = new THREE.Vector3(0, 0, 6.5);
const SHADOW_HALF_X = 30;
const SHADOW_HALF_Z = 18.5;
const SHADOW_HEIGHT = 10;
const SUN_DISTANCE = 80;

export function buildLights() {
  const object = new THREE.Group();
  object.name = "lights";

  const direction = SUN_DIRECTION.clone().normalize();

  const hemisphere = new THREE.HemisphereLight(0xbfd6f5, 0x6f7f4c, 1.35);
  hemisphere.name = "sky-fill";
  object.add(hemisphere);

  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.3);
  sun.name = "sun";
  sun.target.position.copy(SHADOW_TARGET);
  sun.position.copy(SHADOW_TARGET).addScaledVector(direction, SUN_DISTANCE);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);

  // Fit the shadow camera to the patch: project its corners, and the same
  // corners raised to the tallest caster, onto the light's own axes.
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
  const upward = direction.clone().cross(right);
  const bounds = { u: 0, vMin: 0, vMax: 0, dMin: Infinity, dMax: -Infinity };
  const corner = new THREE.Vector3();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const height of [0, SHADOW_HEIGHT]) {
        corner.set(sx * SHADOW_HALF_X, height, sz * SHADOW_HALF_Z);
        const depth = SUN_DISTANCE - corner.dot(direction);
        bounds.u = Math.max(bounds.u, Math.abs(corner.dot(right)));
        bounds.vMin = Math.min(bounds.vMin, corner.dot(upward));
        bounds.vMax = Math.max(bounds.vMax, corner.dot(upward));
        bounds.dMin = Math.min(bounds.dMin, depth);
        bounds.dMax = Math.max(bounds.dMax, depth);
      }
    }
  }
  const camera = sun.shadow.camera;
  camera.left = -bounds.u - 1;
  camera.right = bounds.u + 1;
  camera.bottom = bounds.vMin - 1;
  camera.top = bounds.vMax + 1;
  camera.near = bounds.dMin - 5;
  camera.far = bounds.dMax + 5;
  camera.updateProjectionMatrix();
  // A texel is about 1.5 cm here. bias is in units of the near-far range
  // (about 0.02 yd), normalBias in yards: together just enough to clear acne
  // on the turf at this sun angle without lifting shadows off the feet.
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.02;
  object.add(sun, sun.target);

  // The sun is ahead and to the right, so everything faces the camera with
  // its shaded side. A soft cool light from behind the camera keeps the golfer
  // and the near faces of the trees from going flat.
  const fill = new THREE.DirectionalLight(0xc3d6f2, 0.8);
  fill.name = "fill";
  fill.position.set(0.4, 0.25, -0.88).multiplyScalar(SUN_DISTANCE);
  object.add(fill, fill.target);

  return { object, update() {} };
}
