import {
  FIRST_CONTROL,
  GRID,
  keyAction,
  moveSelection,
  neutralOf,
  shouldIgnoreKey,
  stateOf,
  stepState,
} from "./shortcuts";

const key = (name, extra = {}) => ({ key: name, ...extra });
const ANGLE = { MIN: -6, MAX: 6, DEFAULT: 0, STEP: 1 };
const STRIKE = { MIN: -1, MAX: 1, DEFAULT: 0, STEP: 0.25 };
const SPEED = { MIN: 64, MAX: 112, DEFAULT: 76, STEP: 1 };
const ATTACK = { MIN: -8, MAX: 5, DEFAULT: -4, STEP: 1 };

describe("moveSelection", () => {
  test("left and right move along the strip; up and down stay put", () => {
    expect(FIRST_CONTROL).toBe("clubFaceAngle");
    expect(moveSelection("clubFaceAngle", "ArrowRight")).toBe("clubPathAngle");
    expect(moveSelection("clubPathAngle", "ArrowLeft")).toBe("clubFaceAngle");
    expect(moveSelection("aim", "ArrowRight")).toBe("attackAngle");
    expect(moveSelection("loftChange", "ArrowRight")).toBe("swingSpeed");
    expect(moveSelection("aim", "ArrowDown")).toBe("aim");
    expect(moveSelection("aim", "ArrowUp")).toBe("aim");
    // a normal game's three: face, path, speed
    const basic = ["clubFaceAngle", "clubPathAngle", "swingSpeed"];
    expect(moveSelection("clubPathAngle", "ArrowRight", basic)).toBe(
      "swingSpeed",
    );
  });

  test("it stops at the edges rather than wrapping", () => {
    expect(moveSelection("clubFaceAngle", "ArrowLeft")).toBe("clubFaceAngle");
    expect(moveSelection("clubFaceAngle", "ArrowUp")).toBe("clubFaceAngle");
    expect(moveSelection("clubFaceAngle", "ArrowDown")).toBe("clubFaceAngle");
    expect(moveSelection("swingSpeed", "ArrowDown")).toBe("swingSpeed");
    expect(moveSelection("swingSpeed", "ArrowRight")).toBe("swingSpeed");
  });

  test("every box can be reached from the first", () => {
    const reached = new Set([FIRST_CONTROL]);
    for (let pass = 0; pass < 6; pass++) {
      for (const control of [...reached]) {
        for (const arrow of [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ]) {
          reached.add(moveSelection(control, arrow));
        }
      }
    }
    expect(reached).toEqual(new Set(GRID.flat()));
  });

  test("an unknown box or key is harmless", () => {
    expect(moveSelection("nonsense", "ArrowDown")).toBe(FIRST_CONTROL);
    expect(moveSelection("aim", "x")).toBe("aim");
  });
});

describe("keyAction", () => {
  test("plain arrows move, Command arrows change the selected box", () => {
    expect(keyAction(key("ArrowDown"))).toEqual({
      action: "move",
      key: "ArrowDown",
    });
    expect(keyAction(key("ArrowLeft", { metaKey: true }))).toEqual({
      action: "adjust",
      direction: -1,
    });
    expect(keyAction(key("ArrowRight", { metaKey: true }))).toEqual({
      action: "adjust",
      direction: 1,
    });
    expect(keyAction(key("ArrowUp", { metaKey: true }))).toEqual({
      action: "state",
      direction: 1,
    });
    expect(keyAction(key("ArrowDown", { metaKey: true }))).toEqual({
      action: "state",
      direction: -1,
    });
  });

  test("Ctrl stands in for Command", () => {
    expect(keyAction(key("ArrowRight", { ctrlKey: true }))).toEqual({
      action: "adjust",
      direction: 1,
    });
  });

  test("space hits; letters do nothing any more", () => {
    expect(keyAction(key(" "))).toEqual({ action: "hit" });
    for (const letter of ["q", "e", "a", "d", "s", "w", "r", "R", "Enter"]) {
      expect(keyAction(key(letter))).toBeNull();
    }
    expect(keyAction(key("ArrowLeft", { altKey: true }))).toBeNull();
    expect(keyAction(key(" ", { metaKey: true }))).toBeNull();
  });
});

