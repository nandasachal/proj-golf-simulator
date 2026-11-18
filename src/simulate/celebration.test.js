import {
  CONFETTI,
  celebrationNotes,
  confettiCount,
  confettiSeconds,
  pieceScale,
  seededRandom,
  spawnConfetti,
  stepConfetti,
} from "./celebration";

const STEP = 1 / 60;

describe("confetti", () => {
  it("throws more pieces, in more bursts, for a perfect game", () => {
    const win = spawnConfetti("win", seededRandom(1));
    const perfect = spawnConfetti("perfect", seededRandom(1));
    expect(win).toHaveLength(240);
    expect(perfect).toHaveLength(540);
    expect(confettiCount("win")).toBe(240);
    expect(confettiCount("perfect")).toBe(540);
    expect(CONFETTI.perfect.bursts.length).toBeGreaterThan(
      CONFETTI.win.bursts.length,
    );
    expect(confettiSeconds("perfect")).toBeGreaterThan(confettiSeconds("win"));
  });

  it("treats an unknown level as a win", () => {
    expect(spawnConfetti("nonsense", seededRandom(1))).toEqual(
      spawnConfetti("win", seededRandom(1)),
    );
  });

  it("is the same burst for the same seed", () => {
    expect(spawnConfetti("perfect", seededRandom(7))).toEqual(
      spawnConfetti("perfect", seededRandom(7)),
    );
    expect(spawnConfetti("perfect", seededRandom(7))).not.toEqual(
      spawnConfetti("perfect", seededRandom(8)),
    );
  });

  it("starts below the picture, in front of the lens", () => {
    for (const piece of spawnConfetti("perfect", seededRandom(3))) {
      expect(piece.z).toBeGreaterThanOrEqual(4);
      expect(piece.y).toBeLessThan(-0.445 * piece.z);
      expect(piece.vy).toBeGreaterThan(0);
    }
  });

  it("holds a delayed burst still and hidden until its moment", () => {
    const pieces = spawnConfetti("perfect", seededRandom(3));
    const late = pieces.filter((piece) => piece.age < 0);
    expect(late).toHaveLength(320);
    const before = late.map((piece) => piece.y);
    stepConfetti(pieces, 0.2);
    expect(late.map((piece) => piece.y)).toEqual(before);
    expect(late.every((piece) => pieceScale(piece) === 0)).toBe(true);
  });

  it.each(["win", "perfect"])("%s pieces rise, then fall", (level) => {
    const pieces = spawnConfetti(level, seededRandom(11));
    const start = pieces.map((piece) => piece.y);
    const peak = [...start];
    const last = [...start];
    for (let t = 0; t < confettiSeconds(level) + 0.5; t += STEP) {
      stepConfetti(pieces, STEP);
      pieces.forEach((piece, i) => {
        if (pieceScale(piece) === 0) return;
        peak[i] = Math.max(peak[i], piece.y);
        last[i] = piece.y;
      });
    }
    pieces.forEach((piece, i) => {
      expect(peak[i]).toBeGreaterThan(start[i] + 0.5);
      expect(last[i]).toBeLessThan(peak[i] - 0.5);
      expect(piece.vy).toBeLessThan(0);
      expect(piece.z).toBeGreaterThan(3);
    });
  });

  it.each(["win", "perfect"])("%s is over by the end of its time", (level) => {
    const pieces = spawnConfetti(level, seededRandom(5));
    let alive = pieces.length;
    for (let t = 0; t < confettiSeconds(level) - 1; t += STEP) {
      alive = stepConfetti(pieces, STEP);
    }
    expect(alive).toBeGreaterThan(0);
    for (let t = 0; t < 1 + 2 * STEP; t += STEP) {
      alive = stepConfetti(pieces, STEP);
    }
    expect(alive).toBe(0);
    expect(pieces.every((piece) => pieceScale(piece) === 0)).toBe(true);
    expect(confettiSeconds(level)).toBeLessThan(5);
  });

  it("shrinks a piece away at the end of its life", () => {
    const piece = { age: 1, life: 3, size: 0.1 };
    expect(pieceScale(piece)).toBeCloseTo(0.1);
    expect(pieceScale({ ...piece, age: 2.75 })).toBeCloseTo(0.05);
    expect(pieceScale({ ...piece, age: 3 })).toBe(0);
    expect(pieceScale({ ...piece, age: -0.1 })).toBe(0);
  });
});

describe("celebration sound", () => {
  it("is a short rising arpeggio for a win", () => {
    const notes = celebrationNotes("win");
    expect(notes).toHaveLength(4);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].frequency).toBeGreaterThan(notes[i - 1].frequency);
      expect(notes[i].start).toBeGreaterThan(notes[i - 1].start);
    }
    const end = Math.max(...notes.map((note) => note.start + note.duration));
    expect(end).toBeLessThan(1);
  });

  it("is fuller for a perfect game", () => {
    const notes = celebrationNotes("perfect");
    expect(notes.length).toBeGreaterThan(celebrationNotes("win").length);
    const end = Math.max(...notes.map((note) => note.start + note.duration));
    expect(end).toBeLessThan(1.6);
  });

  // Each note decays exponentially from its gain to 0.0001 over its duration,
  // so the loudest moments are the note onsets.
  it.each(["win", "perfect"])("%s stays under the master volume", (level) => {
    const notes = celebrationNotes(level);
    for (const { start } of notes) {
      const sum = notes
        .filter(
          (note) => note.start <= start && start < note.start + note.duration,
        )
        .reduce(
          (total, note) =>
            total +
            note.gain *
              (0.0001 / note.gain) ** ((start - note.start) / note.duration),
          0,
        );
      expect(sum).toBeLessThanOrEqual(1);
    }
  });
});
