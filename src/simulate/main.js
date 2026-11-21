import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { buildRange, groundOverlay, FOG } from "./range";
import { FLEET_FAR } from "./scenery/fleet";
import { shotTrack } from "./shot-track";
import {
  CameraDirector,
  ADDRESS,
  SWING,
  FLIGHT,
  LANDED,
} from "./camera-director";
import { createGolfer, CONTACT_TIME, SWING_DURATION } from "./golfer";
import { loadGolferModel } from "./golfer-model";
import { startOrbit, dragOrbit, zoomOrbit, orbitPosition } from "./orbit-view";
import { Shot } from "./shot";
import { analyzeShot } from "./shot-analysis";
import { groundRun, turfParameters, TURF_PRESETS } from "./ground";
import { evaluateTarget } from "./game";
import { createCelebration } from "./celebration-effects";
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
const LANDED_HOLD_SECONDS = 3.5;
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

// Slanted light and dark bands for the air target: wrapped round a spinning
// sphere they climb it like a barber's pole, so it reads as a target and not
// as a ball hanging in the sky. The material's colour tints them.
function bandTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size / 2, size);
  ctx.lineTo(size, size / 2);
  ctx.lineTo(size, 0);
  ctx.closePath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, size / 2);
  ctx.lineTo(size / 2, 0);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 3);
  return texture;
}

// How far the golfer's far shoulder is from the target line, and how far the
// address camera is behind the ball, in yards.
const GOLFER_CLEARANCE = 1.35;
const ADDRESS_DISTANCE = 6;

