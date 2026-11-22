import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";
import { createSimulator } from "./simulate/main";
import { createClubScene } from "./simulate/club-scene";
import { TURF_PRESETS } from "./simulate/ground";
import { CLUBS } from "./simulate/clubs";
import { reportError, setContext, track } from "./analytics";

// jsdom has no WebGL, so the 3D scene can't start under Jest; the fake stands
// in for it and records what the UI asks it to do.
jest.mock("./simulate/main", () => ({ createSimulator: jest.fn() }));
jest.mock("./simulate/club-scene", () => ({ createClubScene: jest.fn() }));
jest.mock("./analytics", () => ({
  track: jest.fn(),
  identify: jest.fn(),
  setContext: jest.fn(),
  reportError: jest.fn(),
}));

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
  // No saved player, and the leaderboard API cannot be reached unless a test
  // says otherwise.
  window.localStorage.clear();
  global.fetch = jest.fn(() => Promise.reject(new TypeError("offline")));
  simulator = {
    hit: jest.fn(),
    setSide: jest.fn(),
    setAim: jest.fn(),
    setTarget: jest.fn(),
    showShot: jest.fn(),
    setClub: jest.fn(),
    setViewInset: jest.fn(),
    setOverhead: jest.fn(),
    dispose: jest.fn(),
  };
  viewport(true);
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

// Laptop width, where the two club views are part of the panel, unless a
// test asks for a phone.
const viewport = (desktop) => {
  window.matchMedia = (query) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
};

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

// Every control shows in practice (and advanced); a normal game shows three.
// Tests of the controls themselves open in practice unless the URL says.
const renderPanel = (url = "/") =>
  renderApp(
    /[?&]mode=/.test(url)
      ? url
      : `${url}${url.includes("?") ? "&" : "?"}mode=practice`,
  );

const hit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^hit$/i }));
const lastHit = () => simulator.hit.mock.calls.at(-1);
const lastLaunch = () => lastHit()[0];
const lastTurf = () => lastHit()[2];
const press = (key, options = {}) =>
  fireEvent.keyDown(document.body, { key, ...options });
// Command-arrow changes the box the keyboard is on (Club face to begin with).
const command = (key) => press(key, { metaKey: true });
// Put the keyboard on a box, as clicking it does.
const selectBox = (name) =>
  fireEvent.pointerDown(
    screen.getByRole("button", { name: new RegExp(`^Edit ${name}:`, "i") }),
  );
const selectedBox = () =>
  screen
    .getAllByRole("button", { name: /^Edit / })
    .map((button) => button.closest("[data-chip]"))
    .find((chip) => chip.dataset.selected === "true")?.dataset.chip;
// The whole value of a box, word and number together.
const shows = (name, text) =>
  expect(
    screen.getByRole("button", { name: `Edit ${name}: ${text}` }),
  ).toBeInTheDocument();
const openSettings = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return within(screen.getByRole("dialog"));
};
// Each shot control is a slider handle on a club pad and a value you can
// click to type over.
// Swing speed has no handle: its value is read off its box.
const boxText = (name) =>
  screen
    .getByRole("button", {
      name: new RegExp(`^Edit ${name}:`, "i"),
      // still readable behind an open dialog
      hidden: true,
    })
    .getAttribute("aria-label")
    .replace(/^Edit [^:]+: /, "");
const valueOf = (name) =>
  name === "Swing speed"
    ? Number.parseFloat(boxText(name))
    : Number(
        screen
          .getByRole("slider", { name, hidden: true })
          .getAttribute("aria-valuenow"),
      );
const textOf = (name) =>
  name === "Swing speed"
    ? boxText(name)
    : screen.getByRole("slider", { name }).getAttribute("aria-valuetext");
