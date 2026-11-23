import {
  randomTarget,
  shapedTarget,
  shapedAirTarget,
  curveOf,
  SHAPES,
  evaluateTarget,
  describeMiss,
  GOALS,
} from "./game";
import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { toYards } from "./conversions-lib";
import { CLUBS, getClub, swingSpeedRange } from "./clubs";
import { analyzeShot } from "./shot-analysis";
import { groundRun, turfParameters, TURF_PRESETS } from "./ground";

// A repeatable stand-in for Math.random.
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("randomTarget", () => {
  test("stays on the range, within reach of the swing-speed slider", () => {
    for (let i = 0; i < 500; i++) {
      const target = randomTarget();
      expect(target.z).toBeGreaterThanOrEqual(140);
      expect(target.z).toBeLessThanOrEqual(330);
      expect(Math.abs(target.x)).toBeLessThanOrEqual(40);
      expect(target.radius).toBe(7.2);
    }
  });

  test("a club's reach moves the targets in, and nearer the centre line", () => {
    const reach = { nearest: 62, farthest: 114 };
    for (let i = 0; i < 300; i++) {
      const target = randomTarget(Math.random, null, reach);
      expect(target.z).toBeGreaterThanOrEqual(62);
      expect(target.z).toBeLessThanOrEqual(114);
      expect(Math.abs(target.x)).toBeLessThanOrEqual((target.z * 40) / 140);
    }
  });

  test("targets are the same size near and far", () => {
    const near = randomTarget(sequence(0, 0.5));
    const far = randomTarget(sequence(0.999, 0.5));
    expect(near.z).toBeCloseTo(140);
    expect(far.radius).toBe(near.radius);
  });

  test("reports distance from the tee and which side of the line it is on", () => {
    const right = randomTarget(sequence(0.5, 0));
    expect(right.x).toBeCloseTo(-40);
    expect(right.offlineYards).toBe(40);
    expect(right.distanceYards).toBe(Math.round(Math.hypot(40, 235)));

    const left = randomTarget(sequence(0.5, 1));
    expect(left.offlineYards).toBe(-40);
  });

  test("does not put the next target on top of the last one", () => {
    const previous = randomTarget(sequence(0.5, 0.5));
    // first draw repeats the old spot, second draw is somewhere else
    const next = randomTarget(sequence(0.5, 0.5, 0.9, 0.1), previous);
    expect(
      Math.hypot(next.z - previous.z, next.x - previous.x),
    ).toBeGreaterThan(35);
  });
});

describe("evaluateTarget", () => {
  const target = { x: 10, z: 200, radius: 15 };
  const ground = (x, z) => ({ x, y: 0.02, z });
  const air = (x, z) => ({ x, y: 1.5, z });

  test("stopping inside the ring is a hit", () => {
    const result = evaluateTarget(target, [ground(0, 150), ground(12, 205)]);
    expect(result.hit).toBe(true);
    expect(result.restYards).toBeCloseTo(Math.hypot(2, 5));
  });

  test("landing in the ring counts even if the ball runs out of it", () => {
    const result = evaluateTarget(target, [
      ground(10, 198),
      air(10, 210),
      ground(10, 230),
    ]);
    expect(result.hit).toBe(true);
    expect(result.longYards).toBeCloseTo(30);
  });

  test("rolling through the ring counts", () => {
    const path = [];
    for (let z = 170; z <= 240; z += 2) path.push(ground(10, z));
    expect(evaluateTarget(target, path).hit).toBe(true);
  });

  test("flying over the ring without touching down in it is a miss", () => {
    const result = evaluateTarget(target, [
      ground(10, 170),
      air(10, 200),
      ground(10, 240),
    ]);
    expect(result.hit).toBe(false);
  });

  test("a miss says how far and which way, with right of the target positive", () => {
    const result = evaluateTarget(target, [ground(30, 180)]);
    expect(result.hit).toBe(false);
    expect(result.longYards).toBeCloseTo(-20);
    expect(result.rightYards).toBeCloseTo(-20);
    expect(describeMiss(result)).toBe("20 yd short, 20 yd left");

    expect(describeMiss({ longYards: 12.4, rightYards: 3.6 })).toBe(
      "12 yd long, 4 yd right",
    );
    expect(describeMiss({ longYards: 0.2, rightYards: -7 })).toBe("7 yd left");
    expect(describeMiss({ longYards: 0, rightYards: 0 })).toBe("dead centre");
  });
});

