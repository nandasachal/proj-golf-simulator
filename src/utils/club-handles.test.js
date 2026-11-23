import {
  GAIN,
  BALL,
  REACH,
  shownAngles,
  topHandles,
  sideHandles,
  fromGround,
  fromSide,
  snap,
  clubGeometry,
  facePivot,
} from "./club-handles";
import { CLUBS, getClub } from "../simulate/clubs";
import { AIM_VALUES, CLUB_FACE_ANGLE_VALUES, STRIKE_VALUES } from "./constant";

const values = (overrides = {}) => ({
  clubFaceAngle: 0,
  clubPathAngle: 0,
  aim: 0,
  attackAngle: 0,
  loftChange: 0,
  strike: 0,
  ...overrides,
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("shownAngles", () => {
  test("draws each angle at its real size, relative to where the golfer is aimed", () => {
    const shown = shownAngles(
      values({
        clubFaceAngle: 2,
        clubPathAngle: -3,
        aim: 4,
        attackAngle: 1,
        loftChange: 2,
        strike: 0.5,
      }),
      1,
      { standardLoft: 14, start: 1.25 },
    );
    expect(shown.aimDegrees).toBe(4);
    expect(shown.faceDegrees).toBe(6);
    expect(shown.pathDegrees).toBe(1);
    expect(shown.startDegrees).toBeCloseTo(5.25);
    expect(shown.attackDegrees).toBe(1);
    expect(shown.loftDegrees).toBe(16);
    expect(shown.strikeCm).toBeCloseTo(1.27);
  });

  test("a left-hander's open face and in-to-out path point left; aim does not flip", () => {
    const shown = shownAngles(
      values({ clubFaceAngle: 2, clubPathAngle: 3, aim: 4 }),
      -1,
    );
    expect(shown.aimDegrees).toBe(4);
    expect(shown.faceDegrees).toBe(2);
    expect(shown.pathDegrees).toBe(1);
  });
});

describe("handles seen from above", () => {
  test("square and straight: aim and face ahead of the ball on the centre line, path behind it", () => {
    const handles = topHandles(shownAngles(values(), 1), 1);
    expect(handles.aim.x).toBeCloseTo(0);
    expect(handles.aim.z).toBeCloseTo(REACH.aim);
    expect(handles.clubFaceAngle.z).toBeCloseTo(REACH.face);
    expect(handles.clubPathAngle.x).toBeCloseTo(0);
    expect(handles.clubPathAngle.z).toBeCloseTo(-REACH.path);
    // the head sits behind the ball, centred on it
    expect(handles.strike.x).toBeCloseTo(0);
    expect(handles.strike.z).toBeLessThan(-BALL.radius);
  });

  test("an open face points right (-x) for a right-hander and left for a left-hander", () => {
    const right = topHandles(shownAngles(values({ clubFaceAngle: 3 }), 1), 1);
    const left = topHandles(shownAngles(values({ clubFaceAngle: 3 }), -1), -1);
    expect(right.clubFaceAngle.x).toBeLessThan(0);
    expect(left.clubFaceAngle.x).toBeGreaterThan(0);
  });

  test("an in-to-out path has its tail on the golfer's side", () => {
    // a right-hander stands on +x
    const tail = topHandles(
      shownAngles(values({ clubPathAngle: 4 }), 1),
      1,
    ).clubPathAngle;
    expect(tail.x).toBeGreaterThan(0);
    expect(tail.z).toBeLessThan(0);
  });

  test("a toe strike slides the head toward the golfer", () => {
    const right = topHandles(shownAngles(values({ strike: 1 }), 1), 1).strike;
    const left = topHandles(shownAngles(values({ strike: 1 }), -1), -1).strike;
    expect(right.x).toBeGreaterThan(2);
    expect(left.x).toBeLessThan(-2);
  });

  test("at true size one degree still moves a handle half a centimetre", () => {
    const at = (overrides) => topHandles(shownAngles(values(overrides), 1), 1);
    expect(
      distance(at({}).clubFaceAngle, at({ clubFaceAngle: 1 }).clubFaceAngle),
    ).toBeGreaterThan(0.5);
    expect(
      distance(at({}).clubPathAngle, at({ clubPathAngle: 1 }).clubPathAngle),
    ).toBeGreaterThan(0.5);
    expect(distance(at({}).aim, at({ aim: 1 }).aim)).toBeGreaterThan(0.5);
    expect(distance(at({}).strike, at({ strike: 0.25 }).strike)).toBeCloseTo(
      0.635,
    );
  });

  test("dragging a handle to where it is drawn gives back the same value, for every setup and either hand", () => {
    for (const mirror of [1, -1]) {
      for (const aim of [-10, 0, 7]) {
        for (const face of [-6, 0, 3]) {
          for (const path of [-4, 0, 6]) {
            for (const strike of [-1, 0, 0.75]) {
              const set = values({
                aim,
                clubFaceAngle: face,
                clubPathAngle: path,
                strike,
              });
              const shown = shownAngles(set, mirror);
              const handles = topHandles(shown, mirror);
              expect(fromGround.aim(handles.aim)).toBeCloseTo(aim, 6);
              expect(
                fromGround.clubFaceAngle(handles.clubFaceAngle, shown, mirror),
              ).toBeCloseTo(face, 6);
              expect(
                fromGround.clubPathAngle(handles.clubPathAngle, shown, mirror),
              ).toBeCloseTo(path, 6);
              expect(
                fromGround.strike(handles.strike, shown, mirror),
              ).toBeCloseTo(strike, 6);
            }
          }
        }
      }
    }
  });

  test("every handle stays within reach of the camera at the extremes", () => {
    for (const mirror of [1, -1]) {
      for (const aim of [-10, 10]) {
        for (const angle of [-6, 6]) {
          const handles = topHandles(
            shownAngles(
              values({
                aim,
                clubFaceAngle: angle,
                clubPathAngle: -angle,
                strike: 1,
              }),
              mirror,
            ),
            mirror,
          );
          for (const point of Object.values(handles)) {
            // the views are 54 cm across, centred 10 cm from the ball
            expect(Math.abs(point.x)).toBeLessThan(21);
            expect(Math.abs(point.z)).toBeLessThan(33);
          }
        }
      }
    }
  });
});

describe("handles seen from the toe", () => {
  const shown = (overrides, standardLoft = 14) =>
    shownAngles(values(overrides), 1, { standardLoft });

  test("level attack: the arrow's tail is straight behind the ball at ball height", () => {
    const tail = sideHandles(shown({})).attackAngle;
    expect(tail.y).toBeCloseTo(BALL.height);
    expect(tail.z).toBeCloseTo(-REACH.attack);
  });

  test("hitting up drops the tail, hitting down raises it", () => {
    const level = sideHandles(shown({})).attackAngle.y;
    expect(sideHandles(shown({ attackAngle: 5 })).attackAngle.y).toBeLessThan(
      level,
    );
    expect(
      sideHandles(shown({ attackAngle: -5 })).attackAngle.y,
    ).toBeGreaterThan(level);
  });

  test("more loft leans the face line back, away from the target", () => {
    const less = sideHandles(shown({ loftChange: -4 })).loftChange;
    const more = sideHandles(shown({ loftChange: 4 })).loftChange;
    expect(more.z).toBeLessThan(less.z);
    expect(less.y).toBeGreaterThan(BALL.height + 14);
  });

  test("the arriving arrow's tail stays above the turf even hitting up as far as it goes", () => {
    expect(sideHandles(shown({ attackAngle: 5 })).attackAngle.y).toBeLessThan(
      BALL.height,
    );
    // drawn four times as steep as it is, it does dip below ball height, but
    // not out of the bottom of the view
    expect(
      sideHandles(shown({ attackAngle: 5 })).attackAngle.y,
    ).toBeGreaterThan(-6);
  });

  test("dragging a handle to where it is drawn gives back the same value", () => {
    for (const standardLoft of [11.3, 14.1, 16.2]) {
      for (const loftChange of [-4, -1, 0, 3, 4]) {
        for (const attackAngle of [-5, -2, 0, 1, 5]) {
          const handles = sideHandles(
            shown({ loftChange, attackAngle }, standardLoft),
          );
          expect(fromSide.attackAngle(handles.attackAngle)).toBeCloseTo(
            attackAngle,
            6,
          );
          expect(
            fromSide.loftChange(handles.loftChange, { standardLoft }),
          ).toBeCloseTo(loftChange, 6);
        }
      }
    }
  });

  test("one degree is a real movement", () => {
    const a = sideHandles(shown({}));
    const b = sideHandles(shown({ attackAngle: 1, loftChange: 1 }));
    expect(distance(a.attackAngle, b.attackAngle)).toBeGreaterThan(0.45);
    expect(distance(a.loftChange, b.loftChange)).toBeGreaterThan(0.33);
  });
});

describe("handles for clubs played off the turf", () => {
  const shown = (clubId, overrides, standardLoft) =>
    shownAngles(values(overrides), 1, {
      standardLoft,
      club: getClub(clubId),
    });

  test("only the driver's ball is on a tee", () => {
    expect(clubGeometry(getClub("driver")).ballHeight).toBe(BALL.height);
    for (const club of CLUBS.filter((entry) => !entry.teed)) {
      expect(clubGeometry(club).ballHeight).toBe(BALL.radius);
    }
  });

  test("the arriving arrow is level with a ball on the ground", () => {
    const tail = sideHandles(shown("7i", {}, 20)).attackAngle;
    expect(tail.y).toBeCloseTo(BALL.radius);
  });

  test("the face touches the ball lower down the more loft it has", () => {
    const flat = facePivot(12, BALL.radius);
    const lofted = facePivot(50, BALL.radius);
    expect(lofted.y).toBeLessThan(flat.y);
    expect(lofted.y).toBeGreaterThan(0);
    // always exactly one ball radius from the ball's centre
    for (const pivot of [flat, lofted]) {
      expect(Math.hypot(pivot.y - BALL.radius, pivot.z)).toBeCloseTo(
        BALL.radius,
      );
    }
  });

  test("dragging a handle to where it is drawn gives back the same value", () => {
    for (const [clubId, standardLoft] of [
      ["3w", 11.4],
      ["4h", 14.1],
      ["7i", 19.9],
      ["lw", 38.5],
    ]) {
      for (const loftChange of [-4, 0, 4]) {
        for (const attackAngle of [-8, -4, 0, 5]) {
          const angles = shown(
            clubId,
            { loftChange, attackAngle },
            standardLoft,
          );
          const handles = sideHandles(angles);
          expect(fromSide.attackAngle(handles.attackAngle, angles)).toBeCloseTo(
            attackAngle,
            6,
          );
          expect(
            fromSide.loftChange(handles.loftChange, {
              ...angles,
              standardLoft,
            }),
          ).toBeCloseTo(loftChange, 6);
        }
      }
    }
  });

  test("hitting up at a ball on the turf keeps the attack handle in the picture", () => {
    const angles = shown("lw", { attackAngle: 5 }, 38.5);
    const tail = sideHandles(angles).attackAngle;
    expect(tail.y).toBeGreaterThanOrEqual(-3.5 - 1e-9);
    expect(tail.z).toBeLessThan(-10);
    expect(fromSide.attackAngle(tail, angles)).toBeCloseTo(5, 6);
  });

  test("the head is grabbed on top of it, lower than a driver's crown", () => {
    const driver = topHandles(shown("driver", {}, 14), 1).strike;
    const iron = topHandles(shown("7i", {}, 20), 1).strike;
    expect(iron.y).toBeLessThan(driver.y);
    expect(iron.z).toBeGreaterThan(driver.z);
  });
});

describe("snap", () => {
  test("rounds to the step and clamps to the range", () => {
    expect(snap(2.4, CLUB_FACE_ANGLE_VALUES)).toBe(2);
    expect(snap(2.6, CLUB_FACE_ANGLE_VALUES)).toBe(3);
    expect(snap(40, CLUB_FACE_ANGLE_VALUES)).toBe(6);
    expect(snap(-40, AIM_VALUES)).toBe(-10);
    expect(snap(0.62, STRIKE_VALUES)).toBe(0.5);
    expect(snap(0.63, STRIKE_VALUES)).toBe(0.75);
    expect(snap(-3, STRIKE_VALUES)).toBe(-1);
  });

  test("never returns negative zero or NaN", () => {
    expect(Object.is(snap(-0.2, CLUB_FACE_ANGLE_VALUES), 0)).toBe(true);
    expect(snap(NaN, CLUB_FACE_ANGLE_VALUES)).toBe(0);
  });

  test("nothing is drawn bigger than life", () => {
    expect(Object.values(GAIN).every((gain) => gain === 1)).toBe(true);
  });
});
