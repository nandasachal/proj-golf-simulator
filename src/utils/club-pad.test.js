import {
  TOP,
  SIDE,
  aimHandle,
  faceHandle,
  pathHandle,
  headShift,
  aimFromPointer,
  faceFromPointer,
  pathFromPointer,
  strikeFromPointer,
  loftHandle,
  attackHandle,
  loftFromPointer,
  attackFromPointer,
  snap,
  toPadPoint,
} from "./club-pad";
import { AIM_VALUES, CLUB_FACE_ANGLE_VALUES, STRIKE_VALUES } from "./constant";

const setups = [];
for (const mirror of [1, -1]) {
  for (const aim of [-10, 0, 7]) {
    for (const face of [-6, 0, 3]) {
      for (const path of [-4, 0, 6]) {
        setups.push({ mirror, aim, face, path, strike: 0 });
      }
    }
  }
}

describe("top pad", () => {
  test("square and straight puts the handles on the centre line: aim and face above the ball, path below", () => {
    const setup = { face: 0, path: 0, aim: 0, mirror: 1 };
    expect(aimHandle(0)).toEqual({
      x: TOP.ball.x,
      y: TOP.ball.y - TOP.aimRadius,
    });
    expect(faceHandle(setup).x).toBeCloseTo(TOP.ball.x);
    expect(faceHandle(setup).y).toBeCloseTo(TOP.ball.y - TOP.faceRadius);
    expect(pathHandle(setup).x).toBeCloseTo(TOP.ball.x);
    expect(pathHandle(setup).y).toBeCloseTo(TOP.ball.y + TOP.pathRadius);
  });

  test("an open face points right for a right-hander and left for a left-hander", () => {
    const right = faceHandle({ face: 4, aim: 0, mirror: 1 });
    const left = faceHandle({ face: 4, aim: 0, mirror: -1 });
    expect(right.x).toBeGreaterThan(TOP.ball.x);
    expect(left.x).toBeLessThan(TOP.ball.x);
  });

  test("an in-to-out path has its tail on the golfer's side, so the arrow travels out to the right", () => {
    const tail = pathHandle({ path: 4, aim: 0, mirror: 1 });
    expect(tail.x).toBeLessThan(TOP.ball.x);
    expect(tail.y).toBeGreaterThan(TOP.ball.y);
  });

  test("dragging a handle to where it is drawn gives back the same value, for every setup", () => {
    for (const setup of setups) {
      expect(aimFromPointer(aimHandle(setup.aim))).toBeCloseTo(setup.aim, 6);
      expect(faceFromPointer(faceHandle(setup), setup)).toBeCloseTo(
        setup.face,
        6,
      );
      expect(pathFromPointer(pathHandle(setup), setup)).toBeCloseTo(
        setup.path,
        6,
      );
    }
  });

  test("one degree is a comfortable drag, not a pixel hunt", () => {
    const a = faceHandle({ face: 0, aim: 0, mirror: 1 });
    const b = faceHandle({ face: 1, aim: 0, mirror: 1 });
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(5);
    const p = pathHandle({ path: 0, aim: 0, mirror: 1 });
    const q = pathHandle({ path: 1, aim: 0, mirror: 1 });
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(5);
    const m = aimHandle(0);
    const n = aimHandle(1);
    expect(Math.hypot(n.x - m.x, n.y - m.y)).toBeGreaterThan(4);
  });

  test("every handle stays inside the pad at the extremes", () => {
    for (const mirror of [1, -1]) {
      for (const aim of [-10, 10]) {
        for (const angle of [-6, 6]) {
          const setup = { face: angle, path: -angle, aim, mirror };
          for (const point of [
            aimHandle(aim),
            faceHandle(setup),
            pathHandle(setup),
          ]) {
            expect(point.x).toBeGreaterThan(10);
            expect(point.x).toBeLessThan(TOP.width - 10);
            expect(point.y).toBeGreaterThan(8);
            expect(point.y).toBeLessThan(TOP.height - 8);
          }
        }
      }
    }
  });

  test("a toe strike slides the head toward the golfer", () => {
    expect(headShift({ strike: 0.5, mirror: 1 })).toBeLessThan(0);
    expect(headShift({ strike: 0.5, mirror: -1 })).toBeGreaterThan(0);
    expect(headShift({ strike: 0, mirror: 1 })).toBeCloseTo(0);
  });

  test("dragging the head along the face reads back as the same strike, even with the face turned", () => {
    for (const mirror of [1, -1]) {
      for (const strike of [-1, -0.25, 0, 0.5, 1]) {
        for (const face of [-6, 0, 6]) {
          const setup = { face, aim: 5, mirror, strike };
          const turn =
            ((5 * TOP.aimPerDegree + mirror * face * TOP.anglePerDegree) *
              Math.PI) /
            180;
          const shift = headShift(setup);
          // the head's centre: `shift` along the face, a little behind the ball
          const point = {
            x: TOP.ball.x + shift * Math.cos(turn) - 26 * Math.sin(turn),
            y: TOP.ball.y + shift * Math.sin(turn) + 26 * Math.cos(turn),
          };
          expect(strikeFromPointer(point, setup)).toBeCloseTo(strike, 6);
        }
      }
    }
  });
});

describe("side pad", () => {
  test("more loft leans the face back, away from the target", () => {
    const less = loftHandle({ loft: 10, mirror: 1 });
    const more = loftHandle({ loft: 18, mirror: 1 });
    expect(more.x).toBeLessThan(less.x);
    // and the other way for a left-hander, whose target is on the left
    expect(loftHandle({ loft: 18, mirror: -1 }).x).toBeGreaterThan(
      loftHandle({ loft: 10, mirror: -1 }).x,
    );
  });

  test("hitting up drops the tail of the arriving arrow, hitting down raises it", () => {
    const level = attackHandle({ attack: 0, mirror: 1 });
    expect(attackHandle({ attack: 5, mirror: 1 }).y).toBeGreaterThan(level.y);
    expect(attackHandle({ attack: -5, mirror: 1 }).y).toBeLessThan(level.y);
  });

  test("dragging a handle to where it is drawn gives back the same value", () => {
    for (const mirror of [1, -1]) {
      for (const loft of [7.3, 12, 14.1, 20.2]) {
        expect(
          loftFromPointer(loftHandle({ loft, mirror }), { mirror }),
        ).toBeCloseTo(loft, 6);
      }
      for (const attack of [-5, -1, 0, 3, 5]) {
        expect(
          attackFromPointer(attackHandle({ attack, mirror }), { mirror }),
        ).toBeCloseTo(attack, 6);
      }
    }
  });

  test("handles stay inside the pad and above the ground at the extremes", () => {
    for (const mirror of [1, -1]) {
      for (const point of [
        loftHandle({ loft: 7, mirror }),
        loftHandle({ loft: 21, mirror }),
        attackHandle({ attack: -5, mirror }),
        attackHandle({ attack: 5, mirror }),
      ]) {
        expect(point.x).toBeGreaterThan(10);
        expect(point.x).toBeLessThan(SIDE.width - 10);
        expect(point.y).toBeGreaterThan(8);
        expect(point.y).toBeLessThan(SIDE.height - 6);
      }
    }
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
});

describe("toPadPoint", () => {
  test("scales a screen position into pad units whatever size the pad is drawn", () => {
    const rect = { left: 100, top: 50, width: 616, height: 480 };
    expect(toPadPoint({ clientX: 408, clientY: 290 }, rect, TOP)).toEqual({
      x: 154,
      y: 103,
    });
  });
});