export function createSimulator(container, callbacks = {}) {
  const { onState, onProgress, onResult, onOrbit, onReady, fleet } = callbacks;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
  const range = buildRange({
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    fleet,
  });
  scene.add(range);

  const camera = new THREE.PerspectiveCamera(
    48,
    1,
    0.5,
    fleet ? FLEET_FAR : 2600,
  );
  // The win confetti hangs off the camera, which draws only if it is in the scene.
  scene.add(camera);
  const celebration = createCelebration(camera);

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
  groundOverlay(ballShadow, 6);
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
  groundOverlay(landingRing, 6);
  landingRing.position.y = 0.05;
  const landingLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({ depthTest: false, fog: false }),
  );
  landingLabel.position.y = 2.6;
  landingLabel.scale.set(4, 1.5, 1);
  landingMarker.add(landingRing, landingLabel);
  scene.add(landingMarker);
  // Whether there is a shot line, and a landing marker, to show or put away.
  let traced = false;
  let landed = false;

  // --- game-mode target: a beam, and the circle at its foot ---
  const TARGET_COLOR = 0xffb020;
  const TARGET_HIT_COLOR = 0x8dff3a;
  const targetMaterial = new THREE.MeshBasicMaterial({
    color: TARGET_COLOR,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const targetEdgeMaterial = new THREE.MeshBasicMaterial({
    color: TARGET_COLOR,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const targetBeaconMaterial = new THREE.MeshBasicMaterial({
    color: TARGET_COLOR,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const targetGroup = new THREE.Group();
  targetGroup.name = "target";
  targetGroup.visible = false;
  const targetDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    targetMaterial,
  );
  targetDisc.rotation.x = -Math.PI / 2;
  groundOverlay(targetDisc, 4);
  targetDisc.position.y = 0.06;
  const targetEdge = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 64),
    targetEdgeMaterial,
  );
  targetEdge.rotation.x = -Math.PI / 2;
  groundOverlay(targetEdge, 5);
  targetEdge.position.y = 0.07;
  const targetBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 45, 24, 1, true),
    targetBeaconMaterial,
  );
  targetBeacon.position.y = 22.5;
  const targetLabel = new THREE.Sprite(
    new THREE.SpriteMaterial({ depthTest: false, fog: false }),
  );
  const groundTarget = new THREE.Group();
  groundTarget.add(targetDisc, targetEdge, targetBeacon);

  // An advanced target: a small sphere in the air, with a tether down to a
  // mark on the turf so its distance can be read.
  const airTarget = new THREE.Group();
  const airBallMaterial = new THREE.MeshBasicMaterial({
    color: TARGET_COLOR,
    map: bandTexture(),
    fog: false,
  });
  const airBall = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    airBallMaterial,
  );
  // Tipped over, so the bands are seen to turn from the tee.
  airBall.rotation.z = 0.35;
  const airTether = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true),
    targetBeaconMaterial,
  );
  const airMark = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    targetEdgeMaterial,
  );
  airMark.rotation.x = -Math.PI / 2;
  groundOverlay(airMark, 5);
  airMark.position.y = 0.07;
  airTarget.add(airBall, airTether, airMark);

  targetGroup.add(groundTarget, airTarget, targetLabel);
  scene.add(targetGroup);
  let target = null;

  function paintTarget(hit) {
    const color = hit ? TARGET_HIT_COLOR : TARGET_COLOR;
    targetMaterial.color.set(color);
    targetEdgeMaterial.color.set(color);
    airBallMaterial.color.set(color);
    targetBeaconMaterial.color.set(color);
    targetMaterial.opacity = hit ? 0.55 : 0.3;
  }

  // Pass null to clear it.
  function setTarget(next) {
    target = next;
    targetGroup.visible = Boolean(next);
    if (!next) return;
    targetGroup.position.set(next.x, 0, next.z);
    const air = Boolean(next.air);
    groundTarget.visible = !air;
    airTarget.visible = air;
    // Sized by distance so the label reads the same from the tee.
    const labelWidth = Math.max(next.z, 60) * 0.085;
    targetLabel.scale.set(labelWidth, labelWidth * 0.375, 1);
    if (air) {
      airBall.position.y = next.y;
      airBall.scale.setScalar(next.radius);
      airTether.scale.y = next.y - next.radius;
      airTether.position.y = (next.y - next.radius) / 2;
      airMark.scale.setScalar(next.radius * 1.5);
      targetLabel.position.y = next.y + next.radius + labelWidth * 0.25;
    } else {
      targetDisc.scale.setScalar(next.radius);
      targetEdge.scale.setScalar(next.radius);
      targetBeacon.scale.set(next.radius, 1, next.radius);
      targetLabel.position.y = 6 + next.z * 0.05;
    }
    const material = targetLabel.material;
    if (material.map) material.map.dispose();
    material.map = labelTexture(`${next.distanceYards} yd`);
    material.needsUpdate = true;
    paintTarget(false);
  }

  // --- shot state ---
  let side = callbacks.side || "Right";
  // The modelled golfer is on its way; the figure built in code is slow to
  // make, so it is only built if the model never arrives.
  const golfer = createGolfer({ figure: false });
  golfer.setSide(side);
  scene.add(golfer.group);
  let golferModel = "glb";
  loadGolferModel()
    .then((model) => golfer.setModel(model))
    .catch(() => {
      console.warn("Golfer model did not load; building the built-in figure.");
      golferModel = "figure_fallback";
      golfer.buildFigure();
    })
    .then(() => onReady && onReady({ model: golferModel }));
  let swingSeconds = 0;
  let aim = 0;
  let state = ADDRESS;
  let shot = null;
  let analysis = null;
  // Bounce and roll after touchdown, as timed points in scene units.
  let runPath = [];
  let runIndex = 0;
  let airSeconds = 0;
  let airSegments = 0;
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

  // The driver is hit off a tee; every other club off the mat.
  function setClub(club) {
    golfer.setClub(club);
    tee.visible = club.teed;
    restPosition.y = MAT_TOP + BALL_RADIUS + (club.teed ? TEE_HEIGHT : 0);
    if (state === ADDRESS) ballToRest();
  }

  function ballToRest() {
    ball.position.copy(restPosition);
    ball.scale.setScalar(1);
    ballShadow.visible = false;
  }

  function toAddress() {
    ballToRest();
    swingSeconds = 0;
    golfer.setTime(0);
    // Picks up a handedness or aim change made while the last shot was in
    // the air.
    golfer.setSide(side);
    golfer.setAim(aim);
    setState(ADDRESS);
  }

  // `turf` is a set of conditions for turfParameters; `aimDegrees` is where
  // the golfer is set up, right (+) or left (-) of the centre line.
  function hit(
    launch,
    hitSide = side,
    turf = TURF_PRESETS.normal,
    aimDegrees = 0,
  ) {
    side = hitSide;
    // A new shot always starts from the address view, even mid-flight, and
    // lets go of a view the player dragged round so the camera follows the ball.
    resetView();
    director.reset(side);
    golfer.setSide(side);
    swingSeconds = 0;
    ballToRest();
    landingMarker.visible = false;
    landed = false;

    shot = new Shot({ dt: SHOT_DT, ...launch });
    // Shape is judged against the line the golfer aimed down, so name it
    // before turning the shot onto that line.
    const { shape } = analyzeShot(shot, side);
    aim = aimDegrees;
    shot.aim(aim);
    golfer.setAim(aim);
    const touchdown = shot.points[shot.points.length - 1];
    const run = groundRun(touchdown, turfParameters(turf));
    analysis = { ...analyzeShot(shot, side, run), shape, aimDegrees };

    const positions = [];
    for (let i = 0; i < shot.points.length; i += TRACER_STRIDE) {
      const p = shot.points[i].position;
      positions.push(
        p.x * YARDS_PER_METER,
        p.y * YARDS_PER_METER + restPosition.y,
        p.z * YARDS_PER_METER,
      );
    }
    airSegments = positions.length / 3 - 1;
    airSeconds = (shot.points.length - 1) * SHOT_DT;

    runPath = run.points.map((point) => ({
      t: point.t,
      position: point.position
        .clone()
        .multiplyScalar(YARDS_PER_METER)
        .add(new THREE.Vector3(0, BALL_RADIUS, 0)),
    }));
    // The same shot from straight above, for the bird's-eye map.
    analysis.track = shotTrack(
      shot.points.map((point) => point.position),
      run.points.map((point) => point.position),
      YARDS_PER_METER,
      target,
    );
    runIndex = 0;
    for (const { position } of runPath) {
      positions.push(position.x, position.y, position.z);
    }
    if (target) {
      analysis.target = evaluateTarget(
        target,
        runPath.map((point) => point.position),
        shot.points.map(({ position: p }) => ({
          x: p.x * YARDS_PER_METER,
          y: p.y * YARDS_PER_METER + restPosition.y,
          z: p.z * YARDS_PER_METER,
        })),
      );
    }
    paintTarget(false);

    tracer.geometry.dispose();
    tracer.geometry = new LineGeometry();
    tracer.geometry.setPositions(positions);
    tracer.geometry.instanceCount = 0;
    tracer.visible = true;
    traced = true;

    flightSeconds = 0;
    progressSeconds = 0;
    setState(SWING);
  }

  // Show the stance for an aim before the shot is hit.
  function setAim(aimDegrees) {
    aim = aimDegrees;
    if (state === ADDRESS) golfer.setAim(aim);
  }

  function setSide(nextSide) {
    side = nextSide;
    if (state === ADDRESS) {
      director.reset(side);
      golfer.setSide(side);
    }
    resize();
  }

  // In the air: follow the precomputed trajectory point for this moment.
  function followAir() {
    const index = Math.floor(flightSeconds / SHOT_DT);
    const point = shot.points[index];
    ball.position
      .copy(point.position)
      .multiplyScalar(YARDS_PER_METER)
      .add(restPosition);
    ballVelocity.copy(point.velocity).multiplyScalar(YARDS_PER_METER);
    tracer.geometry.instanceCount = Math.floor(index / TRACER_STRIDE);
  }

  // On the ground: interpolate along the bounce-and-roll path. Returns true
  // once the ball has stopped.
  function followRun() {
    const t = flightSeconds - airSeconds;
    while (runIndex < runPath.length - 2 && runPath[runIndex + 1].t <= t) {
      runIndex++;
    }
    const from = runPath[runIndex];
    const to = runPath[runIndex + 1];
    const span = to.t - from.t;
    const fraction =
      span > 0 ? Math.min(1, Math.max(0, (t - from.t) / span)) : 1;
    ball.position.lerpVectors(from.position, to.position, fraction);
    // Keep the last heading once the ball is nearly still so the camera
    // doesn't swing round on a rounding error.
    if (span > 0 && from.position.distanceToSquared(to.position) > 1e-6) {
      ballVelocity
        .subVectors(to.position, from.position)
        .divideScalar(span)
        .setY(0);
    }
    tracer.geometry.instanceCount = airSegments + runIndex + 1;
    return t >= runPath[runPath.length - 1].t;
  }

  function updateFlight(dt) {
    flightSeconds += dt;
    const onGround = flightSeconds >= airSeconds;
    const stopped = onGround ? followRun() : followAir();

    progressSeconds += dt;
    if (onProgress && progressSeconds >= PROGRESS_INTERVAL_SECONDS) {
      progressSeconds = 0;
      onProgress({
        distanceYards: ball.position.z,
        heightYards: ball.position.y,
        offlineYards: -ball.position.x,
        onGround,
      });
    }

    // An air target lights up as the ball goes through it.
    if (
      target?.air &&
      analysis.target?.hit &&
      Math.hypot(
        ball.position.x - target.x,
        ball.position.y - target.y,
        ball.position.z - target.z,
      ) <= target.radius
    ) {
      paintTarget(true);
    }

    if (stopped) {
      landing.copy(ball.position).setY(0);
      tracer.geometry.instanceCount = Infinity;

      landingMarker.position.copy(landing);
      const material = landingLabel.material;
      if (material.map) material.map.dispose();
      material.map = labelTexture(`${Math.round(analysis.totalYards)} yd`);
      material.needsUpdate = true;
      landingMarker.visible = true;
      landed = true;

      if (analysis.target) paintTarget(analysis.target.hit);
      landedSeconds = 0;
      setState(LANDED);
      if (onResult) onResult(analysis);
    }
  }

  let scenerySeconds = 0;
  function update(dt) {
    scenerySeconds += dt;
    range.userData.update(scenerySeconds, camera);
    celebration.update(dt);
    if (airTarget.visible) airBall.rotation.y = scenerySeconds * 1.6;
    if (state !== ADDRESS) {
      // The swing keeps running into its follow-through after the ball has gone.
      swingSeconds = Math.min(swingSeconds + dt, SWING_DURATION);
      golfer.setTime(swingSeconds);
    } else {
      // Standing over the ball, the golfer breathes and settles.
      golfer.setIdle(scenerySeconds);
    }

    if (state === SWING) {
      // The ball leaves the moment the clubhead gets back to it.
      if (swingSeconds >= CONTACT_TIME) {
        setState(FLIGHT);
        updateFlight(swingSeconds - CONTACT_TIME);
      }
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
  let viewInset = 0;
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // On tall, narrow screens widen the lens so the range still reads.
    camera.fov = camera.aspect < 1 ? 62 : 48;
    // The camera is behind the ball, so a right-hander stands left of the
    // middle, where the shot panel may lie over the picture. Slide the
    // picture right (a lens shift: straight lines stay straight) just far
    // enough to keep the golfer clear of the covered strip.
    const focal = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const golferPixels = (focal * GOLFER_CLEARANCE) / ADDRESS_DISTANCE;
    const shift =
      side === "Left"
        ? 0
        : Math.min(
            width * 0.3,
            Math.max(0, viewInset + golferPixels + 8 - width / 2),
          );
    if (shift) {
      camera.setViewOffset(width, height, -shift, 0, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    tracerMaterial.resolution.set(width, height);
  }
  function setViewInset(leftPixels) {
    viewInset = leftPixels;
    resize();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // --- looking round ---
  // Dragging the picture swings the camera round the golfer, and the wheel
  // moves it in and out; it stays there until reset or the next hit.
  let orbit = null;
  let drag = null;
  const DRAG_START_PIXELS = 4;
  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  const orbitCenter = () =>
    new THREE.Vector3(side === "Left" ? -0.6 : 0.6, 1, 0);
  function beginOrbit() {
    if (orbit) return;
    orbit = startOrbit(camera.position, orbitCenter());
    if (onOrbit) onOrbit(true);
  }
  function resetView() {
    if (!orbit) return;
    orbit = null;
    if (onOrbit) onOrbit(false);
  }
  function onPointerDown(event) {
    if (event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START_PIXELS) return;
    if (!drag.moved) {
      drag.moved = true;
      canvas.style.cursor = "grabbing";
      beginOrbit();
    }
    dragOrbit(orbit, dx, dy);
    drag.x = event.clientX;
    drag.y = event.clientY;
  }
  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    canvas.style.cursor = "grab";
  }
  function onWheel(event) {
    event.preventDefault();
    beginOrbit();
    zoomOrbit(orbit, Math.exp(event.deltaY * 0.0015));
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const clock = new THREE.Clock();
  let frameId = null;
  let inspectionView = null;
  function frame() {
    frameId = requestAnimationFrame(frame);
    update(Math.min(clock.getDelta(), MAX_FRAME_SECONDS));
    if (orbit) {
      orbitPosition(orbit, camera.position);
      camera.lookAt(orbit.center);
    }
    if (inspectionView) {
      camera.position.fromArray(inspectionView.position);
      camera.lookAt(new THREE.Vector3().fromArray(inspectionView.target));
    }
    renderer.render(scene, camera);
  }
  ballToRest();
  frame();

  function dispose() {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
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
    setAim,
    setTarget,
    setClub,
    setViewInset,
    resetView,
    // The last shot's line and landing marker, put away once the next shot
    // is being lined up and brought back if it is asked for again.
    showShot(visible) {
      tracer.visible = visible && traced;
      landingMarker.visible = visible && landed;
    },
    // Confetti and a sound for a won game: "win", or "perfect" for 5 of 5.
    celebrate: celebration.celebrate,
    dispose,
    // Step the simulation by hand; used to verify behaviour without waiting
    // on real time.
    advance(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) update(step);
      renderer.render(scene, camera);
    },
    // Hold the camera at a fixed spot to look at scenery; view(null) releases it.
    view(position, target) {
      inspectionView = position ? { position, target } : null;
    },
    inspect() {
      return {
        state,
        side,
        ball: ball.position.toArray(),
        camera: camera.position.toArray(),
        cameraTarget: director.target.toArray(),
        flightSeconds,
        swingSeconds,
        target,
        clubhead: golfer.group
          .getObjectByName("clubhead")
          .getWorldPosition(new THREE.Vector3())
          .toArray(),
        analysis,
      };
    },
    scene,
    camera,
  };
  if (process.env.NODE_ENV !== "production") window.__golfSim = api;
  return api;
}
