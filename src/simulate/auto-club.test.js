import { pickClub, bagReach } from "./auto-club";
import { CLUBS, swingSpeedRange } from "./clubs";
import { easyTarget } from "./game";
import { TURF_PRESETS } from "./ground";
import { Shot } from "./shot";
import { launchConditions } from "./launch-conditions";
import { toYards } from "./conversions-lib";

const turf = TURF_PRESETS.normal;
const ground = (z, x = 0) => ({ x, z });
const air = (z, y, x = 0) => ({ air: true, x, y, z });

// Where a club's stock shot stops, as the first-visit target works it out.
const rest = (club, speed = swingSpeedRange(club).DEFAULT, on = turf) =>
  easyTarget({ clubId: club.id, speed, turf: on }).z;

// A club's straight flight, in yards: its stock swing unless a speed is given.
const flight = (
  clubId,
  speed = swingSpeedRange(CLUBS.find((entry) => entry.id === clubId)).DEFAULT,
) => {
  return new Shot({
    dt: 0.01,
    ...launchConditions({
      swingSpeedMPH: speed,
      faceAngle: 0,
      pathAngle: 0,
      side: "Right",
      club: clubId,
    }),
  }).points.map(({ position }) => ({
    y: toYards(position.y),
    z: toYards(position.z),
  }));
};

describe("pickClub, target on the ground", () => {
  test.each(CLUBS.map((club) => [club.id, club]))(
    "a target where the %s's stock shot stops gets that club",
    (id, club) => {
      expect(pickClub(ground(rest(club)), { turf })).toBe(id);
    },
  );

  test("clubs get shorter as the target gets nearer", () => {
    expect(pickClub(ground(238), { turf })).toBe("driver");
    expect(pickClub(ground(150), { turf })).toBe("7i");
    expect(pickClub(ground(110), { turf })).toBe("pw");
  });

  test("a target shorter than any club reaches gets the shortest club", () => {
    expect(pickClub(ground(20), { turf })).toBe("lw");
  });

  test("a target longer than any club reaches gets the driver", () => {
    expect(pickClub(ground(330), { turf })).toBe("driver");
  });

  test("the distance is to the target, not just downrange", () => {
    const sevenIron = rest(CLUBS.find((club) => club.id === "7i"));
    const z = sevenIron - 4;
    const x = Math.sqrt(sevenIron ** 2 - z ** 2);
    expect(pickClub(ground(z, x), { turf })).toBe("7i");
    expect(pickClub(ground(z, -x), { turf })).toBe("7i");
  });

  test("a club's distance set in Settings is the one it is judged by", () => {
    const lobWedge = CLUBS.find((club) => club.id === "lw");
    const speed = swingSpeedRange(lobWedge).MAX;
    const far = rest(lobWedge, speed);
    expect(pickClub(ground(far), { turf })).not.toBe("lw");
    expect(pickClub(ground(far), { turf, speeds: { lw: speed } })).toBe("lw");
  });

  test("the turf counts: the ball runs farther on firm ground", () => {
    const driver = CLUBS[0];
    const firm = TURF_PRESETS.firm;
    expect(rest(driver, undefined, firm)).toBeGreaterThan(rest(driver) + 5);
    expect(
      pickClub(ground(rest(CLUBS[1], undefined, firm)), { turf: firm }),
    ).toBe(CLUBS[1].id);
  });
});

describe("pickClub, target in the air", () => {
  const nearestPass = (id, target, speed) =>
    Math.min(
      ...flight(id, speed).map((point) =>
        Math.hypot(point.z - target.z, point.y - target.y),
      ),
    );
  const apex = (id, speed) =>
    flight(id, speed).reduce((top, point) => (point.y > top.y ? point : top));

  test.each(["driver", "5w", "4h", "7i", "pw", "lw"])(
    "a target at the top of the %s's stock flight gets that club",
    (id) => {
      const top = apex(id);
      expect(pickClub(air(top.z, top.y), { turf })).toBe(id);
    },
  );

  test.each(["driver", "4i", "sw"])(
    "a target on a harder swing with the %s gets a club that can fly through it",
    (id) => {
      const club = CLUBS.find((entry) => entry.id === id);
      const { MIN, MAX } = swingSpeedRange(club);
      const points = flight(id, MIN + 0.8 * (MAX - MIN));
      const spot = points[Math.floor(points.length * 0.6)];
      const target = air(spot.z, spot.y);
      const picked = CLUBS.find(
        (entry) => entry.id === pickClub(target, { turf }),
      );
      const range = swingSpeedRange(picked);
      let nearest = Infinity;
      for (let speed = range.MIN; speed <= range.MAX; speed += 1) {
        nearest = Math.min(nearest, nearestPass(picked.id, target, speed));
      }
      expect(nearest).toBeLessThan(1.6);
    },
  );

  test("height decides between clubs at the same distance out", () => {
    // 100 yd out: a wedge is nearly down, a driver is still climbing.
    const low = pickClub(air(100, 6), { turf });
    const high = pickClub(air(100, 22), { turf });
    expect(low).not.toBe(high);
    const loft = (id) => CLUBS.find((club) => club.id === id).loftDegrees;
    expect(loft(low)).toBeGreaterThan(loft(high));
  });

  test("it is not the club that would land there", () => {
    const target = air(150, 25);
    expect(pickClub(target, { turf })).not.toBe(
      pickClub(ground(150), { turf }),
    );
  });

  test("of the clubs that can get there, the one nearest its stock swing wins", () => {
    // A harder swing with the 9 iron also reaches the top of the 7 iron's
    // stock flight; the 7 iron needs no change at all.
    const top = apex("7i");
    const target = air(top.z, top.y);
    const nineIron = CLUBS.find((club) => club.id === "9i");
    const { DEFAULT, MAX } = swingSpeedRange(nineIron);
    let reaches = false;
    for (let speed = DEFAULT + 1; speed <= MAX; speed += 1) {
      if (nearestPass("9i", target, speed) < 1) reaches = true;
    }
    expect(reaches).toBe(true);
    expect(pickClub(target, { turf })).toBe("7i");
  });

  test("a sphere beyond every flight gets the club that comes nearest: the driver", () => {
    expect(pickClub(air(420, 10), { turf })).toBe("driver");
  });

  test("a sphere above every flight gets the club that comes nearest: the lob wedge", () => {
    expect(pickClub(air(25, 60), { turf })).toBe("lw");
  });

  test("a club's distance set in Settings is the swing it is judged from", () => {
    const sevenIron = CLUBS.find((club) => club.id === "7i");
    const fast = swingSpeedRange(sevenIron).MAX;
    const stockTop = apex("7i");
    const fastTop = apex("7i", fast);
    const speeds = { "7i": fast };
    expect(pickClub(air(fastTop.z, fastTop.y), { turf, speeds })).toBe("7i");
    expect(pickClub(air(stockTop.z, stockTop.y), { turf, speeds })).not.toBe(
      "7i",
    );
  });
});

describe("bagReach", () => {
  test("starts where the shortest club's stock shot stops", () => {
    const { nearest, farthest } = bagReach({ turf });
    expect(nearest).toBeCloseTo(rest(CLUBS.find((c) => c.id === "lw")), 5);
    expect(farthest).toBeUndefined();
  });
});
