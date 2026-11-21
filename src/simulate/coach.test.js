import { coachMiss } from "./coach";

const square = { clubFaceAngle: 0, clubPathAngle: 0 };

describe("coachMiss on a ground target", () => {
  test("long and short are about swing speed", () => {
    expect(coachMiss({ longYards: 20, rightYards: 3 }, square)).toEqual({
      tip: "slower",
      text: "20 yd long: try less swing speed.",
    });
    expect(coachMiss({ longYards: -15, rightYards: -4 }, square).tip).toBe(
      "faster",
    );
  });

  test("a miss started off line asks for a different face", () => {
    const right = coachMiss(
      { longYards: 2, rightYards: 12 },
      { clubFaceAngle: 3, clubPathAngle: 3 },
    );
    expect(right).toEqual({
      tip: "start",
      text: "12 yd right: the club face pointed right. Try less club face.",
    });
    const left = coachMiss(
      { longYards: 2, rightYards: -9 },
      { clubFaceAngle: -2, clubPathAngle: -2 },
    );
    expect(left.text).toBe(
      "9 yd left: the club face pointed left. Try more club face.",
    );
  });

  test("a miss that curved that way blames face to path", () => {
    // open face to the path: a fade/slice for a right-hander
    const slice = coachMiss(
      { longYards: -1, rightYards: 18 },
      { clubFaceAngle: 2, clubPathAngle: -2 },
    );
    expect(slice).toEqual({
      tip: "curve",
      text: "18 yd right: it curved right because the club face was open to the path. Try less club face or more club path.",
    });
    const hook = coachMiss(
      { longYards: 0, rightYards: -14 },
      { clubFaceAngle: -1, clubPathAngle: 3 },
    );
    expect(hook.tip).toBe("curve");
    expect(hook.text).toMatch(/closed to the path\. Try more club face/);
  });

  test("a small face-to-path is not blamed", () => {
    const tip = coachMiss(
      { longYards: 0, rightYards: 8 },
      { clubFaceAngle: 1.5, clubPathAngle: 1 },
    );
    expect(tip.tip).toBe("start");
  });

  test("a left-hander gets the mirrored advice", () => {
    // A left-hander's open face points left, so a left miss asks for less face.
    const tip = coachMiss(
      { longYards: 0, rightYards: -10 },
      { clubFaceAngle: 2, clubPathAngle: 2 },
      "Left",
    );
    expect(tip.text).toBe(
      "10 yd left: the club face pointed left. Try less club face.",
    );
    const curve = coachMiss(
      { longYards: 0, rightYards: -10 },
      { clubFaceAngle: 2, clubPathAngle: -2 },
      "Left",
    );
    expect(curve.text).toMatch(/open to the path/);
  });
});

describe("coachMiss on an air target", () => {
  test("falling short asks for more speed", () => {
    expect(coachMiss({ air: true, shortYards: 30.4 }, square)).toEqual({
      tip: "faster",
      text: "Fell 30 yd short: try more swing speed.",
    });
  });

  test("over and under are about loft", () => {
    expect(
      coachMiss({ air: true, highYards: 6, rightYards: 1 }, square).tip,
    ).toBe("less_loft");
    expect(
      coachMiss({ air: true, highYards: -5, rightYards: 2 }, square).tip,
    ).toBe("more_loft");
  });

  test("a wide miss is about the face", () => {
    expect(
      coachMiss({ air: true, highYards: 1, rightYards: 7 }, square).tip,
    ).toBe("start");
  });
});
