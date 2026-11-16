import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";
import { createSimulator } from "./simulate/main";
import { createClubScene } from "./simulate/club-scene";
import { TURF_PRESETS } from "./simulate/ground";

// jsdom has no WebGL, so the 3D scene can't start under Jest; the fake stands
// in for it and records what the UI asks it to do.
jest.mock("./simulate/main", () => ({ createSimulator: jest.fn() }));
jest.mock("./simulate/club-scene", () => ({ createClubScene: jest.fn() }));

let simulator;
let callbacks;
// The two 3D club views, faked: a flat camera straight above the ball and
// one straight side-on, so a screen position maps to the scene by simple
// scaling and drags can be tested without WebGL.
let clubScenes;
const ABOVE = { x: 154, y: 110, pixelsPerCm: 4 };
const TOE = { x: 150, y: 100, pixelsPerCm: 3 };
const fakeClubScene = (options) => {
  const fromToe = Boolean(options.loftLever);
  const scene = {
    options,
    update: jest.fn(),
    dispose: jest.fn(),
    size: () => ({ width: 308, height: fromToe ? 124 : 206 }),
    // A left-hander is watched from the other side, so the target is on the
    // other side of the picture.
    facing: () => scene.update.mock.calls.at(-1)?.[0].mirror ?? 1,
    project: (point) =>
      fromToe
        ? {
            x: TOE.x + scene.facing() * point.z * TOE.pixelsPerCm,
            y: TOE.y - point.y * TOE.pixelsPerCm,
          }
        : {
            x: ABOVE.x - point.x * ABOVE.pixelsPerCm,
            y: ABOVE.y - point.z * ABOVE.pixelsPerCm,
          },
    pick: (clientX, clientY, { height = 0 } = {}) =>
      fromToe
        ? {
            x: 0,
            y: (TOE.y - clientY) / TOE.pixelsPerCm,
            z: (scene.facing() * (clientX - TOE.x)) / TOE.pixelsPerCm,
          }
        : {
            x: (ABOVE.x - clientX) / ABOVE.pixelsPerCm,
            y: height,
            z: (ABOVE.y - clientY) / ABOVE.pixelsPerCm,
          },
  };
  clubScenes[fromToe ? "toe" : "above"] = scene;
  return scene;
};

beforeEach(() => {
  simulator = {
    hit: jest.fn(),
    setSide: jest.fn(),
    setAim: jest.fn(),
    setTarget: jest.fn(),
    setViewInset: jest.fn(),
    dispose: jest.fn(),
  };
  clubScenes = {};
  createClubScene.mockReset();
  createClubScene.mockImplementation((_container, options) =>
    fakeClubScene(options),
  );
  createSimulator.mockReset();
  createSimulator.mockImplementation((_container, simCallbacks) => {
    callbacks = simCallbacks;
    return simulator;
  });
});

// Shows what the address bar's query string would be.
const Address = () => (
  <output data-testid="address">{useLocation().search}</output>
);
const address = () => screen.getByTestId("address").textContent;

const renderApp = (url = "/") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
      <Address />
    </MemoryRouter>,
  );

const hit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^hit$/i }));
const lastHit = () => simulator.hit.mock.calls.at(-1);
const lastLaunch = () => lastHit()[0];
const lastTurf = () => lastHit()[2];
const press = (key, options = {}) =>
  fireEvent.keyDown(document.body, { key, ...options });
const openSettings = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return within(screen.getByRole("dialog"));
};
// Each shot control is a slider handle on a club pad and a value you can
// click to type over.
const valueOf = (name) =>
  Number(
    screen
      .getByRole("slider", { name, hidden: true })
      .getAttribute("aria-valuenow"),
  );
const textOf = (name) =>
  screen.getByRole("slider", { name }).getAttribute("aria-valuetext");
