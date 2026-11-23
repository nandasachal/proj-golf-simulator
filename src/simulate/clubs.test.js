import { CLUBS, CATEGORIES, getClub, swingSpeedRange } from "./clubs";
import {
  clubLaunch,
  driverLaunch,
  launchConditions,
  standardAttackAngle,
} from "./launch-conditions";
import { carryLimits, speedForCarry, stockCarryYards } from "./club-distances";

describe("the bag", () => {
  test("covers woods, hybrids, irons and wedges, each with a loft", () => {
    for (const category of Object.keys(CATEGORIES)) {
      expect(CLUBS.some((club) => club.category === category)).toBe(true);
    }
    for (const club of CLUBS) {
      expect(club.loftDegrees).toBeGreaterThan(8);
      expect(club.loftDegrees).toBeLessThanOrEqual(60);
    }
    expect(new Set(CLUBS.map((club) => club.id)).size).toBe(CLUBS.length);
  });

  test("an unknown id falls back to the driver, the only teed club", () => {
    expect(getClub("putter").id).toBe("driver");
    expect(getClub(undefined).id).toBe("driver");
    expect(CLUBS.filter((club) => club.teed).map((club) => club.id)).toEqual([
      "driver",
    ]);
  });

  test("within a family more loft means a shorter, more upright club", () => {
    for (const category of ["wood", "hybrid", "iron", "wedge"]) {
      const family = CLUBS.filter((club) => club.category === category);
      for (let i = 1; i < family.length; i++) {
        expect(family[i].loftDegrees).toBeGreaterThan(
          family[i - 1].loftDegrees,
        );
        expect(family[i].lengthInches).toBeLessThan(family[i - 1].lengthInches);
        expect(family[i].lieDegrees).toBeGreaterThanOrEqual(
          family[i - 1].lieDegrees,
        );
      }
    }
  });

  test("the driver runs 40 to 140 mph, a full swing from 80; shorter clubs scale down", () => {
    expect(swingSpeedRange(getClub("driver"))).toEqual({
      MIN: 40,
      FULL_MIN: 80,
      MAX: 140,
      DEFAULT: 95,
      STEP: 1,
    });
    const seven = swingSpeedRange(getClub("7i"));
    expect(seven.DEFAULT).toBe(76);
    expect(seven.MIN).toBeLessThan(seven.DEFAULT);
    expect(seven.MAX).toBeGreaterThan(seven.DEFAULT);
  });
});

describe("club launch", () => {
  test("the driver is unchanged by the general model", () => {
    expect(clubLaunch(getClub("driver"), 105)).toEqual(driverLaunch(105));
    expect(driverLaunch(105).launchAngleDegrees).toBeCloseTo(12);
    expect(driverLaunch(105).curveSpinLoftDegrees).toBeCloseTo(12.5);
  });

  test("a standard delivery at tour speed gives the tour's numbers", () => {
    for (const club of CLUBS.filter((entry) => entry.id !== "driver")) {
      const launch = clubLaunch(club, club.tour.speed);
      expect(launch.launchAngleDegrees).toBeCloseTo(club.tour.launch);
      expect(launch.backspinRPM).toBeCloseTo(club.tour.spin);
      expect(launch.smashFactor).toBeCloseTo(club.tour.smash);
      expect(launch.spinLoftRatio).toBeCloseTo(1);
    }
  });

  test("clubs off the turf are hit down on; delivered loft is under the stamped loft", () => {
    for (const club of CLUBS.filter((entry) => !entry.teed)) {
      expect(standardAttackAngle(club)).toBeLessThan(0);
      expect(clubLaunch(club, club.tour.speed).dynamicLoftDegrees).toBeLessThan(
        club.loftDegrees,
      );
    }
  });

  test("hitting less down on an iron launches higher with less spin", () => {
    const seven = getClub("7i");
    const standard = clubLaunch(seven, 76);
    const shallow = clubLaunch(seven, 76, { attackAngle: -1 });
    expect(shallow.launchAngleDegrees).toBeGreaterThan(
      standard.launchAngleDegrees,
    );
    expect(shallow.backspinRPM).toBeLessThan(standard.backspinRPM);
  });

  test("the same face-to-path curves a wedge less than a driver", () => {
    const tilt = (club) =>
      Math.abs(
        launchConditions({
          faceAngle: 3,
          pathAngle: 0,
          swingSpeedMPH: 90,
          side: "Right",
          club,
        }).initSpinAngle,
      );
    expect(tilt("driver")).toBeGreaterThan(tilt("7i"));
    expect(tilt("7i")).toBeGreaterThan(tilt("lw"));
  });

  test("a toe strike moves a driver far more than an iron", () => {
    const start = (club) =>
      launchConditions({
        faceAngle: 0,
        pathAngle: 0,
        swingSpeedMPH: 90,
        side: "Right",
        club,
        strikeInches: 1,
      }).initHorizontalAngleDegrees;
    expect(start("driver")).toBeCloseTo(3.5);
    expect(start("7i")).toBeCloseTo(0.5);
  });
});

describe("stock carry distances", () => {
  // TrackMan PGA Tour average carries, yards.
  const TOUR_CARRY = {
    "3w": 243,
    "5w": 230,
    "3h": 225,
    "3i": 212,
    "4i": 203,
    "5i": 194,
    "6i": 183,
    "7i": 172,
    "8i": 160,
    "9i": 148,
    pw: 136,
  };

  test("tour swing speeds carry within 4% of the tour's averages", () => {
    for (const [id, yards] of Object.entries(TOUR_CARRY)) {
      const carry = stockCarryYards(id, getClub(id).tour.speed);
      expect(Math.abs(carry - yards) / yards).toBeLessThan(0.04);
    }
  });

  test("at the default speeds every club in a family carries less than the one before", () => {
    for (const category of ["wood", "hybrid", "iron", "wedge"]) {
      const carries = CLUBS.filter((club) => club.category === category).map(
        (club) => stockCarryYards(club.id, swingSpeedRange(club).DEFAULT),
      );
      for (let i = 1; i < carries.length; i++) {
        expect(carries[i]).toBeLessThan(carries[i - 1]);
      }
    }
  });

  test("speedForCarry finds the speed that carries a distance", () => {
    for (const id of ["driver", "5w", "4h", "7i", "sw"]) {
      const range = swingSpeedRange(getClub(id));
      const speed = range.DEFAULT + 6;
      const yards = stockCarryYards(id, speed);
      expect(speedForCarry(id, yards)).toBeCloseTo(speed, 1);
    }
  });

  test("a distance out of reach gives the nearest speed the club allows", () => {
    const range = swingSpeedRange(getClub("7i"));
    const limits = carryLimits("7i");
    // A stock distance is a full swing's: it stops short of the part swings.
    expect(speedForCarry("7i", 20)).toBe(range.FULL_MIN);
    expect(range.FULL_MIN).toBeGreaterThan(range.MIN);
    expect(speedForCarry("7i", 400)).toBe(range.MAX);
    expect(limits.min).toBeLessThan(limits.max);
  });
});
