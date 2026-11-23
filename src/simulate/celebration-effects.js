import * as THREE from "three";
import {
  celebrationNotes,
  confettiCount,
  pieceScale,
  spawnConfetti,
  stepConfetti,
} from "./celebration";

const COLORS = [0xffc93c, 0xff5d5d, 0x4dd0ff, 0x8dff3a, 0xff7ad9, 0xffffff];
const MASTER_GAIN = 0.15;
// The confetti maths assumes the landscape lens; other lenses stretch it.
const DESIGN_HALF_FOV = (24 * Math.PI) / 180;
const DESIGN_ASPECT = 1.6;

let audio = null;

function playSound(level) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const master = audio.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(audio.destination);
    const now = audio.currentTime + 0.02;
    for (const note of celebrationNotes(level)) {
      const start = now + note.start;
      const oscillator = audio.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = note.frequency;
      const envelope = audio.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.linearRampToValueAtTime(note.gain, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(envelope).connect(master);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
    }
  } catch (error) {
    // Autoplay policy or no audio device: the win just goes unheard.
  }
}

// The confetti rides on the camera, so the camera must be in the scene graph.
export function createCelebration(camera) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 0.6),
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
    confettiCount("perfect"),
  );
  mesh.name = "confetti";
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  const color = new THREE.Color();
  for (let i = 0; i < mesh.count; i++) {
    mesh.setColorAt(i, color.set(COLORS[i % COLORS.length]));
  }
  camera.add(mesh);

  let pieces = null;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function celebrate(level) {
    playSound(level);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    pieces = spawnConfetti(level);
    const lens =
      Math.tan((camera.fov * Math.PI) / 360) / Math.tan(DESIGN_HALF_FOV);
    mesh.scale.set(lens * Math.min(1, camera.aspect / DESIGN_ASPECT), lens, 1);
    mesh.count = pieces.length;
    mesh.visible = true;
    update(0);
  }

  function update(dt) {
    if (!pieces) return;
    const alive = stepConfetti(pieces, dt);
    if (!alive) {
      pieces = null;
      mesh.visible = false;
      return;
    }
    pieces.forEach((piece, i) => {
      position.set(piece.x, piece.y, -piece.z);
      quaternion.setFromAxisAngle(axis.fromArray(piece.axis), piece.angle);
      matrix.compose(position, quaternion, scale.setScalar(pieceScale(piece)));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { celebrate, update };
}
