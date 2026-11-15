import { SHORTCUTS, keyLabel, shortcutFor, shouldIgnoreKey } from "./shortcuts";

describe("shortcutFor", () => {
  test("maps each control's two keys to down and up, in either case", () => {
    expect(shortcutFor("q")).toEqual({
      action: "adjust",
      control: "clubFaceAngle",
      direction: -1,
    });
    expect(shortcutFor("E")).toEqual({
      action: "adjust",
      control: "clubFaceAngle",
      direction: 1,
    });
    expect(shortcutFor("a").control).toBe("clubPathAngle");
    expect(shortcutFor("d").direction).toBe(1);
    expect(shortcutFor("s")).toMatchObject({
      control: "swingSpeed",
      direction: -1,
    });
    expect(shortcutFor("w")).toMatchObject({
      control: "swingSpeed",
      direction: 1,
    });
    expect(shortcutFor("z")).toMatchObject({ control: "aim", direction: -1 });
    expect(shortcutFor("c")).toMatchObject({ control: "aim", direction: 1 });
  });

  test("space hits and R resets; other keys do nothing", () => {
    expect(shortcutFor(" ")).toEqual({ action: "hit" });
    expect(shortcutFor("r")).toEqual({ action: "reset" });
    expect(shortcutFor("x")).toBeNull();
    expect(shortcutFor("ArrowLeft")).toBeNull();
    expect(shortcutFor("Enter")).toBeNull();
  });

  test("no key is assigned twice", () => {
    const keys = [
      SHORTCUTS.hit,
      SHORTCUTS.reset,
      ...["clubFaceAngle", "clubPathAngle", "swingSpeed", "aim"].flatMap(
        (control) => [SHORTCUTS[control].down, SHORTCUTS[control].up],
      ),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("labels keys for display", () => {
    expect(keyLabel(" ")).toBe("Space");
    expect(keyLabel("q")).toBe("Q");
  });
});

describe("shouldIgnoreKey", () => {
  const press = (key, tagName, extra = {}) => ({
    key,
    target: { tagName, type: extra.type },
    ...extra,
  });

  test("ignores typing in fields and modifier combos", () => {
    expect(shouldIgnoreKey(press("q", "SELECT"))).toBe(true);
    expect(shouldIgnoreKey(press("q", "TEXTAREA"))).toBe(true);
    expect(shouldIgnoreKey(press("q", "INPUT", { type: "text" }))).toBe(true);
    expect(shouldIgnoreKey(press("r", "BODY", { metaKey: true }))).toBe(true);
    expect(shouldIgnoreKey(press("s", "BODY", { ctrlKey: true }))).toBe(true);
  });

  test("still works with a slider focused or nothing focused", () => {
    expect(shouldIgnoreKey(press("q", "INPUT", { type: "range" }))).toBe(false);
    expect(shouldIgnoreKey(press("q", "BODY"))).toBe(false);
    expect(shouldIgnoreKey(press("q", "BUTTON"))).toBe(false);
  });

  test("space on a focused button is left to click that button", () => {
    expect(shouldIgnoreKey(press(" ", "BUTTON"))).toBe(true);
    expect(shouldIgnoreKey(press(" ", "BODY"))).toBe(false);
  });
});