describe("the word a value reads as", () => {
  test("neutral is zero, except swing speed, where it is the club's stock speed", () => {
    expect(neutralOf("clubFaceAngle", ANGLE)).toBe(0);
    expect(neutralOf("attackAngle", ATTACK)).toBe(0);
    expect(neutralOf("swingSpeed", SPEED)).toBe(76);
  });

  test("a value is below, at or above neutral", () => {
    expect(stateOf("clubFaceAngle", -3, ANGLE)).toBe(-1);
    expect(stateOf("clubFaceAngle", 0, ANGLE)).toBe(0);
    expect(stateOf("clubFaceAngle", 2, ANGLE)).toBe(1);
    expect(stateOf("swingSpeed", 76, SPEED)).toBe(0);
    expect(stateOf("swingSpeed", 90, SPEED)).toBe(1);
    expect(stateOf("attackAngle", -4, ATTACK)).toBe(-1);
  });

  test("stepping the word goes side → neutral → one step into the other side", () => {
    expect(stepState("clubFaceAngle", 4, -1, ANGLE)).toBe(0);
    expect(stepState("clubFaceAngle", 0, -1, ANGLE)).toBe(-1);
    expect(stepState("clubFaceAngle", -5, 1, ANGLE)).toBe(0);
    expect(stepState("clubFaceAngle", 0, 1, ANGLE)).toBe(1);
    expect(stepState("strike", 0, 1, STRIKE)).toBe(0.25);
    expect(stepState("swingSpeed", 100, -1, SPEED)).toBe(76);
    expect(stepState("swingSpeed", 76, -1, SPEED)).toBe(75);
    // an iron's "down" steps to level, then to up
    expect(stepState("attackAngle", -4, 1, ATTACK)).toBe(0);
    expect(stepState("attackAngle", 0, 1, ATTACK)).toBe(1);
  });

  test("it does nothing once it is as far as the word goes", () => {
    expect(stepState("clubFaceAngle", 3, 1, ANGLE)).toBe(3);
    expect(stepState("clubFaceAngle", -2, -1, ANGLE)).toBe(-2);
  });
});

describe("shouldIgnoreKey", () => {
  const press = (name, tagName, extra = {}) => ({
    key: name,
    target: { tagName, type: extra.type },
    ...extra,
  });

  test("ignores typing in fields", () => {
    expect(shouldIgnoreKey(press("ArrowLeft", "SELECT"))).toBe(true);
    expect(shouldIgnoreKey(press("ArrowLeft", "TEXTAREA"))).toBe(true);
    expect(
      shouldIgnoreKey(press("ArrowLeft", "INPUT", { type: "number" })),
    ).toBe(true);
  });

  test("works with a slider, a button or nothing focused, with Command held", () => {
    expect(
      shouldIgnoreKey(press("ArrowLeft", "INPUT", { type: "range" })),
    ).toBe(false);
    expect(shouldIgnoreKey(press("ArrowLeft", "BODY"))).toBe(false);
    expect(
      shouldIgnoreKey(press("ArrowLeft", "BUTTON", { metaKey: true })),
    ).toBe(false);
  });

  test("space hits from a button, a link, a menu or a slider; not while typing", () => {
    expect(shouldIgnoreKey(press(" ", "BUTTON"))).toBe(false);
    expect(shouldIgnoreKey(press(" ", "A"))).toBe(false);
    expect(shouldIgnoreKey(press(" ", "SELECT"))).toBe(false);
    expect(shouldIgnoreKey(press(" ", "INPUT", { type: "range" }))).toBe(false);
    expect(shouldIgnoreKey(press(" ", "BODY"))).toBe(false);
    expect(shouldIgnoreKey(press(" ", "INPUT", { type: "text" }))).toBe(true);
    expect(shouldIgnoreKey(press(" ", "TEXTAREA"))).toBe(true);
  });
});

describe("moveSelection among the controls a normal game shows", () => {
  const { controlsFor } = require("./shortcuts");
  const basic = controlsFor("normal");

  test("normal shows face, path and speed; the others show all seven", () => {
    expect(basic).toEqual(["clubFaceAngle", "clubPathAngle", "swingSpeed"]);
    expect(controlsFor("advanced")).toHaveLength(7);
    expect(controlsFor("practice")).toHaveLength(7);
  });

  test("right from path goes straight to speed, and back", () => {
    expect(moveSelection("clubPathAngle", "ArrowRight", basic)).toBe(
      "swingSpeed",
    );
    expect(moveSelection("swingSpeed", "ArrowLeft", basic)).toBe(
      "clubPathAngle",
    );
  });

  test("a hidden box moves onto the first shown one", () => {
    expect(moveSelection("aim", "ArrowDown", basic)).toBe("clubFaceAngle");
  });
});
