// Confetti lives in the camera's own frame so it is on screen wherever the
// camera is: x right, y up, z the distance in front of the lens, in yards.
const GRAVITY = 6;
const DRAG = 2.2;
const FADE_SECONDS = 0.5;

export const CONFETTI = {
  win: {
    spread: 0.5,
    life: [2.8, 3.6],
    bursts: [{ delay: 0, x: 0, lean: 0, count: 240 }],
  },
  perfect: {
    spread: 0.65,
    life: [3.4, 4.2],
    bursts: [
      { delay: 0, x: 0, lean: 0, count: 220 },
      { delay: 0.45, x: -0.6, lean: 0.35, count: 160 },
      { delay: 0.45, x: 0.6, lean: -0.35, count: 160 },
    ],
  },
};

const settings = (level) => CONFETTI[level] || CONFETTI.win;

export function confettiCount(level) {
  return settings(level).bursts.reduce((sum, burst) => sum + burst.count, 0);
}

export function confettiSeconds(level) {
  const { bursts, life } = settings(level);
  return Math.max(...bursts.map((burst) => burst.delay)) + life[1];
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function spawnConfetti(level, random = Math.random) {
  const { bursts, spread, life } = settings(level);
  const between = (min, max) => min + (max - min) * random();
  const pieces = [];
  for (const burst of bursts) {
    for (let i = 0; i < burst.count; i++) {
      const z = between(4, 7);
      const angle = burst.lean + between(-spread, spread);
      // Farther pieces are thrown harder so they cover the same share of
      // the picture.
      const speed = (between(9, 14) * z) / 5;
      const up = between(-1, 1);
      const round = between(0, Math.PI * 2);
      const flat = Math.sqrt(1 - up * up);
      pieces.push({
        age: -burst.delay,
        life: between(life[0], life[1]),
        x: burst.x * z + between(-0.3, 0.3),
        // Just under the bottom edge of the picture at this depth.
        y: -0.5 * z,
        z,
        vx: speed * Math.sin(angle),
        vy: speed * Math.cos(angle),
        vz: between(-1, 1),
        axis: [flat * Math.cos(round), flat * Math.sin(round), up],
        angle: between(0, Math.PI * 2),
        spin: between(4, 14) * (random() < 0.5 ? -1 : 1),
        size: between(0.07, 0.13),
      });
    }
  }
  return pieces;
}

// Moves the pieces on by dt and returns how many are still to finish.
export function stepConfetti(pieces, dt) {
  let alive = 0;
  for (const piece of pieces) {
    if (piece.age >= piece.life) continue;
    piece.age += dt;
    if (piece.age >= piece.life) continue;
    alive++;
    if (piece.age < 0) continue;
    piece.vx -= DRAG * piece.vx * dt;
    piece.vy -= (DRAG * piece.vy + GRAVITY) * dt;
    piece.vz -= DRAG * piece.vz * dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.z += piece.vz * dt;
    piece.angle += piece.spin * dt;
  }
  return alive;
}

// Drawn size: nothing before launch or after its life, shrinking away at the end.
export function pieceScale(piece) {
  if (piece.age < 0 || piece.age >= piece.life) return 0;
  return piece.size * Math.min(1, (piece.life - piece.age) / FADE_SECONDS);
}

const ARPEGGIO = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];

// The sound as notes: frequency in Hz, start and duration in seconds, gain
// as a share of the master volume.
export function celebrationNotes(level) {
  if (level !== "perfect") {
    return ARPEGGIO.slice(0, 4).map((frequency, i) => ({
      frequency,
      start: i * 0.085,
      duration: i === 3 ? 0.6 : 0.3,
      gain: 0.5,
    }));
  }
  const run = ARPEGGIO.map((frequency, i) => ({
    frequency,
    start: i * 0.075,
    duration: 0.3,
    gain: 0.45,
  }));
  const chord = [1046.5, 1318.51, 1567.98, 2093].map((frequency) => ({
    frequency,
    start: 0.5,
    duration: 0.9,
    gain: 0.22,
  }));
  return [...run, ...chord];
}