const startTyping = (name) => {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^Edit ${name}:`, "i") }),
  );
  return screen.getByRole("textbox", { name });
};
// The field a value is being typed into, if any.
const typingField = () => document.querySelector('input[inputmode="decimal"]');
const typeValue = (name, value, key = "Enter") => {
  const input = startTyping(name);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key });
};
const result = () => screen.getByRole("status", { name: "Shot result" });

describe("shot controls", () => {
  test("the panel holds the shot controls and the mode; turf and handedness are in Settings", () => {
    renderPanel();
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
    // the mode is on the panel, below the controls
    expect(screen.getByRole("button", { name: "Game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a normal game shows face, path and speed; the rest play at their defaults", () => {
    renderApp("/?aim=5&attack=4&loft=-2&strike=0.5&face=2");
    expect(valueOf("Club face")).toBe(2);
    expect(valueOf("Club path")).toBe(0);
    expect(valueOf("Swing speed")).toBe(95);
    for (const name of ["Aim", "Attack angle", "Loft", "Strike"])
      expect(screen.queryByRole("slider", { name })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Club from the side" }),
    ).toBeNull();
    expect(selectedBox()).toBe("clubFaceAngle");
    hit();
    expect(simulator.setAim).toHaveBeenLastCalledWith(0);
    expect(lastHit()[3]).toBe(0);

    // advanced shows all seven, with the values from the URL
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(valueOf("Aim")).toBe(5);
    expect(valueOf("Strike")).toBe(0.5);
  });

  test("a changed control is used by the very next hit", () => {
    renderPanel();
    hit();
    expect(lastLaunch()).toMatchObject({ initSpeedMPH: 95 });
    expect(lastLaunch().initHorizontalAngleDegrees).toBeCloseTo(0);
    expect(lastLaunch().initSpinAngle).toBeCloseTo(0);
    expect(lastHit()[3]).toBe(0);

    typeValue("Club face", "4");
    typeValue("Club path", "-2");
    typeValue("Swing speed", "120");
    typeValue("Aim", "-5");
    shows("club face", "4° open");
    shows("club path", "2° out-to-in");
    shows("swing speed", "120 mph");
    shows("aim", "5° left");

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
    renderPanel("/?face=-3&path=5&speed=110&aim=4");
    expect(valueOf("Club face")).toBe(-3);
    expect(valueOf("Club path")).toBe(5);
    expect(valueOf("Swing speed")).toBe(110);
    expect(valueOf("Aim")).toBe(4);
  });

  test("out-of-range or junk URL values are clamped", () => {
    renderPanel("/?face=abc&path=40&speed=500&aim=-90&side=Banana");
    expect(valueOf("Club face")).toBe(0);
    expect(valueOf("Club path")).toBe(6);
    expect(valueOf("Swing speed")).toBe(140);
    expect(valueOf("Aim")).toBe(-10);
    hit();
    expect(lastLaunch().initSpeedMPH).toBe(140);
    expect(lastHit()[1]).toBe("Right");
  });

  test("attack angle and loft change the launch of the next hit", () => {
    renderPanel("/?speed=105");
    hit();
    const level = lastLaunch();
    expect(screen.getAllByText("level").length).toBeGreaterThan(0);
    expect(screen.getByText("14.1°")).toBeInTheDocument();

    typeValue("Attack angle", "5");
    shows("attack angle", "5° up");
    hit();
    const up = lastLaunch();
    expect(up.initVerticalAngleDegrees).toBeGreaterThan(
      level.initVerticalAngleDegrees,
    );
    expect(up.initBackspinRPM).toBeLessThan(level.initBackspinRPM);

    typeValue("Loft", "3");
    shows("loft", "17.1° (+3)");
    hit();
    expect(lastLaunch().initVerticalAngleDegrees).toBeGreaterThan(
      up.initVerticalAngleDegrees,
    );
    expect(lastLaunch().initBackspinRPM).toBeGreaterThan(up.initBackspinRPM);
  });

  test("attack and loft are read from the URL", () => {
    renderPanel("/?attack=-3&loft=2");
    expect(valueOf("Attack angle")).toBe(-3);
    expect(valueOf("Loft")).toBe(2);
  });

  test("strike location is used by the next hit, shown in words, and read from the URL", () => {
    renderPanel("/?speed=105");
    expect(screen.getByText("centre")).toBeInTheDocument();
    hit();
    const centre = lastLaunch();

    typeValue("Strike", "0.75");
    shows("strike", "0.75 in toe");
    hit();
    const toe = lastLaunch();
    expect(toe.smashFactor).toBeLessThan(centre.smashFactor);
    expect(toe.initHorizontalAngleDegrees).toBeGreaterThan(2);
    expect(toe.initSpinAngle).toBeGreaterThan(8);

    typeValue("Strike", "-0.5");
    shows("strike", "0.5 in heel");
  });

  test("strike is read from the URL and clamped", () => {
    renderPanel("/?strike=0.75");
    expect(valueOf("Strike")).toBe(0.75);
  });

  test("a junk or out-of-range strike falls back into range", () => {
    renderPanel("/?strike=9");
    expect(valueOf("Strike")).toBe(1);
  });

  test("aiming shows the stance in the scene before the shot", () => {
    renderPanel();
    typeValue("Aim", "6");
    expect(simulator.setAim).toHaveBeenLastCalledWith(6);
  });

  test("Reset clears the shot but keeps the session settings", () => {
    renderPanel(
      "/?face=3&path=-2&speed=120&aim=5&attack=4&loft=-2&strike=0.5&side=Left&turf=firm&mode=advanced",
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

describe("keyboard", () => {
  test("arrows move between the boxes; the keyboard starts on Aim", () => {
    renderPanel();
    expect(selectedBox()).toBe("aim");
    selectBox("club face");
    expect(selectedBox()).toBe("clubFaceAngle");
    press("ArrowRight");
    expect(selectedBox()).toBe("clubPathAngle");
    press("ArrowRight");
    expect(selectedBox()).toBe("strike");
    press("ArrowLeft");
    expect(selectedBox()).toBe("clubPathAngle");
    press("ArrowDown");
    expect(selectedBox()).toBe("clubPathAngle");
    for (let i = 0; i < 6; i++) press("ArrowRight");
    expect(selectedBox()).toBe("swingSpeed");
    // moving never changes a value
    for (const name of ["Club face", "Club path", "Strike", "Aim"]) {
      expect(valueOf(name)).toBe(0);
    }
    expect(valueOf("Swing speed")).toBe(95);
  });

  test("Command with left and right changes the number of the box the keyboard is on", () => {
    renderPanel();
    selectBox("club face");
    command("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Club face")).toBe(2);
    command("ArrowLeft");
    expect(valueOf("Club face")).toBe(1);

    press("ArrowRight");
    command("ArrowLeft");
    expect(valueOf("Club path")).toBe(-1);
    expect(valueOf("Club face")).toBe(1);

    press("ArrowRight");
    command("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Strike")).toBe(0.5);

    press("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Aim")).toBe(1);

    press("ArrowRight");
    command("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Attack angle")).toBe(2);

    press("ArrowRight");
    command("ArrowLeft");
    expect(valueOf("Loft")).toBe(-1);

    press("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Swing speed")).toBe(96);
    command("ArrowLeft");
    command("ArrowLeft");
    expect(valueOf("Swing speed")).toBe(94);
  });

  test("Ctrl works in place of Command", () => {
    renderPanel();
    selectBox("club face");
    press("ArrowRight", { ctrlKey: true });
    expect(valueOf("Club face")).toBe(1);
  });

  test("Command with up and down steps the word: one side, neutral, the other side", () => {
    renderPanel("/?face=4");
    selectBox("club face");
    shows("club face", "4° open");
    command("ArrowDown");
    shows("club face", "square");
    expect(valueOf("Club face")).toBe(0);
    command("ArrowDown");
    shows("club face", "1° closed");
    command("ArrowDown");
    expect(valueOf("Club face")).toBe(-1);
    command("ArrowUp");
    expect(valueOf("Club face")).toBe(0);
    command("ArrowUp");
    shows("club face", "1° open");

    selectBox("swing speed");
    command("ArrowRight");
    command("ArrowRight");
    expect(valueOf("Swing speed")).toBe(97);
    command("ArrowDown");
    expect(valueOf("Swing speed")).toBe(95);
  });

  test("each box shows its word and its number as two separate fields", () => {
    renderPanel("/?face=3&path=-2&strike=0.5&aim=-4&attack=2&speed=100");
    const fields = (control) => {
      const chip = screen
        .getAllByRole("button", { name: /^Edit / })
        .map((button) => button.closest("[data-chip]"))
        .find((box) => box.dataset.chip === control);
      return [
        chip.querySelector('[data-field="word"]').selectedOptions[0]
          .textContent,
        chip.querySelector('[data-field="number"]').textContent,
      ];
    };
    expect(fields("clubFaceAngle")).toEqual(["open", "3°"]);
    expect(fields("clubPathAngle")).toEqual(["out-to-in", "2°"]);
    expect(fields("strike")).toEqual(["toe", "0.5 in"]);
    expect(fields("aim")).toEqual(["left", "4°"]);
    expect(fields("attackAngle")).toEqual(["up", "2°"]);
    expect(fields("loftChange")).toEqual(["stock", "14.5°"]);
    expect(fields("swingSpeed")).toEqual(["faster", "100 mph"]);
  });

  test("the word is a menu of the three it can be; choosing one sets the control", () => {
    renderPanel("/?face=3&attack=-2");
    const word = (name) => screen.getByRole("combobox", { name });
    const choose = (name, option) =>
      fireEvent.change(word(name), {
        target: {
          value: within(word(name)).getByRole("option", { name: option }).value,
        },
      });
    expect(
      within(word("Club face: open"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["closed", "square", "open"]);

    // neutral
    choose("Club face: open", "square");
    expect(valueOf("Club face")).toBe(0);
    // from neutral, one step out
    choose("Club face: square", "closed");
    expect(valueOf("Club face")).toBe(-1);
    // the other side keeps the size
    choose("Attack angle: down", "up");
    expect(valueOf("Attack angle")).toBe(2);
    // the word it already is changes nothing
    choose("Attack angle: up", "up");
    expect(valueOf("Attack angle")).toBe(2);
  });

  test("each control has an (i) that says what it does, only when clicked", () => {
    renderPanel();
    const pads = screen.getByLabelText("Shot controls");
    const about = (name) =>
      within(pads).getByRole("button", { name: `About ${name}` });
    expect(within(pads).queryByRole("note")).not.toBeInTheDocument();
    for (const name of [
      "club face",
      "club path",
      "strike",
      "aim",
      "attack angle",
      "loft",
      "swing speed",
    ]) {
      fireEvent.click(about(name));
      expect(within(pads).getByRole("note")).toHaveTextContent(
        new RegExp(`^${name}\\. .{40,}`, "i"),
      );
    }
    fireEvent.click(about("swing speed"));
    expect(within(pads).queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(about("aim"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(pads).queryByRole("note")).not.toBeInTheDocument();
    // nothing in the panel explains itself on hover any more
    expect(pads.querySelector("[data-tooltip-content]")).toBeNull();
  });

  test("the dots are seven different colours", () => {
    renderPanel();
    const dots = [...document.querySelectorAll("[data-chip] [data-dot]")].map(
      (dot) => dot.style.background,
    );
    expect(dots).toHaveLength(7);
    expect(new Set(dots).size).toBe(7);
  });

  test("every new shot starts with the keyboard on Aim", () => {
    renderPanel("/?mode=practice");
    selectBox("loft");
    expect(selectedBox()).toBe("loftChange");
    hit();
    act(() => callbacks.onState("address"));
    expect(selectedBox()).toBe("aim");
  });

  test("on a phone one control shows at a time, picked from tabs, without the two club views", () => {
    viewport(false);
    renderPanel("/?mode=normal&face=2");
    expect(createClubScene).not.toHaveBeenCalled();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Face2° open",
      "Pathsquare",
      "Speed95 mph",
    ]);
    // only the selected control is open, as a big number with its ruler
    expect(screen.getByRole("tab", { selected: true })).toBe(tabs[0]);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Club face");
    expect(screen.queryByRole("slider", { name: "Club face" })).toBeNull();
    expect(
      screen.getByRole("slider", { name: "Club face ruler" }),
    ).toHaveAttribute("aria-valuetext", "2° open");

    fireEvent.click(tabs[2]);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Swing speed");
    fireEvent.click(screen.getByRole("button", { name: "+1 mph" }));
    expect(valueOf("Swing speed")).toBe(96);
    fireEvent.click(screen.getByRole("button", { name: "Stock" }));
    expect(valueOf("Swing speed")).toBe(95);
    fireEvent.change(
      screen.getByRole("slider", { name: "Swing speed ruler" }),
      {
        target: { value: "101" },
      },
    );
    expect(valueOf("Swing speed")).toBe(101);

    fireEvent.click(tabs[0]);
    fireEvent.click(screen.getByRole("button", { name: "1° closed" }));
    expect(
      screen.getByRole("slider", { name: "Club face ruler" }),
    ).toHaveAttribute("aria-valuetext", "1° open");
  });

  test("on a phone the bag is a row of chips in the panel", () => {
    viewport(false);
    renderPanel("/?mode=normal");
    const bag = within(screen.getByRole("radiogroup", { name: "Club" }));
    expect(bag.getAllByRole("radio")).toHaveLength(CLUBS.length);
    expect(bag.getByRole("radio", { checked: true })).toHaveTextContent(
      "Driver",
    );
    fireEvent.click(bag.getByRole("radio", { name: "7 iron, 34°" }));
    expect(address()).toContain("club=7i");
    expect(bag.getByRole("radio", { checked: true })).toHaveTextContent(
      "7 iron",
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Speed/ }));
    expect(valueOf("Swing speed")).toBe(76);
  });

  test("a digit typed with no field open starts typing into the box the keyboard is on", () => {
    renderPanel();
    selectBox("club face");
    press("4");
    const input = screen.getByRole("textbox", { name: "Club face" });
    expect(input).toHaveValue("4");
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // held to the range
    expect(valueOf("Club face")).toBe(6);
    // not while Settings is open
    openSettings();
    press("2");
    expect(typingField()).toBeNull();
  });

  test("each box steps with its arrows and goes back to neutral with its reset", () => {
    renderPanel("/?face=-1&speed=100");
    fireEvent.click(screen.getByRole("button", { name: "Club face: 1° open" }));
    expect(valueOf("Club face")).toBe(0);
    expect(
      screen.getByRole("button", { name: "Club face back to square" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Club face: 1° open" }));
    expect(textOf("Club face")).toBe("1° open");
    fireEvent.click(
      screen.getByRole("button", { name: "Swing speed back to stock" }),
    );
    expect(valueOf("Swing speed")).toBe(95);
  });

  test("a normal game's three boxes have rulers; with all seven the boxes are compact and the 3D handles do the dragging", () => {
    renderPanel("/?mode=normal");
    fireEvent.change(screen.getByRole("slider", { name: "Club path ruler" }), {
      target: { value: "-3" },
    });
    expect(boxText("Club path")).toBe("3° out-to-in");
    expect(screen.getAllByRole("slider", { name: / ruler$/ })).toHaveLength(3);
    expect(screen.getByText("Distances in Settings")).toBeInTheDocument();
  });

  test("with all seven controls the boxes are compact: no rulers, word beside the number", () => {
    renderPanel();
    expect(screen.queryAllByRole("slider", { name: / ruler$/ })).toHaveLength(
      0,
    );
    expect(screen.queryByText("Distances in Settings")).toBeNull();
    // still stepped, typed and reset in place
    fireEvent.click(
      screen.getByRole("button", { name: "Club path: 1° out-to-in" }),
    );
    expect(valueOf("Club path")).toBe(-1);
    typeValue("Swing speed", "101");
    expect(boxText("Swing speed")).toBe("101 mph");
  });

  test("clicking a box, or grabbing its handle, puts the keyboard on it", () => {
    renderPanel();
    selectBox("aim");
    expect(selectedBox()).toBe("aim");
    command("ArrowRight");
    expect(valueOf("Aim")).toBe(1);
    fireEvent.focus(screen.getByRole("slider", { name: "Strike" }));
    expect(selectedBox()).toBe("strike");
  });

  test("key presses that arrive before the screen redraws all count", () => {
    renderPanel("/?face=1");
    selectBox("club face");
    act(() => {
      for (let i = 0; i < 3; i++) {
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            metaKey: true,
            bubbles: true,
          }),
        );
      }
    });
    expect(valueOf("Club face")).toBe(4);
  });

  test("a control stops at the end of its range", () => {
    renderPanel("/?face=6&speed=80");
    selectBox("club face");
    command("ArrowRight");
    expect(valueOf("Club face")).toBe(6);
    selectBox("swing speed");
    command("ArrowLeft");
    expect(valueOf("Swing speed")).toBe(80);
  });

  test("Space hits whatever has focus, except a field being typed in", () => {
    renderPanel();
    const spaceOn = (element) => {
      element.focus();
      fireEvent.keyDown(element, { key: " " });
    };
    const targets = [
      () => screen.getByRole("button", { name: "Practice" }),
      () => screen.getByRole("button", { name: "Game" }),
      () => screen.getByRole("button", { name: "About the modes" }),
      () => screen.getByRole("button", { name: "Reset" }),
      () => screen.getByRole("button", { name: "Club path: 1° in-to-out" }),
      () => screen.getByRole("button", { name: /^Edit club face:/ }),
      () => screen.getByRole("button", { name: "About club face" }),
      () => screen.getByRole("combobox", { name: /^Club face:/ }),
      () => screen.getByRole("button", { name: /Driver · 10\.5°/ }),
      () => screen.getByRole("slider", { name: "Aim", hidden: true }),
      () => screen.getByRole("button", { name: /^hit$/i }),
      () => screen.getByRole("button", { name: "Settings" }),
      () => document.body,
    ];
    targets.forEach((target, i) => {
      const element = target();
      spaceOn(element);
      expect(simulator.hit).toHaveBeenCalledTimes(i + 1);
      // focus is taken off, so the button's own Space click cannot follow
      expect(document.activeElement).not.toBe(
        element === document.body ? null : element,
      );
      act(() => callbacks.onState("address"));
    });
    // still in practice: Space on a mode button did not switch it
    expect(address()).toContain("mode=practice");
    // typing a value is left alone
    const input = startTyping("Club face");
    fireEvent.keyDown(input, { key: " " });
    expect(simulator.hit).toHaveBeenCalledTimes(targets.length);
  });

  test("Space hits with the current setup", () => {
    renderPanel();
    selectBox("club face");
    command("ArrowRight");
    press(" ");
    expect(simulator.hit).toHaveBeenCalledTimes(1);
    expect(lastLaunch().initHorizontalAngleDegrees).toBeGreaterThan(0);
  });

  test("letters do nothing any more", () => {
    renderPanel("/?face=2");
    for (const letter of "qeadswzcgthybnrQER") press(letter);
    expect(valueOf("Club face")).toBe(2);
    expect(valueOf("Club path")).toBe(0);
    expect(valueOf("Swing speed")).toBe(95);
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("the keyboard stands down while Settings is open", () => {
    renderPanel();
    openSettings();
    command("ArrowRight");
    press("ArrowDown");
    press(" ");
    expect(valueOf("Club face")).toBe(0);
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("the keys are explained in the panel, with no letters on the boxes", () => {
    renderPanel();
    const pads = screen.getByLabelText("Shot controls");
    // the step and the words follow the box the keyboard is on (Aim)
    for (const hint of [
      "←→ move",
      "⌘←→ ±1°",
      "⌘↑↓ left · straight · right",
      "0–9 type a value",
      "Space hit",
    ])
      expect(pads).toHaveTextContent(hint);
    selectBox("swing speed");
    expect(pads).toHaveTextContent("⌘←→ ±1 mph");
    expect(pads).toHaveTextContent("⌘↑↓ slower · stock · faster");
    expect(pads).not.toHaveTextContent(/\bQ E\b|\bA D\b|\bS W\b/);
    expect(document.querySelector("[data-tooltip-content]")).toBeNull();
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
    renderPanel();
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
    renderPanel();
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
      renderPanel();
      selectBox("swing speed");
      for (let i = 0; i < 40; i++) command("ArrowRight");
      selectBox("club face");
      for (let i = 0; i < 5; i++) command("ArrowRight");
      expect(valueOf("Swing speed")).toBe(135);
      expect(valueOf("Club face")).toBe(5);
      expect(address()).toBe("?mode=practice");

      act(() => jest.advanceTimersByTime(300));
      expect(address()).toBe("?mode=practice&speed=135&face=5");
      expect(valueOf("Swing speed")).toBe(135);

      // a hit in that window still uses what is on screen
      command("ArrowLeft");
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
      renderPanel("/?face=2");
      command("ArrowRight");
      fireEvent.click(screen.getByRole("button", { name: /reset/i }));
      act(() => jest.advanceTimersByTime(300));
      expect(valueOf("Club face")).toBe(0);
      expect(address()).toBe("?mode=practice");
    } finally {
      jest.useRealTimers();
    }
  });

  test("after typing with the keyboard, focus goes back to the value; clicking away leaves focus where the click put it", () => {
    renderPanel();
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
    renderPanel("/?face=2&path=-3&speed=105&attack=1&loft=2&strike=-0.5&aim=4");
    expect(textOf("Club face")).toBe("2° open");
    expect(textOf("Club path")).toBe("3° out-to-in");
    expect(textOf("Swing speed")).toBe("105 mph");
    expect(textOf("Attack angle")).toBe("1° up");
    expect(textOf("Loft")).toBe("16.1° (+2)");
    expect(textOf("Strike")).toBe("0.5 in heel");
    expect(textOf("Aim")).toBe("4° right");
  });

  test("clicking a value turns it into a field; Enter keeps what was typed", () => {
    renderPanel();
    const input = startTyping("Club face");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("0");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(valueOf("Club face")).toBe(4);
    expect(typingField()).toBeNull();
    expect(
      screen.getByRole("button", { name: "Edit club face: 4° open" }),
    ).toBeInTheDocument();
  });

  test("clicking away also keeps it, Escape throws it away", () => {
    renderPanel();
    const speed = startTyping("Swing speed");
    fireEvent.change(speed, { target: { value: "121" } });
    fireEvent.blur(speed);
    expect(valueOf("Swing speed")).toBe(121);

    typeValue("Aim", "7", "Escape");
    expect(valueOf("Aim")).toBe(0);
    expect(typingField()).toBeNull();
  });

  test("typed values keep two decimals and are held to the range; junk is ignored", () => {
    renderPanel();
    typeValue("Club path", "-2.456");
    expect(valueOf("Club path")).toBe(-2.46);
    expect(boxText("Club path")).toBe("2.46° out-to-in");
    // a step goes a whole step from there
    fireEvent.click(
      screen.getByRole("button", { name: "Club path: 1° in-to-out" }),
    );
    expect(valueOf("Club path")).toBe(-1.46);
    typeValue("Club path", "-2.4");
    expect(valueOf("Club path")).toBe(-2.4);
    // a bare number is the size and keeps the side; a sign picks the side
    typeValue("Club path", "3");
    expect(valueOf("Club path")).toBe(-3);
    typeValue("Club path", "+1");
    expect(valueOf("Club path")).toBe(1);
    typeValue("Club path", "-2");
    expect(valueOf("Club path")).toBe(-2);
    typeValue("Swing speed", "101.25");
    expect(boxText("Swing speed")).toBe("101.25 mph");
    typeValue("Strike", "0.6");
    expect(valueOf("Strike")).toBe(0.6);
    typeValue("Loft", "99");
    expect(valueOf("Loft")).toBe(4);
    typeValue("Swing speed", "12");
    expect(valueOf("Swing speed")).toBe(80);
    typeValue("Club face", "");
    expect(valueOf("Club face")).toBe(0);
  });

  test("typing in a field does not set off the arrow keys or Hit", () => {
    renderPanel();
    const input = startTyping("Club face");
    fireEvent.keyDown(input, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(input, { key: " " });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(valueOf("Club face")).toBe(0);
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("a focused handle takes Command-arrows, jumps with Home and End, and resets on double-click", () => {
    renderPanel();
    // focusing a handle puts the keyboard on its box
    fireEvent.focus(handle("Club face"));
    fireEvent.keyDown(handle("Club face"), {
      key: "ArrowRight",
      metaKey: true,
    });
    fireEvent.keyDown(handle("Club face"), {
      key: "ArrowRight",
      metaKey: true,
    });
    expect(valueOf("Club face")).toBe(2);
    fireEvent.keyDown(handle("Club face"), { key: "ArrowLeft", metaKey: true });
    expect(valueOf("Club face")).toBe(1);
    // a plain arrow moves to another box and leaves the value alone
    fireEvent.keyDown(handle("Club face"), { key: "ArrowRight" });
    expect(valueOf("Club face")).toBe(1);
    expect(selectedBox()).toBe("clubPathAngle");

    fireEvent.keyDown(handle("Aim"), { key: "End" });
    expect(valueOf("Aim")).toBe(10);
    fireEvent.keyDown(handle("Aim"), { key: "Home" });
    expect(valueOf("Aim")).toBe(-10);

    fireEvent.focus(handle("Strike"));
    fireEvent.keyDown(handle("Strike"), { key: "ArrowRight", metaKey: true });
    expect(valueOf("Strike")).toBe(0.25);
    selectBox("swing speed");
    command("ArrowRight");
    expect(valueOf("Swing speed")).toBe(96);

    fireEvent.doubleClick(handle("Aim"));
    fireEvent.doubleClick(handle("Club face"));
    expect(valueOf("Aim")).toBe(0);
    expect(valueOf("Club face")).toBe(0);
  });

  test("names the shot shape for the current setup as it changes, and sketches the flight", () => {
    renderPanel();
    // on laptops the shot shape heads the panel over the 3D views
    const pads = screen.getByLabelText("Club at impact");
    expect(within(pads).getByText("Straight")).toBeInTheDocument();
    expect(pads.querySelector("[data-preview]")).toBeInTheDocument();

    typeValue("Club face", "3");
    typeValue("Club path", "-2");
    expect(within(pads).getByText("Push Slice")).toBeInTheDocument();

    typeValue("Club face", "-1");
    typeValue("Club path", "+2");
    expect(within(pads).getByText("Draw")).toBeInTheDocument();
  });

  const posed = (view) => clubScenes[view].update.mock.calls.at(-1)[0];

  test("the two views are live 3D scenes on fixed cameras, not orbiting ones", () => {
    const { unmount } = renderPanel();
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
    renderPanel("/?face=2&path=-3&aim=4&strike=0.5");
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
    renderPanel("/?face=4&path=-3&aim=6&speed=105&attack=2&loft=1");
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
    renderPanel("/?face=2&side=Left");
    expect(posed("above")).toMatchObject({ mirror: -1, faceDegrees: -10 });
    expect(posed("toe").mirror).toBe(-1);
  });

  test("hovering and re-rendering do not re-pose the 3D views; a change does", () => {
    renderPanel();
    const before = clubScenes.above.update.mock.calls.length;
    fireEvent.pointerEnter(handle("Club face"));
    fireEvent.pointerLeave(handle("Club face"));
    expect(clubScenes.above.update.mock.calls.length).toBe(before);
    command("ArrowRight");
    expect(clubScenes.above.update.mock.calls.length).toBe(before + 1);
  });

  test("a handle shows its value in a tag while it is hovered or held", () => {
    renderPanel("/?face=3");
    expect(handle("Club face").querySelector("[data-tag]")).toBeNull();
    fireEvent.pointerEnter(handle("Club face"));
    expect(handle("Club face").querySelector("[data-tag]")).toHaveTextContent(
      "3° open",
    );
    fireEvent.pointerLeave(handle("Club face"));
    expect(handle("Club face").querySelector("[data-tag]")).toBeNull();
  });

  test("the side-view handles drag attack and loft, mirrored for a left-hander", () => {
    renderPanel("/?speed=105");
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
    renderPanel();
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
    expect(
      within(dialog.getByRole("group", { name: "Turf" })).getByRole("button", {
        name: "Normal",
      }),
    ).toHaveAttribute("aria-pressed", "true");
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
      expect(
        within(dialog.getByRole("group", { name: "Turf" })).getByRole(
          "button",
          { name },
        ),
      ).toHaveAttribute("aria-pressed", "false");
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

  // Practice or Game sits at the bottom of the shot panel; the difficulty
  // is on the game card.
  const modeButton = (name) =>
    within(
      screen.getByRole("group", {
        name: ["Practice", "Game"].includes(name) ? "Mode" : "Difficulty",
      }),
    ).getByRole("button", { name });
  const HIT = { hit: true, longYards: 1, rightYards: 0 };
  const MISS = { hit: false, longYards: -9.2, rightYards: -4.1 };
  // One shot at the target that is up, then the camera back at the tee.
  const play = (targetResult) => {
    hit();
    land(targetResult);
    act(() => callbacks.onState("address"));
  };

  test("a normal game is the default: a fresh visit has a ground target and an empty card", () => {
    renderApp();
    expect(lastTarget().z).toBeGreaterThanOrEqual(140);
    expect(lastTarget().air).toBeUndefined();
    expect(game()).toHaveTextContent("Target 1 of 5");
    expect(game()).toHaveTextContent("Hit 3 of 5 to win");
    expect(modeButton("Normal")).toHaveAttribute("aria-pressed", "true");
    expect(modeButton("Game")).toHaveAttribute("aria-pressed", "true");
  });

  test("a first visit pulses Hit, with no pop-up, until the first shot", () => {
    const { unmount } = renderApp();
    const hitButton = () => screen.getByRole("button", { name: /^hit$/i });
    expect(hitButton()).toHaveClass("hit-beckon");
    expect(document.querySelector("[data-first-shot]")).toBeNull();
    expect(screen.queryByText(/take your first shot/i)).toBeNull();
    hit();
    expect(hitButton()).not.toHaveClass("hit-beckon");
    unmount();
    renderApp();
    expect(hitButton()).not.toHaveClass("hit-beckon");
  });

  test("the very first target is one the stock straight shot reaches; later ones are random", () => {
    const { unmount } = renderApp();
    const first = lastTarget();
    expect(first.easy).toBe(true);
    expect(first.x).toBe(0);
    play(HIT);
    expect(lastTarget().easy).toBeUndefined();

    // a browser that has had a go at a target gets a random first one
    unmount();
    renderApp();
    expect(lastTarget().easy).toBeUndefined();
  });

  test("a miss says what to change for the next target; a hit clears it", () => {
    renderApp("/?face=3&path=-1");
    const tip = () => screen.queryByLabelText("Tip");
    expect(tip()).toBeNull();
    play({ hit: false, longYards: 2, rightYards: 15.4 });
    expect(tip()).toHaveTextContent(
      "15 yd right: it curved right because the club face was open to the path.",
    );
    play({ hit: false, longYards: 22, rightYards: 1 });
    expect(tip()).toHaveTextContent("22 yd long: try less swing speed.");
    play(HIT);
    expect(tip()).toBeNull();
  });

  test("on a phone a game in progress is one row at the foot of the picture, not the card", () => {
    viewport(false);
    renderApp("/");
    const game = screen.getByRole("status", { name: "Game" });
    expect(game).toHaveTextContent(`1/5${lastTarget().distanceYards} yd`);
    expect(within(game).getAllByRole("listitem")).toHaveLength(5);
    // no difficulty switch or result card while playing
    expect(
      within(game).queryByRole("group", { name: "Difficulty" }),
    ).toBeNull();
    play({ hit: false, longYards: 22, rightYards: 1 });
    expect(screen.getByRole("status", { name: "Game" })).toHaveTextContent(
      "2/5",
    );
    expect(screen.getByLabelText("Tip")).toHaveTextContent("22 yd long");
    fireEvent.click(
      within(screen.getByRole("status", { name: "Game" })).getByRole("button", {
        name: "Restart",
      }),
    );
    expect(screen.getByRole("status", { name: "Game" })).toHaveTextContent(
      "1/5",
    );
  });

  test("on a phone the bar picks Practice, Normal or Advanced", () => {
    viewport(false);
    renderApp("/");
    const bar = within(screen.getByRole("group", { name: "Mode" }));
    expect(bar.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Practice",
      "Normal",
      "Advanced",
    ]);
    expect(bar.getByRole("button", { name: "Normal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(bar.getByRole("button", { name: "Advanced" }));
    expect(address()).toContain("mode=advanced");
    fireEvent.click(bar.getByRole("button", { name: "Practice" }));
    expect(address()).toContain("mode=practice");
    expect(screen.queryByRole("status", { name: "Game" })).toBeNull();
  });

  test("Game goes back to the difficulty last played", () => {
    renderApp("/?mode=advanced");
    fireEvent.click(modeButton("Practice"));
    fireEvent.click(modeButton("Game"));
    expect(modeButton("Advanced")).toHaveAttribute("aria-pressed", "true");
  });

  test("practice mode has no target", () => {
    renderApp("/?mode=practice");
    expect(
      screen.queryByRole("status", { name: "Game" }),
    ).not.toBeInTheDocument();
    expect(lastTarget()).toBeNull();
  });

  test("switching mode on the panel puts a target on the range and shows it", () => {
    renderApp("/?mode=practice");
    fireEvent.click(modeButton("Game"));

    const target = lastTarget();
    expect(target.z).toBeGreaterThanOrEqual(140);
    expect(modeButton("Normal")).toHaveAttribute("aria-pressed", "true");
    expect(game()).toHaveTextContent(`${target.distanceYards}`);

    fireEvent.click(modeButton("Practice"));
    expect(lastTarget()).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Game" }),
    ).not.toBeInTheDocument();
  });

  test("advanced puts the targets in the air and asks for 4 of 5", () => {
    renderApp("/?mode=practice");
    fireEvent.click(modeButton("Game"));
    fireEvent.click(modeButton("Advanced"));

    const target = lastTarget();
    expect(target.air).toBe(true);
    expect(target.y).toBeGreaterThan(target.radius);
    expect(modeButton("Advanced")).toHaveAttribute("aria-pressed", "true");
    expect(game()).toHaveTextContent(`${target.heightYards} yd up`);
    expect(game()).toHaveTextContent("0 hit / 4 to win");

    play({ air: true, hit: false, highYards: -5.2, rightYards: 3.1 });
    expect(game()).toHaveTextContent("Missed: 5 yd low, 3 yd right");
    expect(lastTarget().air).toBe(true);
    expect(lastTarget()).not.toBe(target);
  });

  test("mode=game in an old link is a normal game", () => {
    renderApp("/?mode=game");
    expect(modeButton("Normal")).toHaveAttribute("aria-pressed", "true");
  });

  test("every shot is logged and the next target comes up once the camera is back", () => {
    renderApp();
    const first = lastTarget();
    hit();
    land(MISS);

    expect(game()).toHaveTextContent(
      `${first.distanceYards} ydMissed: 9 yd short, 4 yd left`,
    );
    expect(game()).toHaveTextContent("0 hit / 3 to win");
    expect(lastTarget()).toBe(first);

    act(() => callbacks.onState("address"));
    expect(lastTarget()).not.toBe(first);
    expect(game()).toHaveTextContent("Target 2 of 5");

    play(HIT);
    expect(game()).toHaveTextContent("1 hit / 3 to win");
    expect(game()).toHaveTextContent("2 more to win · 3 left");
    expect(game()).toHaveTextContent("Target 3 of 5");
    expect(
      within(game()).getByRole("listitem", { name: "Target 1: missed" }),
    ).toBeInTheDocument();
    expect(
      within(game()).getByRole("listitem", { name: "Target 2: hit" }),
    ).toBeInTheDocument();
    expect(
      within(game()).getByRole("listitem", { name: "Target 3: up now" }),
    ).toBeInTheDocument();
  });

  test("hitting again before the camera is back still moves to the next target", () => {
    renderApp();
    const first = lastTarget();
    hit();
    land(HIT);
    hit();
    expect(lastTarget()).not.toBe(first);
    land(HIT);
    expect(game()).toHaveTextContent("2 hit / 3 to win");
  });

  test("3 of 5 wins a normal game; Play again starts another and the session keeps count", () => {
    renderApp();
    for (let i = 0; i < 3; i++) play(HIT);
    expect(game()).toHaveTextContent("Goal reached");
    for (let i = 0; i < 2; i++) play(MISS);

    expect(game()).toHaveTextContent("You win!");
    expect(game()).toHaveTextContent("3 of 5 hit · 3 to win");
    expect(game()).toHaveTextContent("Games won 1 of 1");
    // the range is clear until the next game
    expect(lastTarget()).toBeNull();
    hit();
    expect(game()).toHaveTextContent("3 of 5 hit");

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(lastTarget()).not.toBeNull();
    expect(game()).toHaveTextContent("Target 1 of 5");
    expect(game()).toHaveTextContent("0 hit / 3 to win");
    expect(game()).toHaveTextContent("Games won 1 of 1");
  });

  test("2 of 5 loses a normal game, and says so once it is out of reach", () => {
    renderApp();
    for (let i = 0; i < 3; i++) play(MISS);
    expect(game()).toHaveTextContent("Out of reach: needed 3");
    for (let i = 0; i < 2; i++) play(HIT);
    expect(game()).toHaveTextContent("Not this time");
    expect(game()).toHaveTextContent("Games won 0 of 1");
  });

  test("3 of 5 is not enough in advanced; 4 is", () => {
    renderApp("/?mode=advanced");
    const airHit = { air: true, hit: true };
    const airMiss = { air: true, hit: false, shortYards: 40 };
    for (let i = 0; i < 3; i++) play(airHit);
    for (let i = 0; i < 2; i++) play(airMiss);
    expect(game()).toHaveTextContent("Not this time");
    expect(game()).toHaveTextContent("Missed: fell 40 yd short");

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    for (let i = 0; i < 4; i++) play(airHit);
    play(airMiss);
    expect(game()).toHaveTextContent("You win!");
    expect(game()).toHaveTextContent("Games won 1 of 2");
  });

  test("Restart begins the game again with a new target", () => {
    renderApp();
    play(HIT);
    const before = lastTarget();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(lastTarget()).not.toBe(before);
    expect(game()).toHaveTextContent("Target 1 of 5");
    expect(game()).toHaveTextContent("0 hit / 3 to win");
  });
});

describe("club selection", () => {
  const lastClub = () => simulator.setClub.mock.calls.at(-1)[0];
  const carryInput = (settings, name) =>
    settings.getByRole("spinbutton", { name: `${name} carry in yards` });
  // Hit sits behind the open Settings dialog in these tests.
  const hitBehindDialog = () =>
    fireEvent.click(
      screen.getByRole("button", { name: /^hit$/i, hidden: true }),
    );
  const pick = (settings, name) =>
    fireEvent.click(settings.getByRole("button", { name: new RegExp(name) }));

  test("the driver is in hand on load, teed up", () => {
    renderPanel();
    expect(lastClub().id).toBe("driver");
    expect(lastClub().teed).toBe(true);
    expect(screen.getByText("Driver · 10.5°")).toBeInTheDocument();
    expect(clubScenes.above.options.club.id).toBe("driver");
  });

  test("the club chip on the panel opens the bag and picks a club", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Driver · 10\.5°/ }));
    const bag = within(screen.getByRole("listbox"));
    expect(bag.getByRole("option", { name: /Driver/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(bag.getByRole("option", { name: /7 iron/ }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(lastClub().id).toBe("7i");
    expect(address()).toContain("club=7i");
    expect(screen.getByText("7 iron · 34°")).toBeInTheDocument();
  });

  test("Reset is an icon at the top of the panel", () => {
    renderPanel("/?face=3");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(address()).not.toContain("face=");
  });

  test("Settings lists every kind of club with its loft and a carry distance", () => {
    renderPanel();
    const settings = openSettings();
    for (const group of ["Fairway woods", "Hybrids", "Irons", "Wedges"]) {
      expect(settings.getByRole("group", { name: group })).toBeInTheDocument();
    }
    expect(
      settings.getByRole("button", { name: /Driver.*10\.5°/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      settings.getByRole("button", { name: /7 iron.*34°/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      settings.getByRole("button", { name: /Lob wedge.*60°/ }),
    ).toBeInTheDocument();
    // the bag gets shorter club by club
    const yards = (name) => Number(carryInput(settings, name).value);
    expect(yards("Driver")).toBeGreaterThan(yards("3 wood"));
    expect(yards("3 wood")).toBeGreaterThan(yards("7 iron"));
    expect(yards("7 iron")).toBeGreaterThan(yards("Lob wedge"));
    expect(yards("Lob wedge")).toBeGreaterThan(50);
    expect(settings.getByText(/sea level, 68°F, no wind/)).toBeInTheDocument();
  });

  test("picking a club puts it in hand: its own speed and attack angle, off the turf, in the URL", () => {
    renderPanel("/?speed=120&attack=3&loft=2&face=2");
    const settings = openSettings();
    pick(settings, "7 iron");

    expect(address()).toContain("club=7i");
    // speed, attack and loft belonged to the driver; face is the golfer's
    expect(address()).not.toContain("speed=");
    expect(address()).not.toContain("attack=");
    expect(address()).not.toContain("loft=");
    expect(address()).toContain("face=2");
    expect(lastClub().id).toBe("7i");
    expect(lastClub().teed).toBe(false);
    expect(screen.getByText("7 iron · 34°")).toBeInTheDocument();
    expect(valueOf("Swing speed")).toBe(76);
    expect(valueOf("Attack angle")).toBe(-4);
    // both 3D views are rebuilt for the new club
    expect(clubScenes.above.options.club.id).toBe("7i");
    expect(clubScenes.toe.options.club.id).toBe("7i");

    hitBehindDialog();
    expect(lastLaunch().initSpeedMPH).toBe(76);
    // an iron launches higher and spins far more than a driver
    expect(lastLaunch().initVerticalAngleDegrees).toBeGreaterThan(15);
    expect(lastLaunch().initBackspinRPM).toBeGreaterThan(5000);
  });

  test("the club is read from the URL, and a name that is no club means the driver", () => {
    renderPanel("/?club=sw");
    expect(lastClub().id).toBe("sw");
    expect(screen.getByText("Sand wedge · 54°")).toBeInTheDocument();
  });

  test("an unknown club in the URL is the driver", () => {
    renderPanel("/?club=putter");
    expect(lastClub().id).toBe("driver");
  });

  test("the swing-speed control covers the club's own range", () => {
    renderPanel("/?club=7i");
    selectBox("swing speed");
    command("ArrowLeft");
    expect(valueOf("Swing speed")).toBe(75);
    typeValue("Swing speed", "10");
    expect(valueOf("Swing speed")).toBe(64);
    typeValue("Swing speed", "999");
    expect(valueOf("Swing speed")).toBe(112);
  });

  test("typing a distance sets that club's swing speed for the session", () => {
    renderPanel("/?club=7i");
    const settings = openSettings();
    const before = Number(carryInput(settings, "7 iron").value);
    const input = carryInput(settings, "7 iron");
    fireEvent.change(input, { target: { value: String(before + 20) } });
    fireEvent.blur(input);

    expect(Number(carryInput(settings, "7 iron").value)).toBe(before + 20);
    expect(valueOf("Swing speed")).toBeGreaterThan(76);
    // session only: nothing about it goes in the URL
    expect(address()).not.toContain("speed=");
    hitBehindDialog();
    expect(lastLaunch().initSpeedMPH).toBeGreaterThan(76);

    // other clubs are untouched, and it survives switching away and back
    pick(settings, "Driver");
    expect(valueOf("Swing speed")).toBe(95);
    pick(settings, "7 iron");
    expect(valueOf("Swing speed")).toBeGreaterThan(76);

    fireEvent.click(settings.getByRole("button", { name: "Reset distances" }));
    expect(Number(carryInput(settings, "7 iron").value)).toBe(before);
    expect(valueOf("Swing speed")).toBe(76);
  });

  test("a distance the club cannot reach is held to what it can", () => {
    renderPanel();
    const settings = openSettings();
    const input = carryInput(settings, "Lob wedge");
    fireEvent.change(input, { target: { value: "300" } });
    fireEvent.blur(input);
    expect(Number(carryInput(settings, "Lob wedge").value)).toBeLessThan(120);
  });

  test("game targets are ones the club in hand can reach", () => {
    renderPanel("/?mode=game&club=lw");
    const target = simulator.setTarget.mock.calls.at(-1)[0];
    expect(target.z).toBeLessThan(120);
    expect(target.z).toBeGreaterThan(55);
  });

  test("a ball in the air when the club changes is not scored against the new target", () => {
    renderPanel("/?mode=game");
    hit();
    const settings = openSettings();
    pick(settings, "Lob wedge");
    act(() =>
      callbacks.onResult({
        shape: "Straight",
        carryYards: 200,
        runYards: 20,
        totalYards: 220,
        offlineYards: 0,
        apexYards: 25,
        target: { hit: false, longYards: 120, rightYards: 0 },
      }),
    );
    const game = screen.getByRole("status", { name: "Game", hidden: true });
    expect(game).toHaveTextContent("0 hit / 3 to win");
    expect(game).not.toHaveTextContent("Missed");

    // the next shot, hit at the new target, counts
    hitBehindDialog();
    act(() =>
      callbacks.onResult({
        shape: "Straight",
        carryYards: 80,
        runYards: 1,
        totalYards: 81,
        offlineYards: 0,
        apexYards: 20,
        target: { hit: true, longYards: 1, rightYards: 0 },
      }),
    );
    expect(game).toHaveTextContent("1 hit / 3 to win");
  });

  test("Escape in a distance field puts the number back and leaves Settings open", () => {
    renderPanel();
    const settings = openSettings();
    const input = carryInput(settings, "7 iron");
    const before = input.value;
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(carryInput(settings, "7 iron").value).toBe(before);
  });
});

describe("bird's-eye view", () => {
  const landed = {
    shape: "Fade",
    carryYards: 200.4,
    carryOfflineYards: 11.6,
    runYards: 20,
    totalYards: 220,
    offlineYards: 12,
    apexYards: 25,
  };
  const toggle = () => screen.getByRole("button", { name: "Bird's-eye view" });
  const tag = (id) => document.querySelector(`[data-tag="${id}"]`);
  const marks = {
    landing: { x: 200, y: 120 },
    rest: { x: 205, y: 100 },
    apex: { x: 190, y: 200 },
    target: { x: 180, y: 160 },
  };

  test("is a camera mode, the same button on laptop and phone", () => {
    for (const desktop of [true, false]) {
      viewport(desktop);
      const { unmount } = renderApp("/?mode=practice");
      expect(toggle()).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-pressed", "true");
      expect(simulator.setOverhead).toHaveBeenLastCalledWith(
        true,
        expect.objectContaining({ top: expect.any(Number) }),
      );
      fireEvent.click(toggle());
      expect(simulator.setOverhead).toHaveBeenLastCalledWith(
        false,
        expect.any(Object),
      );
      unmount();
    }
    // there is no bird's-eye card any more
    expect(
      screen.queryByRole("region", { name: "Bird's-eye view" }),
    ).toBeNull();
  });

  test("pins the shot's numbers where the scene says they fell, and the target's on its ring", () => {
    renderApp("/");
    act(() => callbacks.onResult(landed));
    fireEvent.click(toggle());
    expect(tag("carry")).toBeNull();
    act(() => callbacks.onOverhead(marks));
    expect(tag("carry")).toHaveTextContent("200 yd carry · 12 R");
    expect(tag("carry")).toHaveStyle({ left: "200px", top: "120px" });
    expect(tag("run")).toHaveTextContent("+20 run → 220 yd");
    expect(tag("apex")).toHaveTextContent("apex 25 yd");
    const aimedAt = simulator.setTarget.mock.calls.at(-1)[0];
    expect(tag("target")).toHaveTextContent(
      `Target ${aimedAt.distanceYards} yd`,
    );
    // the scene says when it is no longer overhead
    act(() => callbacks.onOverhead(null));
    expect(tag("carry")).toBeNull();
  });

  test("Hit goes back behind the golfer", () => {
    renderApp("/?mode=practice");
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    hit();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(simulator.setOverhead).toHaveBeenLastCalledWith(
      false,
      expect.any(Object),
    );
  });

  test("is framed again when there is a new shot to show", () => {
    renderApp("/?mode=practice");
    fireEvent.click(toggle());
    const calls = simulator.setOverhead.mock.calls.length;
    act(() => callbacks.onResult(landed));
    expect(simulator.setOverhead.mock.calls.length).toBeGreaterThan(calls);
    expect(simulator.setOverhead).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ top: expect.any(Number) }),
    );
  });

  test("turning it on or off sends setting_changed", () => {
    renderApp("/?mode=practice");
    fireEvent.click(toggle());
    expect(track).toHaveBeenCalledWith("setting_changed", {
      setting: "birds_eye",
      from: "off",
      to: "on",
    });
  });
});

describe("what each mode is", () => {
  const about = (name) => screen.getByRole("button", { name });

  test("one (i) beside the switch says what both are, only when clicked", () => {
    renderApp();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(about("About the modes"));
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/^Practice\. No targets/);
    expect(note).toHaveTextContent("nothing is scored");
    expect(note).toHaveTextContent("Game. 5 targets");
    expect(note).toHaveTextContent("hit 3 to win");
    expect(note).toHaveTextContent("hit 4 to win");
    expect(about("About the modes")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(about("About the modes"));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(about("About the modes"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  test("on laptops the switch sits in the panel's top row, beside the shot shape", () => {
    renderApp();
    const panel = screen.getByLabelText("Club at impact");
    expect(
      within(panel).getByRole("group", { name: "Mode" }),
    ).toBeInTheDocument();
    // Reset is on the club view from above
    expect(
      screen.getByRole("button", { name: "Reset" }).closest(".club-pad"),
    ).not.toBeNull();
  });

  test("asking about the modes does not switch", () => {
    renderApp();
    fireEvent.click(about("About the modes"));
    expect(screen.getByRole("button", { name: "Game" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("players and leaderboard", () => {
  const game = () => screen.getByRole("status", { name: "Game" });
  const HIT = { hit: true, longYards: 1, rightYards: 0 };
  const MISS = { hit: false, longYards: -9.2, rightYards: -4.1 };
  const play = (targetResult) => {
    hit();
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
    act(() => callbacks.onState("address"));
  };
  const playGame = (hits) => {
    for (let i = 0; i < 5; i++) play(i < hits ? HIT : MISS);
  };

  const respond = (status, body = {}) =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    });
  // The API, faked at fetch: routes are keyed "METHOD /path".
  const api = (routes) =>
    global.fetch.mockImplementation((url, options = {}) => {
      const route =
        routes[`${options.method || "GET"} ${new URL(url).pathname}`];
      return route
        ? route(new URL(url), options)
        : Promise.reject(new TypeError("offline"));
    });
  const requests = (method, path) =>
    global.fetch.mock.calls.filter(
      ([url, options = {}]) =>
        (options.method || "GET") === method && new URL(url).pathname === path,
    );
  const shotsSent = () =>
    requests("POST", "/shots").map(([, options]) => JSON.parse(options.body));

  const SACHAL = { id: "p1", name: "Sachal", key: "secret" };
  const savePlayer = () =>
    window.localStorage.setItem("golf.player", JSON.stringify(SACHAL));
  const row = (rank, id, name, pct) => ({
    rank,
    id,
    name,
    hits: pct,
    attempts: 100,
    pct,
    games: 20,
    bestStreak: 30 - rank,
  });
  const board = (overrides = {}) => ({
    mode: "normal",
    period: "all",
    minAttempts: 15,
    rows: [],
    warmingUp: [],
    me: null,
    passes: null,
    ...overrides,
  });

  const saveForm = () =>
    within(game()).getByRole("form", { name: "Save to the leaderboard" });
  const typeName = (value) =>
    fireEvent.change(
      within(saveForm()).getByRole("textbox", { name: "Name" }),
      {
        target: { value },
      },
    );

  test("a finished game with no name saved asks for one; saving it sends the game and shows the recovery code once", async () => {
    api({
      "POST /players": () =>
        respond(201, { ...SACHAL, recoveryCode: "TEE-4821" }),
      "POST /shots": () => respond(201),
      "GET /leaderboard": () =>
        respond(
          200,
          board({
            me: { ...row(null, "p1", "Sachal", 0), attempts: 5, ranked: false },
          }),
        ),
    });
    renderApp();
    play(HIT);
    expect(
      screen.queryByRole("form", { name: "Save to the leaderboard" }),
    ).not.toBeInTheDocument();
    for (let i = 0; i < 2; i++) play(HIT);
    for (let i = 0; i < 2; i++) play(MISS);

    expect(saveForm()).toHaveTextContent("3 of 5. Save it to the leaderboard?");
    // nothing leaves the browser before there is a name
    expect(global.fetch).not.toHaveBeenCalled();

    typeName("Sachal");
    fireEvent.click(within(saveForm()).getByRole("button", { name: "Save" }));

    expect(await within(game()).findByText("TEE-4821")).toBeInTheDocument();
    expect(game()).toHaveTextContent(
      "Write this down to use your name on another device",
    );
    expect(JSON.parse(requests("POST", "/players")[0][1].body)).toEqual({
      name: "Sachal",
    });
    expect(JSON.parse(window.localStorage.getItem("golf.player"))).toEqual(
      SACHAL,
    );

    await waitFor(() => expect(shotsSent()).toHaveLength(5));
    expect(shotsSent().map((shot) => shot.hit)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(new Set(shotsSent().map((shot) => shot.gameId)).size).toBe(1);
    expect(shotsSent()[0]).toMatchObject({ mode: "normal", club: "driver" });
    expect(shotsSent()[0].targetYards).toBeGreaterThanOrEqual(140);
    expect(requests("POST", "/shots")[0][1].headers.Authorization).toBe(
      "Bearer secret",
    );

    fireEvent.click(within(game()).getByRole("button", { name: "Got it" }));
    expect(game()).not.toHaveTextContent("TEE-4821");
    expect(
      await within(game()).findByText(
        "Warming up: 10 more targets to be ranked",
      ),
    ).toBeInTheDocument();
    expect(within(game()).getByLabelText("Playing as Sachal")).toBeVisible();
  });

  test("a taken or unusable name is said next to the field, and the game is still there", async () => {
    api({ "POST /players": () => respond(409, { error: "name_taken" }) });
    renderApp();
    playGame(2);
    typeName("Varun");
    fireEvent.click(within(saveForm()).getByRole("button", { name: "Save" }));
    expect(await within(saveForm()).findByRole("alert")).toHaveTextContent(
      "That name is taken",
    );

    api({ "POST /players": () => respond(422, { error: "invalid_name" }) });
    fireEvent.click(within(saveForm()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(saveForm()).getByRole("alert")).toHaveTextContent(
        "2 to 16 characters",
      ),
    );

    // and with the API down
    api({});
    fireEvent.click(within(saveForm()).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(saveForm()).getByRole("alert")).toHaveTextContent(
        "Couldn't reach the leaderboard",
      ),
    );
    expect(window.localStorage.getItem("golf.player")).toBeNull();
    expect(game()).toHaveTextContent("Not this time");
  });

  test("an existing name is taken up with its recovery code", async () => {
    api({
      "POST /players/recover": (_url, options) =>
        JSON.parse(options.body).recoveryCode === "TEE-4821"
          ? respond(200, SACHAL)
          : respond(401),
      "POST /shots": () => respond(201),
    });
    renderApp();
    playGame(3);
    fireEvent.click(
      within(saveForm()).getByRole("button", {
        name: "Already have a name? Use recovery code",
      }),
    );
    typeName("Sachal");
    const code = within(saveForm()).getByRole("textbox", {
      name: "Recovery code",
    });
    fireEvent.change(code, { target: { value: "WRONG" } });
    fireEvent.click(
      within(saveForm()).getByRole("button", { name: "Use name" }),
    );
    expect(await within(saveForm()).findByRole("alert")).toHaveTextContent(
      "don't match",
    );

    fireEvent.change(code, { target: { value: "TEE-4821" } });
    fireEvent.click(
      within(saveForm()).getByRole("button", { name: "Use name" }),
    );
    expect(
      await within(game()).findByLabelText("Playing as Sachal"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Save to the leaderboard" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(shotsSent()).toHaveLength(5));
  });

  test("with a name saved every game shot is sent as it lands, and the finished game says where the player stands", async () => {
    savePlayer();
    api({
      "POST /shots": () => respond(201),
      "GET /leaderboard": () =>
        respond(
          200,
          board({
            me: { ...row(12, "p1", "Sachal", 58), ranked: true },
            passes: { name: "Varun", hitsNeeded: 1 },
          }),
        ),
    });
    renderApp();
    expect(within(game()).getByLabelText("Playing as Sachal")).toBeVisible();
    play(HIT);
    await waitFor(() => expect(shotsSent()).toHaveLength(1));
    expect(requests("GET", "/leaderboard")).toHaveLength(0);

    for (let i = 0; i < 4; i++) play(MISS);
    expect(
      await within(game()).findByText("Rank 12 · 58% hit"),
    ).toBeInTheDocument();
    expect(game()).toHaveTextContent("One more hit passes Varun");
    expect(shotsSent()).toHaveLength(5);
    const asked = new URL(requests("GET", "/leaderboard")[0][0]).searchParams;
    expect(Object.fromEntries(asked)).toEqual({
      mode: "normal",
      period: "all",
      player: "p1",
    });
    expect(
      screen.queryByRole("form", { name: "Save to the leaderboard" }),
    ).not.toBeInTheDocument();

    // a new game is a new game id
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(game()).not.toHaveTextContent("Rank 12");
    play(HIT);
    await waitFor(() => expect(shotsSent()).toHaveLength(6));
    expect(shotsSent()[5].gameId).not.toBe(shotsSent()[0].gameId);
  });

  test("practice shots are never sent", async () => {
    savePlayer();
    api({ "POST /shots": () => respond(201) });
    renderApp("/?mode=practice");
    play(undefined);
    play(HIT);
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("golf.shots")).toBeNull();
  });

  test("with the API down the game plays as usual and the shots go once it is back", async () => {
    savePlayer();
    renderApp();
    playGame(3);
    expect(game()).toHaveTextContent("You win!");
    expect(game()).toHaveTextContent("Games won 1 of 1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem("golf.shots")),
      ).toHaveLength(5),
    );

    global.fetch.mockClear();
    api({ "POST /shots": () => respond(201) });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("golf.shots"))).toEqual([]),
    );
    expect(shotsSent().map((shot) => shot.hit)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  test("shots left over from an earlier visit are sent on load", async () => {
    savePlayer();
    window.localStorage.setItem(
      "golf.shots",
      JSON.stringify([
        {
          gameId: "g0",
          mode: "normal",
          club: "driver",
          targetYards: 210,
          hit: true,
        },
      ]),
    );
    api({ "POST /shots": () => respond(201) });
    renderApp();
    await waitFor(() => expect(shotsSent()).toHaveLength(1));
    expect(shotsSent()[0].gameId).toBe("g0");
  });

  test("a won game sets off the celebration, bigger for 5 of 5, and a lost one does not", () => {
    simulator.celebrate = jest.fn();
    renderApp();
    playGame(2);
    expect(simulator.celebrate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    for (let i = 0; i < 2; i++) play(MISS);
    for (let i = 0; i < 2; i++) play(HIT);
    expect(simulator.celebrate).not.toHaveBeenCalled();
    play(HIT);
    expect(simulator.celebrate).toHaveBeenCalledTimes(1);
    expect(simulator.celebrate).toHaveBeenLastCalledWith("win");

    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    playGame(5);
    expect(simulator.celebrate).toHaveBeenCalledTimes(2);
    expect(simulator.celebrate).toHaveBeenLastCalledWith("perfect");
  });

  const openLeaderboard = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    return within(await screen.findByRole("dialog"));
  };

  test("just outside the top rows, the neighbour already listed is not shown twice", async () => {
    savePlayer();
    api({
      "GET /leaderboard": () =>
        respond(
          200,
          board({
            rows: [row(1, "p7", "Varun", 71), row(2, "p8", "Aanchal", 64.4)],
            me: {
              ...row(3, "p1", "Sachal", 41),
              ranked: true,
              neighbours: [
                row(2, "p8", "Aanchal", 64.4),
                row(4, "p6", "Behind", 40),
              ],
            },
          }),
        ),
    });
    renderApp();
    const dialog = await openLeaderboard();
    await dialog.findByText("Varun");
    expect(dialog.getAllByText("Aanchal")).toHaveLength(1);
    expect(dialog.getByText("Behind")).toBeInTheDocument();
  });

  test("the trophy button opens the leaderboard: ranked rows, the player's own row with its neighbours, and those warming up", async () => {
    savePlayer();
    api({
      "GET /leaderboard": () =>
        respond(
          200,
          board({
            rows: [row(1, "p7", "Varun", 71), row(2, "p8", "Aanchal", 64.4)],
            warmingUp: [
              { id: "p9", name: "Newbie", hits: 2, attempts: 5, games: 1 },
            ],
            me: {
              ...row(31, "p1", "Sachal", 41),
              ranked: true,
              neighbours: [
                row(30, "p5", "Ahead", 42),
                row(32, "p6", "Behind", 40),
              ],
            },
          }),
        ),
    });
    renderApp();
    const dialog = await openLeaderboard();
    expect(dialog.getByText("Loading…")).toBeInTheDocument();

    const cells = async (name) =>
      within((await dialog.findByText(name)).closest("tr"))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    expect(await cells("Varun")).toEqual(["1", "Varun", "71%", "20", "29"]);
    expect(await cells("Aanchal")).toEqual(["2", "Aanchal", "64%", "20", "28"]);
    expect(
      dialog.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["#Rank", "Name", "Hit %", "Games", "Best Streak"]);

    // own row, outside the top rows, between the players either side of it
    const names = dialog
      .getAllByRole("row")
      .slice(1)
      .map((line) => line.cells[1]?.textContent);
    expect(names).toEqual([
      "Varun",
      "Aanchal",
      "Ahead",
      "Sachal (you)",
      "Behind",
    ]);
    // a divider sets the player's part of the board off from the top rows
    expect(
      screen.getByRole("dialog").querySelector("tr[aria-hidden]"),
    ).toHaveTextContent("⋯");
    expect(dialog.getByText("Sachal").closest("tr")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(dialog.getByText("Varun").closest("tr")).not.toHaveAttribute(
      "aria-current",
    );

    const warming = within(dialog.getByRole("region", { name: "Warming up" }));
    expect(warming.getByRole("listitem")).toHaveTextContent(
      "Newbie2 of 5 hit · 10 to go",
    );

    const asked = new URL(requests("GET", "/leaderboard")[0][0]).searchParams;
    expect(Object.fromEntries(asked)).toEqual({
      mode: "normal",
      period: "all",
      player: "p1",
    });
  });

  test("a name can be saved from the leaderboard before any game is played", async () => {
    api({
      "POST /players": () =>
        respond(201, { ...SACHAL, recoveryCode: "TEE-4821" }),
      "GET /leaderboard": () => respond(200, board({})),
    });
    renderApp();
    const dialog = await openLeaderboard();
    const form = dialog.getByRole("form", { name: "Save to the leaderboard" });
    expect(form).toHaveTextContent("Save a name to get on the board");
    fireEvent.change(within(form).getByLabelText("Name"), {
      target: { value: "Sachal" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(await dialog.findByText("TEE-4821")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("golf.player")).name).toBe(
      "Sachal",
    );
    expect(
      dialog.queryByRole("form", { name: "Save to the leaderboard" }),
    ).not.toBeInTheDocument();
  });

  test("the leaderboard has a board per mode and period", async () => {
    api({
      "GET /leaderboard": (url) =>
        respond(
          200,
          board({
            rows: [
              row(
                1,
                "p7",
                `${url.searchParams.get("mode")} ${url.searchParams.get("period")}`,
                50,
              ),
            ],
          }),
        ),
    });
    renderApp("/?mode=advanced");
    const dialog = await openLeaderboard();
    // opens on the mode being played
    expect(await dialog.findByText("advanced all")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Advanced" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(dialog.getByRole("button", { name: "Normal" }));
    expect(await dialog.findByText("normal all")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "This week" }));
    expect(dialog.getByText("Loading…")).toBeInTheDocument();
    expect(await dialog.findByText("normal week")).toBeInTheDocument();
    // no saved player: none is asked about
    expect(
      new URL(requests("GET", "/leaderboard")[0][0]).searchParams.has("player"),
    ).toBe(false);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("an empty leaderboard and an unreachable one each say so", async () => {
    api({ "GET /leaderboard": () => respond(200, board()) });
    renderApp();
    const dialog = await openLeaderboard();
    expect(
      await dialog.findByText("No one has played yet"),
    ).toBeInTheDocument();

    api({ "GET /leaderboard": () => respond(503) });
    fireEvent.click(dialog.getByRole("button", { name: "Advanced" }));
    expect(
      await dialog.findByText("Leaderboard is unavailable right now"),
    ).toBeInTheDocument();

    api({});
    fireEvent.click(dialog.getByRole("button", { name: "This week" }));
    expect(dialog.getByText("Loading…")).toBeInTheDocument();
    expect(
      await dialog.findByText("Leaderboard is unavailable right now"),
    ).toBeInTheDocument();
  });

  test("a warming-up player is picked out in the warming-up list", async () => {
    savePlayer();
    api({
      "GET /leaderboard": () =>
        respond(
          200,
          board({
            warmingUp: [
              { id: "p1", name: "Sachal", hits: 6, attempts: 10, games: 2 },
            ],
            me: {
              ...row(null, "p1", "Sachal", 60),
              attempts: 10,
              ranked: false,
            },
          }),
        ),
    });
    renderApp();
    const dialog = await openLeaderboard();
    const mine = await dialog.findByRole("listitem");
    expect(mine).toHaveTextContent("Sachal6 of 10 hit · 5 to go");
    expect(mine).toHaveAttribute("aria-current", "true");
    expect(dialog.getByText("No one is ranked yet.")).toBeInTheDocument();
  });
});

describe("analytics events", () => {
  const landed = (target) =>
    act(() =>
      callbacks.onResult({
        shape: "Fade",
        carryYards: 200,
        runYards: 20,
        totalYards: 220,
        offlineYards: 5,
        apexYards: 25,
        target,
      }),
    );
  const play = (target) => {
    hit();
    landed(target);
    act(() => callbacks.onState("address"));
  };
  const sent = (event) =>
    track.mock.calls
      .filter(([name]) => name === event)
      .map(([, props]) => props);

  beforeEach(() => {
    track.mockClear();
    setContext.mockClear();
    reportError.mockClear();
  });

  test("a missed target sends coach_shown with the tip; a hit sends none", () => {
    renderApp("/?speed=120");
    play({ hit: true, longYards: 0, rightYards: 0 });
    expect(sent("coach_shown")).toEqual([]);
    play({ hit: false, longYards: 30, rightYards: 2 });
    const [started] = sent("game_started");
    expect(sent("coach_shown")).toEqual([
      { game_id: started.game_id, mode: "normal", tip: "slower" },
    ]);
  });

  test("the difficulty switch on the card sends setting_changed", () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Difficulty" })).getByRole(
        "button",
        { name: "Advanced" },
      ),
    );
    expect(sent("setting_changed")).toContainEqual({
      setting: "mode",
      from: "normal",
      to: "advanced",
    });
  });

  test("a whole game shares one game id across its events", () => {
    renderApp();
    for (let i = 0; i < 4; i += 1)
      play({ hit: i < 3, longYards: -9, rightYards: 2 });
    play({ hit: true, longYards: 0, rightYards: 0 });

    const [started] = sent("game_started");
    const [finished] = sent("game_finished");
    expect(started.game_id).toBeTruthy();
    expect(finished).toMatchObject({
      game_id: started.game_id,
      hits: 4,
      won: true,
    });
    for (const props of [...sent("target_attempted"), ...sent("shot_landed")]) {
      expect(props.game_id).toBe(started.game_id);
    }
    expect(sent("target_attempted").map((p) => p.target_number)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(sent("target_attempted")[3].miss).toBe("short");
    expect(sent("target_attempted")[0].miss).toBeNull();
  });

  test("a practice shot has no game id and starts no game", () => {
    renderApp("/?mode=practice");
    hit();
    landed(null);
    const [shot] = sent("shot_landed");
    expect(shot).toMatchObject({
      mode: "practice",
      in_game: false,
      game_id: null,
    });
    expect(shot).toHaveProperty("carry_yards", 200);
    expect(shot).toHaveProperty("swing_speed");
    expect(sent("game_started")).toHaveLength(0);
  });

  test("app_ready is sent once the scene is ready, with how long it took", async () => {
    renderApp();
    act(() => callbacks.onReady({ model: "glb" }));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(
        "app_ready",
        expect.objectContaining({ model: "glb", load_ms: expect.any(Number) }),
      ),
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a failed golfer download is reported and still gets app_ready", async () => {
    renderApp();
    act(() => callbacks.onReady({ model: "figure_fallback" }));
    expect(reportError).toHaveBeenCalledWith("model_load_failed");
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(
        "app_ready",
        expect.objectContaining({ model: "figure_fallback" }),
      ),
    );
  });

  test("a scene that cannot be built is reported as no WebGL, then still throws", () => {
    createSimulator.mockImplementationOnce(() => {
      throw new Error("Error creating WebGL context.");
    });
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderApp()).toThrow("WebGL");
    quiet.mockRestore();
    expect(reportError).toHaveBeenCalledWith(
      "webgl_unsupported",
      "Error creating WebGL context.",
    );
  });

  const modeGroup = () => screen.getByRole("group", { name: "Mode" });

  test("switching mode and club each send setting_changed", () => {
    renderApp();
    fireEvent.click(
      within(modeGroup()).getByRole("button", { name: "Practice" }),
    );
    expect(track).toHaveBeenCalledWith("setting_changed", {
      setting: "mode",
      from: "normal",
      to: "practice",
    });
    fireEvent.click(screen.getByRole("button", { name: /Driver · 10\.5°/ }));
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: /7 iron/,
      }),
    );
    expect(track).toHaveBeenCalledWith("setting_changed", {
      setting: "club",
      from: "driver",
      to: "7i",
    });
    expect(sent("setting_changed")).toHaveLength(2);
  });

  test("opening an (i) sends info_opened, and closing it sends nothing", () => {
    renderApp();
    const advanced = screen.getByRole("button", {
      name: "About the modes",
    });
    fireEvent.click(advanced);
    expect(track).toHaveBeenCalledWith("info_opened", { topic: "modes" });
    fireEvent.click(advanced);
    fireEvent.click(
      screen.getByRole("button", { name: /^About swing speed$/i }),
    );
    expect(sent("info_opened")).toHaveLength(2);
  });

  test("a game left part-played is abandoned once, under its own game id", () => {
    renderApp();
    play({ hit: true, longYards: 0, rightYards: 0 });
    play({ hit: false, longYards: -9, rightYards: 2 });
    fireEvent.click(
      within(modeGroup()).getByRole("button", { name: "Practice" }),
    );
    fireEvent.click(within(modeGroup()).getByRole("button", { name: "Game" }));
    fireEvent.click(
      within(modeGroup()).getByRole("button", { name: "Practice" }),
    );

    const [started] = sent("game_started");
    expect(sent("game_abandoned")).toEqual([
      expect.objectContaining({
        game_id: started.game_id,
        mode: "normal",
        club: "driver",
        shots_taken: 2,
      }),
    ]);
  });

  test("a finished game is not abandoned when the next one starts", () => {
    renderApp();
    for (let i = 0; i < 5; i += 1)
      play({ hit: true, longYards: 0, rightYards: 0 });
    fireEvent.click(
      within(modeGroup()).getByRole("button", { name: "Practice" }),
    );
    expect(sent("game_abandoned")).toHaveLength(0);
  });

  test("changing the leaderboard's mode or period sends leaderboard_filter_changed", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "This week" }));
    expect(sent("leaderboard_filter_changed")).toEqual([
      { mode: "normal", period: "week" },
    ]);
    fireEvent.click(dialog.getByRole("button", { name: "Advanced" }));
    expect(sent("leaderboard_filter_changed").at(-1)).toEqual({
      mode: "advanced",
      period: "week",
    });
  });

  describe("sign-up", () => {
    const finishGame = () => {
      for (let i = 0; i < 5; i += 1)
        play({ hit: i < 3, longYards: -9, rightYards: 2 });
    };
    const form = () =>
      screen.getByRole("form", { name: "Save to the leaderboard" });
    const fill = (label, value) =>
      fireEvent.change(within(form()).getByRole("textbox", { name: label }), {
        target: { value },
      });
    const answer = (body) =>
      (global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, status: 201, json: async () => body }),
      ));

    test("the prompt is counted, and a name saved says where it was saved", async () => {
      renderApp();
      finishGame();
      expect(sent("save_name_shown")).toEqual([{ source: "game_card" }]);
      answer({ id: "p1", name: "Ada", key: "k", recoveryCode: "TEE-1" });
      fill("Name", "Ada");
      fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(sent("name_saved")).toEqual([{ source: "game_card" }]),
      );
    });

    test("a failed save says why", async () => {
      renderApp();
      finishGame();
      fill("Name", "Ada");
      fireEvent.click(within(form()).getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(sent("name_save_failed")).toEqual([
          { source: "game_card", reason: "network" },
        ]),
      );
      expect(sent("name_saved")).toHaveLength(0);
    });

    test("a recovery code used on a second device is player_recovered, not a new name", async () => {
      renderApp();
      finishGame();
      fireEvent.click(
        within(form()).getByRole("button", { name: /Already have a name/ }),
      );
      answer({ id: "p1", name: "Ada", key: "k" });
      fill("Name", "Ada");
      fill("Recovery code", "TEE-1");
      fireEvent.click(within(form()).getByRole("button", { name: "Use name" }));
      await waitFor(() =>
        expect(track).toHaveBeenCalledWith("player_recovered"),
      );
      expect(sent("name_saved")).toHaveLength(0);
    });
  });

  test("the viewport is registered for later events", () => {
    viewport(false);
    renderApp();
    expect(setContext).toHaveBeenCalledWith({ viewport: "phone" });
  });
});