describe("air targets", () => {
  const flightOf = (swing) =>
    new Shot({
      dt: 0.01,
      ...launchConditions({ side: "Right", ...swing }),
    }).points.map(({ position }) => ({
      x: toYards(position.x),
      y: toYards(position.y),
      z: toYards(position.z),
    }));

  test("float clear of the ground, downrange, in different parts of the air", () => {
    const heights = [];
    const sides = new Set();
    for (let i = 0; i < 80; i++) {
      const target = shapedAirTarget();
      expect(target.air).toBe(true);
      expect(target.y - target.radius).toBeGreaterThanOrEqual(1);
      expect(target.z).toBeGreaterThanOrEqual(30);
      expect(target.z).toBeLessThan(330);
      expect(target.radius).toBeGreaterThan(1.6);
      expect(target.radius).toBeLessThan(4);
      expect(target.heightYards).toBe(Math.round(target.y));
      heights.push(target.y);
      sides.add(Math.sign(Math.round(target.x)));
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(15);
    expect(sides.has(1) && sides.has(-1)).toBe(true);
  });

  const target = { air: true, x: 0, y: 20, z: 150, radius: 8 };
  const line = (y, x = 0, endZ = 300) => [
    { x, y, z: 0 },
    { x, y, z: endZ },
  ];

  test("flying through the sphere is a hit, between sampled points too", () => {
    expect(evaluateTarget(target, [], line(24)).hit).toBe(true);
    expect(evaluateTarget(target, [], line(20, 7.9)).hit).toBe(true);
  });

  test("passing under it is a miss, described by height and side", () => {
    const outcome = evaluateTarget(target, [], line(8, -5));
    expect(outcome.hit).toBe(false);
    expect(describeMiss(outcome)).toBe("12 yd low, 5 yd right");
    expect(describeMiss(evaluateTarget(target, [], line(31, 2)))).toBe(
      "11 yd high, 2 yd left",
    );
  });

  test("a ball that never gets there fell short", () => {
    const outcome = evaluateTarget(target, [], line(1, 0, 110));
    expect(outcome.hit).toBe(false);
    expect(describeMiss(outcome)).toBe("fell 40 yd short");
  });

  test("a ball rolling along the ground under it does not count", () => {
    const outcome = evaluateTarget(target, line(0.02), line(30, 0, 100));
    expect(outcome.hit).toBe(false);
  });
});

// Medium and hard: the target names a club and a shape.
describe("targets that name a club and a shape", () => {
  const yards = ({ x, y, z }) => ({
    x: toYards(x),
    y: toYards(y),
    z: toYards(z),
  });
  // Plays a swing the way the scene does: named, aimed, flown, run out and
  // judged against the target.
  const play = (target, clubId, { speed, face, path, aim }, side) => {
    const shot = new Shot({
      dt: 0.01,
      ...launchConditions({
        swingSpeedMPH: speed,
        faceAngle: face,
        pathAngle: path,
        side,
        club: clubId,
      }),
    });
    const { shape } = analyzeShot(shot, side);
    shot.aim(aim);
    const run = groundRun(
      shot.points[shot.points.length - 1],
      turfParameters(TURF_PRESETS.normal),
    );
    return evaluateTarget(
      target,
      run.points.map(({ position }) => yards(position)),
      shot.points.map(({ position }) => yards(position)),
      { clubId, shape },
    );
  };
  const make = { ground: shapedTarget, air: shapedAirTarget };

  test.each([
    ["ground", "Right"],
    ["ground", "Left"],
    ["air", "Right"],
    ["air", "Left"],
  ])(
    "every %s target can be hit by a %s-hander with its club and shape, on the controls' own steps",
    (kind, side) => {
      let previous = null;
      for (let i = 0; i < 120; i++) {
        const target = make[kind](Math.random, previous, { side });
        const { need, solution } = target;
        const club = getClub(need.clubId);
        const speeds = swingSpeedRange(club);
        expect(club.id).toBe(need.clubId);
        expect(SHAPES).toContain(need.shape);
        for (const value of Object.values(solution))
          expect(Number.isInteger(value)).toBe(true);
        expect(solution.speed).toBeGreaterThanOrEqual(speeds.MIN);
        expect(solution.speed).toBeLessThanOrEqual(speeds.MAX);
        expect(Math.abs(solution.face)).toBeLessThanOrEqual(6);
        expect(Math.abs(solution.path)).toBeLessThanOrEqual(6);
        expect(Math.abs(solution.aim)).toBeLessThanOrEqual(10);
        const outcome = play(target, need.clubId, solution, side);
        expect(outcome).toMatchObject({ hit: true, reached: true });
        if (previous) expect(need.clubId).not.toBe(previous.need.clubId);
        previous = target;
      }
    },
  );

  test("ground targets stay on the range, at a distance the club covers", () => {
    for (let i = 0; i < 300; i++) {
      const target = shapedTarget();
      expect(target.z).toBeLessThanOrEqual(330);
      expect(Math.abs(target.x)).toBeLessThanOrEqual(
        Math.min(40, (target.z * 40) / 140),
      );
      expect(target.radius).toBe(7.2);
      expect(target.air).toBeUndefined();
    }
  });

  test("the whole bag and all three shapes turn up, soft swings and full ones", () => {
    const clubs = new Set();
    const shapes = new Set();
    let soft = 0;
    let full = 0;
    for (let i = 0; i < 600; i++) {
      const { need, solution } = shapedTarget();
      clubs.add(need.clubId);
      shapes.add(need.shape);
      const { MIN, MAX } = swingSpeedRange(getClub(need.clubId));
      const share = (solution.speed - MIN) / (MAX - MIN);
      if (share < 0.25) soft++;
      if (share > 0.75) full++;
    }
    expect(clubs.size).toBe(CLUBS.length);
    expect([...shapes].sort()).toEqual([...SHAPES].sort());
    expect(soft).toBeGreaterThan(60);
    expect(full).toBeGreaterThan(30);
  });

  test("part swings turn up: a driver bumped under 100 yd, a wedge chipped under 50", () => {
    let shortDriver = false;
    let chip = false;
    for (let i = 0; i < 4000 && !(shortDriver && chip); i++) {
      const { need, z } = shapedTarget();
      expect(z).toBeGreaterThanOrEqual(30);
      if (need.clubId === "driver" && z < 100) shortDriver = true;
      if (["pw", "gw", "sw", "lw"].includes(need.clubId) && z < 50) chip = true;
    }
    expect(shortDriver).toBe(true);
    expect(chip).toBe(true);
  });

  test("an air target is on the flight itself, clear of the turf", () => {
    for (let i = 0; i < 200; i++) {
      const target = shapedAirTarget();
      expect(target.z).toBeGreaterThanOrEqual(30);
      expect(target.y - target.radius).toBeGreaterThanOrEqual(1);
    }
  });

  test("a straight target comes from a square face, a draw from a closed one, a fade from an open one", () => {
    for (let i = 0; i < 300; i++) {
      const { need, solution } = shapedTarget();
      if (need.shape === "Straight") {
        expect(solution.face).toBe(solution.path);
        continue;
      }
      // Face closed to the path for a draw, open for a fade.
      const bend = solution.face - solution.path;
      expect(Math.sign(bend)).toBe(need.shape === "Draw" ? -1 : 1);
    }
  });

  test("a shot's shape is the way it curved, whatever line it started on", () => {
    expect(curveOf("Push Draw")).toBe("Draw");
    expect(curveOf("Hook")).toBe("Draw");
    expect(curveOf("Pull Fade")).toBe("Fade");
    expect(curveOf("Slice")).toBe("Fade");
    expect(curveOf("Push")).toBe("Straight");
    expect(curveOf("Straight")).toBe("Straight");
  });

  const target = {
    x: 0,
    z: 200,
    radius: 7.2,
    need: { clubId: "7i", shape: "Draw" },
  };
  const onIt = [{ x: 1, y: 0.02, z: 201 }];

  test("reaching it with the right club and shape is a hit", () => {
    const outcome = evaluateTarget(target, onIt, [], {
      clubId: "7i",
      shape: "Push Draw",
    });
    expect(outcome).toMatchObject({ hit: true, reached: true });
  });

  test("reaching it with another club is a miss", () => {
    const outcome = evaluateTarget(target, onIt, [], {
      clubId: "6i",
      shape: "Draw",
    });
    expect(outcome).toMatchObject({ hit: false, reached: true });
    expect(describeMiss(outcome)).toBe("wrong club");
  });

  test("reaching it with another shape is a miss that names both shapes", () => {
    const outcome = evaluateTarget(target, onIt, [], {
      clubId: "7i",
      shape: "Fade",
    });
    expect(outcome).toMatchObject({ hit: false, reached: true });
    expect(describeMiss(outcome)).toBe("a fade, not a draw");
    expect(
      describeMiss(
        evaluateTarget(target, onIt, [], { clubId: "7i", shape: "Pull" }),
      ),
    ).toBe("straight, not a draw");
  });

  test("missing it is described by where the ball went", () => {
    const outcome = evaluateTarget(target, [{ x: 0, y: 0.02, z: 180 }], [], {
      clubId: "7i",
      shape: "Fade",
    });
    expect(outcome).toMatchObject({ hit: false, reached: false });
    expect(describeMiss(outcome)).toBe("20 yd short");
  });

  test("a target that names nothing takes any club and shape", () => {
    const outcome = evaluateTarget({ x: 0, z: 200, radius: 7.2 }, onIt);
    expect(outcome.hit).toBe(true);
    expect(outcome.reached).toBeUndefined();
  });
});

test("every game is 3 targets and all 3 have to be hit", () => {
  for (const mode of ["normal", "medium", "advanced"])
    expect(GOALS[mode]).toEqual({ targets: 3, toWin: 3 });
});

describe("easyTarget", () => {
  const { easyTarget, evaluateTarget: judge } = require("./game");
  const { TURF_PRESETS } = require("./ground");

  test("sits on the centre line where the stock straight drive stops", () => {
    const target = easyTarget({ speed: 105, turf: TURF_PRESETS.normal });
    expect(target.x).toBe(0);
    expect(target.offlineYards).toBe(0);
    expect(target.easy).toBe(true);
    expect(target.z).toBeGreaterThan(200);
    expect(target.z).toBeLessThan(300);
  });

  test("a firmer turf moves it out", () => {
    const soft = easyTarget({ speed: 105, turf: TURF_PRESETS.soft });
    const firm = easyTarget({ speed: 105, turf: TURF_PRESETS.firm });
    expect(firm.z).toBeGreaterThan(soft.z);
  });

  test("works for a short club", () => {
    const target = easyTarget({
      clubId: "pw",
      speed: 80,
      turf: TURF_PRESETS.normal,
    });
    expect(target.z).toBeGreaterThan(80);
    expect(target.z).toBeLessThan(160);
    // a ball resting at its centre is a hit
    expect(judge(target, [{ x: 0, y: 0, z: target.z }]).hit).toBe(true);
  });
});

describe("easyTarget against the scene's own shot", () => {
  const { easyTarget, evaluateTarget: judge } = require("./game");
  const { groundRun, turfParameters, TURF_PRESETS } = require("./ground");
  const { getClub, swingSpeedRange } = require("./clubs");
  // As main.js flies and scores a shot: a 1 ms step, the run after
  // touchdown lifted by the ball's radius, all in yards.
  const sceneOutcome = (target, clubId, speed, turf) => {
    const shot = new Shot({
      dt: 0.001,
      ...launchConditions({
        swingSpeedMPH: speed,
        faceAngle: 0,
        pathAngle: 0,
        side: "Right",
        club: clubId,
      }),
    });
    const touchdown = shot.points[shot.points.length - 1];
    const run = groundRun(touchdown, turfParameters(turf));
    const yards = toYards(1);
    return judge(
      target,
      run.points.map(({ position: p }) => ({
        x: p.x * yards,
        y: p.y * yards + 0.0234,
        z: p.z * yards,
      })),
    );
  };

  test.each(["driver", "7i", "pw"])(
    "the stock straight %s hits it on every turf",
    (clubId) => {
      const speed = swingSpeedRange(getClub(clubId)).DEFAULT;
      for (const preset of ["soft", "normal", "firm"]) {
        const turf = TURF_PRESETS[preset];
        const target = easyTarget({ clubId, speed, turf });
        expect(sceneOutcome(target, clubId, speed, turf).hit).toBe(true);
      }
    },
  );
});
