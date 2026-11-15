import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { buildRange, FOG } from "./range";
import {
  CameraDirector,
  ADDRESS,
  SWING,
  FLIGHT,
  LANDED,
} from "./camera-director";
import { Shot } from "./shot";
import { analyzeShot } from "./shot-analysis";
import { toYards } from "./conversions-lib";

// Scene units are yards; the physics runs in meters.
const YARDS_PER_METER = toYards(1);
const SHOT_DT = 0.001;
const BALL_RADIUS = 0.0234;
const TEE_HEIGHT = 0.05;
const MAT_TOP = 0.06;
// The ball is drawn at least this big (as a fraction of its distance from the
// camera) so it stays visible 300 yards out.
const BALL_MIN_ANGULAR_RADIUS = 0.0052;
const TRACER_STRIDE = 20; // physics steps per tracer vertex
const LANDED_HOLD_SECONDS = 4.5;
const PROGRESS_INTERVAL_SECONDS = 0.08;
const MAX_FRAME_SECONDS = 0.1;

function labelTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(8, 20, 14, 0.82)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 54px Helvetica, Arial, sans-serif";
  ctx.fillText(text, 128, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSimulator(container, callbacks = {}) {
  const { onState, onProgress, onResult } = callbacks;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  scene.add(
    buildRange({ anisotropy: renderer.capabilities.getMaxAnisotropy() }),
  );

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 4000);

  // --- ball, tee, shadow, tracer, landing marker ---
  const restPosition = new THREE.Vector3(
    0,
    MAT_TOP + TEE_HEIGHT + BALL_RADIUS,
    0,
  );

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
  );
  ball.name = "ball";
  ball.castShadow = true;
  scene.add(ball);

  const tee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.004, TEE_HEIGHT, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2e6c9 }),
  );
  tee.position.set(0, MAT_TOP + TEE_HEIGHT / 2, 0);
  scene.add(tee);

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.visible = false;
  scene.add(ballShadow);

  const tracerMaterial = new LineMaterial({
    color: 0xff4d2e,
    linewidth: 4,
    transparent: true,
    opacity: 0.95,
  });
  const tracer = new Line2(new LineGeometry(), tracerMaterial);
  tracer.name = "tracer";
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);

  const landingMarker = new THREE.Group();
  landingMarker.name = "landing-marker";
  landingMarker.visible = false;
  const landingRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  landingRing.rotation.x = -Math.PI / 2;
  landingRing.position.y = 0.05;
  const landingLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({ depthTest: false, fog: false }),
  );
  landingLabel.position.y = 2.6;
  landingLabel.scale.set(4, 1.5, 1);
  landingMarker.add(landingRing, landingLabel);
  scene.add(landingMarker);

  // --- shot state ---
  let side = callbacks.side || "Right";
  let state = ADDRESS;
  let shot = null;
  let analysis = null;
  let flightSeconds = 0;
  let landedSeconds = 0;
  let progressSeconds = 0;
  const ballVelocity = new THREE.Vector3(0, 0, 1);
  const landing = new THREE.Vector3();
  const director = new CameraDirector(side);

  function setState(next) {
    if (state === next) return;
    state = next;
    if (onState) onState(state);
  }

  function ballToRest() {
    ball.position.copy(restPosition);
    ball.scale.setScalar(1);
    ballShadow.visible = false;
  }

  function toAddress() {
    ballToRest();
    setState(ADDRESS);
  }

  function hit(launch, hitSide = side) {
    side = hitSide;
    // A new shot always starts from the address view, even mid-flight.
    director.reset(side);
    ballToRest();
    landingMarker.visible = false;

    shot = new Shot({ dt: SHOT_DT, ...launch });
    analysis = analyzeShot(shot, side);

    const positions = [];
    for (let i = 0; i < shot.points.length; i += TRACER_STRIDE) {
      const p = shot.points[i].position;
      positions.push(
        p.x * YARDS_PER_METER,
        p.y * YARDS_PER_METER + restPosition.y,
        p.z * YARDS_PER_METER,
      );
    }
    const last = shot.points[shot.points.length - 1].position;
    positions.push(
      last.x * YARDS_PER_METER,
      BALL_RADIUS,
      last.z * YARDS_PER_METER,
    );
    tracer.geometry.dispose();
    tracer.geometry = new LineGeometry();
    tracer.geometry.setPositions(positions);
    tracer.geometry.instanceCount = 0;
    tracer.visible = true;

    flightSeconds = 0;
    progressSeconds = 0;
    setState(SWING);
  }

  function setSide(nextSide) {
    side = nextSide;
    if (state === ADDRESS) director.reset(side);
  }

  function updateFlight(dt) {
    flightSeconds += dt;
    const lastIndex = shot.points.length - 1;
    const index = Math.min(Math.floor(flightSeconds / SHOT_DT), lastIndex);
    const point = shot.points[index];

    ball.position
      .copy(point.position)
      .multiplyScalar(YARDS_PER_METER)
      .add(restPosition);
    ballVelocity.copy(point.velocity).multiplyScalar(YARDS_PER_METER);
    tracer.geometry.instanceCount = Math.floor(index / TRACER_STRIDE);

    progressSeconds += dt;
    if (onProgress && progressSeconds >= PROGRESS_INTERVAL_SECONDS) {
      progressSeconds = 0;
      onProgress({
        carryYards: ball.position.z,
        heightYards: ball.position.y,
        offlineYards: -ball.position.x,
      });
    }

    if (index === lastIndex) {
      ball.position.y = BALL_RADIUS;
      landing.copy(ball.position).setY(0);
      tracer.geometry.instanceCount = Infinity;

      landingMarker.position.copy(landing);
      const material = landingLabel.material;
      if (material.map) material.map.dispose();
      material.map = labelTexture(`${Math.round(analysis.carryYards)} yd`);
      material.needsUpdate = true;
      landingMarker.visible = true;

      landedSeconds = 0;
      setState(LANDED);
      if (onResult) onResult(analysis);
    }
  }

  function update(dt) {
    if (state === SWING) {
      // Phase 2 puts the golfer's swing here; until then the ball leaves at once.
      setState(FLIGHT);
    } else if (state === FLIGHT) {
      updateFlight(dt);
    } else if (state === LANDED) {
      landedSeconds += dt;
      if (landedSeconds >= LANDED_HOLD_SECONDS) toAddress();
    }

    director.update(dt, {
      state,
      side,
      ball: ball.position,
      velocity: ballVelocity,
      landing,
    });
    camera.position.copy(director.position);
    camera.lookAt(director.target);

    // Keep the ball readable at range, and give it a ground shadow in the air.
    const distance = camera.position.distanceTo(ball.position);
    ball.scale.setScalar(
      Math.max(1, (distance * BALL_MIN_ANGULAR_RADIUS) / BALL_RADIUS),
    );
    const airborne = state === FLIGHT || state === LANDED;
    ballShadow.visible = airborne;
    if (airborne) {
      const height = Math.max(0, ball.position.y);
      ballShadow.position.set(ball.position.x, 0.04, ball.position.z);
      ballShadow.scale.setScalar(
        BALL_RADIUS * ball.scale.x * (1 + height * 0.02),
      );
      ballShadow.material.opacity = 0.4 / (1 + height * 0.05);
    }
  }

  // --- render loop ---
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // On tall, narrow screens widen the lens so the range still reads.
    camera.fov = camera.aspect < 1 ? 62 : 48;
    camera.updateProjectionMatrix();
    tracerMaterial.resolution.set(width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frameId = null;
  function frame() {
    frameId = requestAnimationFrame(frame);
    update(Math.min(clock.getDelta(), MAX_FRAME_SECONDS));
    renderer.render(scene, camera);
  }
  ballToRest();
  frame();

  function dispose() {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = [].concat(object.material || []);
      for (const material of materials) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    });
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  const api = {
    hit,
    setSide,
    dispose,
    // Step the simulation by hand; used to verify behaviour without waiting
    // on real time.
    advance(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) update(step);
      renderer.render(scene, camera);
    },
    inspect() {
      return {
        state,
        side,
        ball: ball.position.toArray(),
        camera: camera.position.toArray(),
        cameraTarget: director.target.toArray(),
        flightSeconds,
        analysis,
      };
    },
    scene,
    camera,
  };
  if (process.env.NODE_ENV !== "production") window.__golfSim = api;
  return api;
}