const startTyping = (name) => {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^Edit ${name}:`, "i") }),
  );
  return screen.getByRole("spinbutton", { name });
};
const typeValue = (name, value, key = "Enter") => {
  const input = startTyping(name);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key });
};
const result = () => screen.getByRole("status", { name: "Shot result" });

describe("shot controls", () => {
  test("the panel holds the shot controls and nothing about the session", () => {
    renderApp();
    expect(screen.queryByText(/golf simulator/i)).not.toBeInTheDocument();
    expect(valueOf("Club face")).toBe(0);
    expect(valueOf("Club path")).toBe(0);
    expect(valueOf("Swing speed")).toBe(95);
    expect(valueOf("Aim")).toBe(0);
    expect(valueOf("Attack angle")).toBe(0);
    expect(valueOf("Loft")).toBe(0);
    expect(valueOf("Strike")).toBe(0);

    // session settings are behind the overflow menu, not on the panel
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Firm" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /left-handed/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Game mode" }),
    ).not.toBeInTheDocument();
  });

  test("a changed control is used by the very next hit", () => {
    renderApp();
    hit();
    expect(lastLaunch()).toMatchObject({ initSpeedMPH: 95 });
    expect(lastLaunch().initHorizontalAngleDegrees).toBeCloseTo(0);
    expect(lastLaunch().initSpinAngle).toBeCloseTo(0);
    expect(lastHit()[3]).toBe(0);

    typeValue("Club face", "4");
    typeValue("Club path", "-2");
    typeValue("Swing speed", "120");
    typeValue("Aim", "-5");
    expect(screen.getAllByText("4° open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2° out-to-in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("120 mph").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5° left").length).toBeGreaterThan(0);

    hit();
    const launch = lastLaunch();
    expect(launch.initSpeedMPH).toBe(120);
    // Open face, out-to-in path: starts right (positive) and curves right
    // (negative spin angle) for a right-hander.
    expect(launch.initHorizontalAngleDegrees).toBeGreaterThan(2);
    expect(launch.initSpinAngle).toBeLessThan(-10);
    expect(lastHit()[1]).toBe("Right");
    expect(lastHit()[3]).toBe(-5);
  });

  test("shot setup is read from the URL, and junk values fall back into range", () => {
    renderApp("/?face=-3&path=5&speed=110&aim=4");
    expect(valueOf("Club face")).toBe(-3);
    expect(valueOf("Club path")).toBe(5);
    expect(valueOf("Swing speed")).toBe(110);
    expect(valueOf("Aim")).toBe(4);
  });

  test("out-of-range or junk URL values are clamped", () => {
    renderApp("/?face=abc&path=40&speed=500&aim=-90&side=Banana");
    expect(valueOf("Club face")).toBe(0);
    expect(valueOf("Club path")).toBe(6);
    expect(valueOf("Swing speed")).toBe(140);
    expect(valueOf("Aim")).toBe(-10);
    hit();
    expect(lastLaunch().initSpeedMPH).toBe(140);
    expect(lastHit()[1]).toBe("Right");
  });

  test("attack angle and loft change the launch of the next hit", () => {
    renderApp("/?speed=105");
    hit();
    const level = lastLaunch();
    expect(screen.getAllByText("level").length).toBeGreaterThan(0);
    expect(screen.getByText("14.1°")).toBeInTheDocument();

    typeValue("Attack angle", "5");
    expect(screen.getAllByText("5° up").length).toBeGreaterThan(0);
    hit();
    const up = lastLaunch();
    expect(up.initVerticalAngleDegrees).toBeGreaterThan(
      level.initVerticalAngleDegrees,
    );
    expect(up.initBackspinRPM).toBeLessThan(level.initBackspinRPM);

    typeValue("Loft", "3");
    expect(screen.getByText("17.1° (+3)")).toBeInTheDocument();
    hit();
    expect(lastLaunch().initVerticalAngleDegrees).toBeGreaterThan(
      up.initVerticalAngleDegrees,
    );
    expect(lastLaunch().initBackspinRPM).toBeGreaterThan(up.initBackspinRPM);
  });

  test("attack and loft are read from the URL", () => {
    renderApp("/?attack=-3&loft=2");
    expect(valueOf("Attack angle")).toBe(-3);
    expect(valueOf("Loft")).toBe(2);
  });

  test("strike location is used by the next hit, shown in words, and read from the URL", () => {
    renderApp("/?speed=105");
    expect(screen.getByText("centre")).toBeInTheDocument();
    hit();
    const centre = lastLaunch();

    typeValue("Strike", "0.75");
    expect(screen.getByText("0.75 in toe")).toBeInTheDocument();
    hit();
    const toe = lastLaunch();
    expect(toe.smashFactor).toBeLessThan(centre.smashFactor);
    expect(toe.initHorizontalAngleDegrees).toBeGreaterThan(2);
    expect(toe.initSpinAngle).toBeGreaterThan(8);

    typeValue("Strike", "-0.5");
    expect(screen.getByText("0.5 in heel")).toBeInTheDocument();
  });

  test("strike is read from the URL and clamped", () => {
    renderApp("/?strike=0.75");
    expect(valueOf("Strike")).toBe(0.75);
  });

  test("a junk or out-of-range strike falls back into range", () => {
    renderApp("/?strike=9");
    expect(valueOf("Strike")).toBe(1);
  });

  test("aiming shows the stance in the scene before the shot", () => {
    renderApp();
    typeValue("Aim", "6");
    expect(simulator.setAim).toHaveBeenLastCalledWith(6);
  });

  test("Reset clears the shot but keeps the session settings", () => {
    renderApp(
      "/?face=3&path=-2&speed=120&aim=5&attack=4&loft=-2&strike=0.5&side=Left&turf=firm&mode=game",
    );
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(valueOf("Club face")).toBe(0);
    expect(valueOf("Club path")).toBe(0);
    expect(valueOf("Swing speed")).toBe(95);
    expect(valueOf("Aim")).toBe(0);
    expect(valueOf("Attack angle")).toBe(0);
    expect(valueOf("Loft")).toBe(0);
    expect(valueOf("Strike")).toBe(0);

    hit();
    expect(lastHit()[1]).toBe("Left");
    expect(lastTurf()).toMatchObject(TURF_PRESETS.firm);
    expect(screen.getByRole("status", { name: "Game" })).toBeInTheDocument();
  });
});

describe("keyboard shortcuts", () => {
  test("each control has a key to nudge it down and one to nudge it up", () => {
    renderApp();
    press("e");
    press("e");
    expect(valueOf("Club face")).toBe(2);
    press("q");
    expect(valueOf("Club face")).toBe(1);

    press("a");
    expect(valueOf("Club path")).toBe(-1);
    press("D");
    press("d");
    expect(valueOf("Club path")).toBe(1);

    press("w");
    expect(valueOf("Swing speed")).toBe(96);
    press("s");
    press("s");
    expect(valueOf("Swing speed")).toBe(94);

    press("c");
    expect(valueOf("Aim")).toBe(1);
    press("z");
    press("z");
    expect(valueOf("Aim")).toBe(-1);

    press("t");
    press("t");
    expect(valueOf("Attack angle")).toBe(2);
    press("g");
    expect(valueOf("Attack angle")).toBe(1);

    press("y");
    expect(valueOf("Loft")).toBe(1);
    press("h");
    press("h");
    expect(valueOf("Loft")).toBe(-1);

    press("n");
    press("n");
    expect(valueOf("Strike")).toBe(0.5);
    press("b");
    press("b");
    press("b");
    expect(valueOf("Strike")).toBe(-0.25);
  });

  test("key presses that arrive before the screen redraws all count", () => {
    renderApp("/?face=1");
    act(() => {
      for (let i = 0; i < 3; i++) {
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "e", bubbles: true }),
        );
      }
    });
    expect(valueOf("Club face")).toBe(4);
  });

  test("a control stops at the end of its range", () => {
    renderApp("/?face=6&speed=80");
    press("e");
    expect(valueOf("Club face")).toBe(6);
    press("s");
    expect(valueOf("Swing speed")).toBe(80);
  });

  test("Space hits with the current setup and R resets it", () => {
    renderApp();
    press("e");
    press(" ");
    expect(simulator.hit).toHaveBeenCalledTimes(1);
    expect(lastLaunch().initHorizontalAngleDegrees).toBeGreaterThan(0);

    press("r");
    expect(valueOf("Club face")).toBe(0);
  });

  test("shortcuts stand down for modifier combos and while Settings is open", () => {
    renderApp();
    press("r", { metaKey: true });
    press("e", { ctrlKey: true });
    expect(valueOf("Club face")).toBe(0);

    openSettings();
    press("e");
    press(" ");
    expect(valueOf("Club face")).toBe(0);
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("the keys are discoverable from the controls themselves", () => {
    renderApp();
    const hint = (name) =>
      screen
        .getByRole("button", { name: new RegExp(`^Edit ${name}:`, "i") })
        .getAttribute("data-tooltip-content");
    expect(hint("club face")).toBe("Click to type a value · keys Q / E");
    expect(hint("club path")).toBe("Click to type a value · keys A / D");
    expect(hint("swing speed")).toBe("Click to type a value · keys S / W");
    expect(hint("aim")).toBe("Click to type a value · keys Z / C");
    expect(hint("attack angle")).toBe("Click to type a value · keys G / T");
    expect(hint("loft")).toBe("Click to type a value · keys H / Y");
    expect(hint("strike")).toBe("Click to type a value · keys B / N");
    expect(screen.getByRole("button", { name: /^hit$/i })).toHaveAttribute(
      "data-tooltip-content",
      "Key: Space",
    );
    expect(screen.getByRole("button", { name: /reset/i })).toHaveAttribute(
      "data-tooltip-content",
      "Key: R",
    );
  });
});

describe("club pads", () => {
  const handle = (name) => screen.getByRole("slider", { name });

  const pointer = (type, target, x, y) =>
    fireEvent(
      target,
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
    );
  const centreOf = (name) => {
    const dot = handle(name).querySelector("circle");
    return [Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy"))];
  };

  test("dragging a handle follows the pointer, even off the handle and off the pad", () => {
    renderApp();
    const [x, y] = centreOf("Club face");
    pointer("pointerdown", handle("Club face"), x, y);
    // the pointer is now over the page, not the handle
    pointer("pointermove", window, x + 12, y);
    expect(valueOf("Club face")).toBeGreaterThan(0);
    pointer("pointermove", window, x + 400, y + 300);
    expect(valueOf("Club face")).toBe(6);

    pointer("pointerup", window, x + 400, y + 300);
    pointer("pointermove", window, x - 400, y);
    expect(valueOf("Club face")).toBe(6);
  });

  test("a press between two handles goes to the nearer one, not the one drawn on top", () => {
    renderApp();
    const [fx, fy] = centreOf("Club face");
    const [, ay] = centreOf("Aim");
    // inside the Aim handle's grab area, but closer to the face handle
    const y = fy + (ay - fy) * 0.3;
    pointer("pointerdown", handle("Aim"), fx, y);
    pointer("pointermove", window, fx + 14, y);
    expect(valueOf("Club face")).toBeGreaterThan(0);
    expect(valueOf("Aim")).toBe(0);
    pointer("pointerup", window, fx + 14, y);

    // and the other way: nearer Aim, pressed on the face handle
    const [fx2, fy2] = centreOf("Club face");
    const [ax2, ay2] = centreOf("Aim");
    pointer(
      "pointerdown",
      handle("Club face"),
      fx2 + (ax2 - fx2) * 0.8,
      fy2 + (ay2 - fy2) * 0.8,
    );
    pointer("pointermove", window, ax2 + 30, ay2);
    expect(valueOf("Aim")).toBeGreaterThan(0);
  });

  test("the address is not rewritten on every step, only once the control settles", () => {
    jest.useFakeTimers();
    try {
      renderApp();
      for (let i = 0; i < 40; i++) press("w");
      for (let i = 0; i < 5; i++) press("e");
      expect(valueOf("Swing speed")).toBe(135);
      expect(valueOf("Club face")).toBe(5);
      expect(address()).toBe("");

      act(() => jest.advanceTimersByTime(300));
      expect(address()).toBe("?speed=135&face=5");
      expect(valueOf("Swing speed")).toBe(135);

      // a hit in that window still uses what is on screen
      press("q");
      press(" ");
      expect(lastLaunch().initSpeedMPH).toBe(135);
      expect(valueOf("Club face")).toBe(4);
    } finally {
      jest.useRealTimers();
    }
  });

  test("Reset straight after a change does not let the change come back", () => {
    jest.useFakeTimers();
    try {
      renderApp("/?face=2");
      press("e");
      press("r");
      act(() => jest.advanceTimersByTime(300));
      expect(valueOf("Club face")).toBe(0);
      expect(address()).toBe("");
    } finally {
      jest.useRealTimers();
    }
  });

  test("after typing with the keyboard, focus goes back to the value; clicking away leaves focus where the click put it", () => {
    renderApp();
    typeValue("Club face", "2");
    expect(
      screen.getByRole("button", { name: "Edit club face: 2° open" }),
    ).toHaveFocus();
    typeValue("Aim", "3", "Escape");
    expect(
      screen.getByRole("button", { name: "Edit aim: straight" }),
    ).toHaveFocus();

    const speed = startTyping("Swing speed");
    const other = screen.getByRole("button", { name: /^Edit club path:/ });
    other.focus();
    fireEvent.blur(speed);
    expect(valueOf("Swing speed")).toBe(95);
    expect(other).toHaveFocus();
  });

  test("every control is a handle that says its value in words", () => {
    renderApp("/?face=2&path=-3&speed=105&attack=1&loft=2&strike=-0.5&aim=4");
    expect(textOf("Club face")).toBe("2° open");
    expect(textOf("Club path")).toBe("3° out-to-in");
    expect(textOf("Swing speed")).toBe("105 mph");
    expect(textOf("Attack angle")).toBe("1° up");
    expect(textOf("Loft")).toBe("16.1° (+2)");
    expect(textOf("Strike")).toBe("0.5 in heel");
    expect(textOf("Aim")).toBe("4° right");
  });

  test("clicking a value turns it into a field; Enter keeps what was typed", () => {
    renderApp();
    const input = startTyping("Club face");
    expect(input).toHaveFocus();
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(valueOf("Club face")).toBe(4);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit club face: 4° open" }),
    ).toBeInTheDocument();
  });

  test("clicking away also keeps it, Escape throws it away", () => {
    renderApp();
    const speed = startTyping("Swing speed");
    fireEvent.change(speed, { target: { value: "121" } });
    fireEvent.blur(speed);
    expect(valueOf("Swing speed")).toBe(121);

    typeValue("Aim", "7", "Escape");
    expect(valueOf("Aim")).toBe(0);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  test("typed values are snapped to the step and held to the range; junk is ignored", () => {
    renderApp();
    typeValue("Club path", "-2.4");
    expect(valueOf("Club path")).toBe(-2);
    typeValue("Strike", "0.6");
    expect(valueOf("Strike")).toBe(0.5);
    typeValue("Loft", "99");
    expect(valueOf("Loft")).toBe(4);
    typeValue("Swing speed", "12");
    expect(valueOf("Swing speed")).toBe(80);
    typeValue("Club face", "");
    expect(valueOf("Club face")).toBe(0);
  });

  test("typing in a field does not set off the letter shortcuts or Hit", () => {
    renderApp();
    const input = startTyping("Club face");
    fireEvent.keyDown(input, { key: "e" });
    fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "r" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(valueOf("Club face")).toBe(0);
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("a focused handle moves with the arrow keys, jumps with Home and End, and resets on double-click", () => {
    renderApp();
    fireEvent.keyDown(handle("Club face"), { key: "ArrowRight" });
    fireEvent.keyDown(handle("Club face"), { key: "ArrowRight" });
    expect(valueOf("Club face")).toBe(2);
    fireEvent.keyDown(handle("Club face"), { key: "ArrowLeft" });
    expect(valueOf("Club face")).toBe(1);

    fireEvent.keyDown(handle("Aim"), { key: "End" });
    expect(valueOf("Aim")).toBe(10);
    fireEvent.keyDown(handle("Aim"), { key: "Home" });
    expect(valueOf("Aim")).toBe(-10);

    fireEvent.keyDown(handle("Strike"), { key: "ArrowRight" });
    expect(valueOf("Strike")).toBe(0.25);
    fireEvent.keyDown(handle("Swing speed"), { key: "ArrowUp" });
    expect(valueOf("Swing speed")).toBe(96);

    fireEvent.doubleClick(handle("Aim"));
    fireEvent.doubleClick(handle("Club face"));
    expect(valueOf("Aim")).toBe(0);
    expect(valueOf("Club face")).toBe(0);
  });

  test("names the shot shape for the current setup as it changes, and sketches the flight", () => {
    renderApp();
    const pads = screen.getByLabelText("Shot controls");
    expect(within(pads).getByText("Straight")).toBeInTheDocument();
    expect(pads.querySelector("[data-preview]")).toBeInTheDocument();

    typeValue("Club face", "3");
    typeValue("Club path", "-2");
    expect(within(pads).getByText("Push Slice")).toBeInTheDocument();

    typeValue("Club face", "-1");
    typeValue("Club path", "2");
    expect(within(pads).getByText("Draw")).toBeInTheDocument();
  });

  const posed = (view) => clubScenes[view].update.mock.calls.at(-1)[0];

  test("the two views are live 3D scenes on fixed cameras, not orbiting ones", () => {
    const { unmount } = renderApp();
    expect(createClubScene).toHaveBeenCalledTimes(2);
    for (const view of ["above", "toe"]) {
      expect(clubScenes[view].options.orbit).toBe(false);
      expect(clubScenes[view].options.labels).toBe(false);
      expect(clubScenes[view].options.camera.position).toHaveLength(3);
    }
    // the view from above shows the lines on the turf, the side view the
    // arrows in the air and the line up the face
    expect(clubScenes.above.options.airGuides).toBe(false);
    expect(clubScenes.toe.options.groundGuides).toBe(false);
    expect(clubScenes.toe.options.loftLever).toBe(true);

    unmount();
    expect(clubScenes.above.dispose).toHaveBeenCalled();
    expect(clubScenes.toe.dispose).toHaveBeenCalled();
  });

  test("the view from above is posed with the horizontal angles drawn five times bigger", () => {
    renderApp("/?face=2&path=-3&aim=4&strike=0.5");
    expect(posed("above")).toMatchObject({
      mirror: 1,
      aimDegrees: 10,
      faceDegrees: 20,
      pathDegrees: -5,
      attackDegrees: 0,
    });
    // strike is drawn at twice its size: half an inch is 1.27 cm
    expect(posed("above").strikeCm).toBeCloseTo(2.54);

    typeValue("Club face", "-1");
    expect(posed("above").faceDegrees).toBe(5);
  });

  test("the side view is square to the camera and shows only attack and loft", () => {
    renderApp("/?face=4&path=-3&aim=6&speed=105&attack=2&loft=1");
    expect(posed("toe")).toMatchObject({
      aimDegrees: 0,
      faceDegrees: 0,
      pathDegrees: 0,
      startDegrees: 0,
      attackDegrees: 8,
      strikeCm: 0,
    });
    // standard loft at 105 mph is 14.1°; +1 is drawn as +4, and the head
    // already has 10.5° built in
    expect(posed("toe").loftTiltDegrees).toBeCloseTo(14.12 + 4 - 10.5, 1);
    // the launch arrow stays at its true angle
    expect(posed("toe").launchDegrees).toBeCloseTo(13.15, 1);
  });

  test("a left-hander's club is mirrored in both views", () => {
    renderApp("/?face=2&side=Left");
    expect(posed("above")).toMatchObject({ mirror: -1, faceDegrees: -10 });
    expect(posed("toe").mirror).toBe(-1);
  });

  test("hovering and re-rendering do not re-pose the 3D views; a change does", () => {
    renderApp();
    const before = clubScenes.above.update.mock.calls.length;
    fireEvent.pointerEnter(handle("Club face"));
    fireEvent.pointerLeave(handle("Club face"));
    expect(clubScenes.above.update.mock.calls.length).toBe(before);
    press("e");
    expect(clubScenes.above.update.mock.calls.length).toBe(before + 1);
  });

  test("a handle shows its value in a tag while it is hovered or held", () => {
    renderApp("/?face=3");
    expect(handle("Club face").querySelector("[data-tag]")).toBeNull();
    fireEvent.pointerEnter(handle("Club face"));
    expect(handle("Club face").querySelector("[data-tag]")).toHaveTextContent(
      "3° open",
    );
    fireEvent.pointerLeave(handle("Club face"));
    expect(handle("Club face").querySelector("[data-tag]")).toBeNull();
  });

  test("the side-view handles drag attack and loft, mirrored for a left-hander", () => {
    renderApp("/?speed=105");
    let [x, y] = centreOf("Attack angle");
    pointer("pointerdown", handle("Attack angle"), x, y);
    // the tail of the arrow drops: hitting up
    pointer("pointermove", window, x, y + 14);
    expect(valueOf("Attack angle")).toBeGreaterThan(0);
    pointer("pointerup", window, x, y + 14);

    [x, y] = centreOf("Loft");
    pointer("pointerdown", handle("Loft"), x, y);
    // lean the face line back, away from the target (which is on the right)
    pointer("pointermove", window, x - 12, y);
    expect(valueOf("Loft")).toBeGreaterThan(0);
    pointer("pointerup", window, x - 12, y);
  });

  test("the head itself drags the strike point toward the toe or heel", () => {
    renderApp();
    const [x, y] = centreOf("Strike");
    pointer("pointerdown", handle("Strike"), x, y);
    // a right-hander stands on the left of this view: toward them is a toe strike
    pointer("pointermove", window, x - 12, y);
    expect(valueOf("Strike")).toBeGreaterThan(0);
    pointer("pointermove", window, x + 40, y);
    expect(valueOf("Strike")).toBe(-1);
  });
});

describe("settings", () => {
  test("opens from the overflow button and closes again", () => {
    renderApp();
    const dialog = openSettings();
    expect(dialog.getByText("Settings")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("has a Feedback link to the feedback form", () => {
    renderApp();
    const dialog = openSettings();
    const link = dialog.getByRole("link", { name: /feedback/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("docs.google.com/forms"),
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  test("dominant side tells the scene and mirrors the next launch", () => {
    renderApp("/?face=4");
    const dialog = openSettings();
    fireEvent.click(dialog.getByRole("button", { name: /left-handed/i }));
    expect(simulator.setSide).toHaveBeenLastCalledWith("Left");
    expect(
      dialog.getByRole("button", { name: /left-handed/i }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));
    hit();
    expect(lastLaunch().initHorizontalAngleDegrees).toBeLessThan(0);
    expect(lastHit()[1]).toBe("Left");
  });

  test("turf defaults to normal, and a preset goes with the next hit", () => {
    renderApp();
    hit();
    expect(lastTurf()).toMatchObject(TURF_PRESETS.normal);

    const dialog = openSettings();
    expect(dialog.getByRole("button", { name: "Normal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(dialog.getByRole("button", { name: "Firm" }));
    expect(dialog.getByRole("button", { name: "Firm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));
    hit();
    expect(lastTurf()).toMatchObject(TURF_PRESETS.firm);
  });

  test("shows the preset's turf values", () => {
    renderApp("/?turf=soft");
    const dialog = openSettings();
    expect(dialog.getByLabelText("Grass")).toHaveValue("ryegrass");
    expect(dialog.getByLabelText("Height of cut")).toHaveValue("0.75");
    expect(dialog.getByLabelText("Ground firmness")).toHaveValue("0.2");
    expect(dialog.getByLabelText("Leaf wetness")).toHaveValue("1");
    expect(dialog.getByText("0.75 in")).toBeInTheDocument();
  });

  test("editing a turf field makes it custom, keeps the other fields, and is used by the next hit", () => {
    renderApp("/?turf=firm");
    const dialog = openSettings();
    fireEvent.change(dialog.getByLabelText("Height of cut"), {
      target: { value: "1.2" },
    });
    expect(dialog.getByText(/custom conditions/i)).toBeInTheDocument();
    for (const name of ["Soft", "Normal", "Firm"]) {
      expect(dialog.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    fireEvent.change(dialog.getByLabelText("Grass"), {
      target: { value: "bermudagrass" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));
    hit();
    expect(lastTurf()).toMatchObject({
      grass: "bermudagrass",
      mowHeightInches: 1.2,
      firmness: 0.75,
      leafWetness: 0,
    });
  });

  test("picking a preset again clears the custom values", () => {
    renderApp("/?turf=normal&cut=1.4&firm=0.1&wet=0.5&grass=bentgrass");
    hit();
    expect(lastTurf()).toMatchObject({
      grass: "bentgrass",
      mowHeightInches: 1.4,
      firmness: 0.1,
      leafWetness: 0.5,
    });
    const dialog = openSettings();
    fireEvent.click(dialog.getByRole("button", { name: "Firm" }));
    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));
    hit();
    expect(lastTurf()).toMatchObject(TURF_PRESETS.firm);
  });

  test("junk turf values in the URL are clamped or ignored", () => {
    renderApp("/?turf=lava&cut=99&firm=-3&wet=abc&grass=astroturf");
    hit();
    expect(lastTurf()).toMatchObject({
      grass: "ryegrass",
      mowHeightInches: 1.5,
      firmness: 0,
      leafWetness: 0,
    });
  });
});

describe("shot result bar", () => {
  test("shows live distance in flight and on the ground, then the full result", () => {
    renderApp();
    expect(
      screen.queryByRole("status", { name: "Shot result" }),
    ).not.toBeInTheDocument();

    hit();
    act(() => callbacks.onProgress({ distanceYards: 87.4, onGround: false }));
    expect(result()).toHaveTextContent("In the air");
    expect(result()).toHaveTextContent("87");

    act(() => callbacks.onProgress({ distanceYards: 251.6, onGround: true }));
    expect(result()).toHaveTextContent("On the ground");

    act(() =>
      callbacks.onResult({
        shape: "Push Fade",
        carryYards: 243.2,
        runYards: 18.4,
        totalYards: 261.6,
        offlineYards: 26.4,
        apexYards: 31,
        flightSeconds: 6.24,
      }),
    );
    expect(result()).toHaveTextContent("Push Fade");
    expect(result()).toHaveTextContent("262yd total");
    expect(result()).toHaveTextContent("243 yd");
    expect(result()).toHaveTextContent("18 yd");
    expect(result()).toHaveTextContent("26 yd right");
    expect(result()).toHaveTextContent("93 ft");
  });
});

describe("game mode", () => {
  const game = () => screen.getByRole("status", { name: "Game" });
  const lastTarget = () => simulator.setTarget.mock.calls.at(-1)[0];
  const land = (targetResult) =>
    act(() =>
      callbacks.onResult({
        shape: "Straight",
        carryYards: 200,
        runYards: 20,
        totalYards: 220,
        offlineYards: 0,
        apexYards: 25,
        target: targetResult,
      }),
    );

  test("game mode is the default: a fresh visit has a target and a score", () => {
    renderApp();
    expect(lastTarget().z).toBeGreaterThanOrEqual(140);
    expect(game()).toHaveTextContent("0 of 0 hit · streak 0");
    const dialog = openSettings();
    expect(dialog.getByRole("button", { name: "Game mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("practice mode has no target", () => {
    renderApp("/?mode=practice");
    expect(
      screen.queryByRole("status", { name: "Game" }),
    ).not.toBeInTheDocument();
    expect(lastTarget()).toBeNull();
  });

  test("switching to game mode in Settings puts a target on the range and shows it", () => {
    renderApp("/?mode=practice");
    const dialog = openSettings();
    fireEvent.click(dialog.getByRole("button", { name: "Game mode" }));
    fireEvent.click(dialog.getByRole("button", { name: "Close settings" }));

    const target = lastTarget();
    expect(target.z).toBeGreaterThanOrEqual(140);
    expect(game()).toHaveTextContent(`${target.distanceYards}`);
    expect(game()).toHaveTextContent("0 of 0 hit · streak 0");

    const again = openSettings();
    fireEvent.click(again.getByRole("button", { name: "Practice" }));
    fireEvent.click(again.getByRole("button", { name: "Close settings" }));
    expect(lastTarget()).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Game" }),
    ).not.toBeInTheDocument();
  });

  test("a miss is scored and described, and the target stays", () => {
    renderApp("/?mode=game");
    const target = lastTarget();
    land({ hit: false, longYards: -9.2, rightYards: -4.1 });

    expect(game()).toHaveTextContent("Missed: 9 yd short, 4 yd left");
    expect(game()).toHaveTextContent("0 of 1 hit · streak 0");
    act(() => callbacks.onState("address"));
    expect(lastTarget()).toBe(target);
  });

  test("a hit is scored and a new target appears once the camera is back at the tee", () => {
    renderApp("/?mode=game");
    const first = lastTarget();
    land({ hit: true, longYards: 1, rightYards: 0 });

    expect(game()).toHaveTextContent("Hit!");
    expect(game()).toHaveTextContent("1 of 1 hit · streak 1");
    expect(lastTarget()).toBe(first);

    act(() => callbacks.onState("address"));
    expect(lastTarget()).not.toBe(first);
    // the new target starts clean: no verdict carried over from the last one
    expect(game()).not.toHaveTextContent("Hit!");
    expect(game()).toHaveTextContent("1 of 1 hit · streak 1");

    land({ hit: false, longYards: 30, rightYards: 2 });
    expect(game()).toHaveTextContent("1 of 2 hit · streak 0");
  });

  test("New target swaps the target without touching the score", () => {
    renderApp("/?mode=game");
    const first = lastTarget();
    fireEvent.click(screen.getByRole("button", { name: "New target" }));
    expect(lastTarget()).not.toBe(first);
    expect(game()).toHaveTextContent("0 of 0 hit");
  });
});
