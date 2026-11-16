import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { createSimulator } from "./simulate/main";
import { createClubScene } from "./simulate/club-scene";
import { TURF_PRESETS } from "./simulate/ground";

// jsdom has no WebGL, so the 3D scene can't start under Jest; the fake stands
// in for it and records what the UI asks it to do.
jest.mock("./simulate/main", () => ({ createSimulator: jest.fn() }));
jest.mock("./simulate/club-scene", () => ({
  createClubScene: jest.fn(),
  VIEWS: {
    behind: { label: "Behind" },
    toe: { label: "Toe" },
    above: { label: "Above" },
    face: { label: "Face" },
  },
}));

let simulator;
let callbacks;
let clubScene;

beforeEach(() => {
  simulator = {
    hit: jest.fn(),
    setSide: jest.fn(),
    setAim: jest.fn(),
    setTarget: jest.fn(),
    setViewInset: jest.fn(),
    dispose: jest.fn(),
  };
  clubScene = { update: jest.fn(), setView: jest.fn(), dispose: jest.fn() };
  createClubScene.mockReset();
  createClubScene.mockReturnValue(clubScene);
  createSimulator.mockReset();
  createSimulator.mockImplementation((_container, simCallbacks) => {
    callbacks = simCallbacks;
    return simulator;
  });
});

const renderApp = (url = "/") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <App />
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
const result = () => screen.getByRole("status", { name: "Shot result" });

describe("shot controls", () => {
  test("the panel holds the shot controls and nothing about the session", () => {
    renderApp();
    expect(screen.queryByText(/golf simulator/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("0");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("95");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("0");
    expect(screen.getByLabelText(/attack angle/i)).toHaveValue("0");
    expect(screen.getByLabelText(/loft at impact/i)).toHaveValue("0");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("0");

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

  test("a slider change is used by the very next hit", () => {
    renderApp();
    hit();
    expect(lastLaunch()).toMatchObject({ initSpeedMPH: 95 });
    expect(lastLaunch().initHorizontalAngleDegrees).toBeCloseTo(0);
    expect(lastLaunch().initSpinAngle).toBeCloseTo(0);
    expect(lastHit()[3]).toBe(0);

    fireEvent.change(screen.getByLabelText(/club face/i), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText(/club path/i), {
      target: { value: "-2" },
    });
    fireEvent.change(screen.getByLabelText(/swing speed/i), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText(/^aim/i), {
      target: { value: "-5" },
    });
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

  test("shot setup is read from the URL, and junk values fall back onto the sliders", () => {
    renderApp("/?face=-3&path=5&speed=110&aim=4");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("-3");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("5");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("110");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("4");
  });

  test("out-of-range or junk URL values are clamped", () => {
    renderApp("/?face=abc&path=40&speed=500&aim=-90&side=Banana");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("6");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("140");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("-10");
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

    fireEvent.change(screen.getByLabelText(/attack angle/i), {
      target: { value: "5" },
    });
    expect(screen.getAllByText("5° up").length).toBeGreaterThan(0);
    hit();
    const up = lastLaunch();
    expect(up.initVerticalAngleDegrees).toBeGreaterThan(
      level.initVerticalAngleDegrees,
    );
    expect(up.initBackspinRPM).toBeLessThan(level.initBackspinRPM);

    fireEvent.change(screen.getByLabelText(/loft at impact/i), {
      target: { value: "3" },
    });
    expect(screen.getByText("17.1° (+3)")).toBeInTheDocument();
    hit();
    expect(lastLaunch().initVerticalAngleDegrees).toBeGreaterThan(
      up.initVerticalAngleDegrees,
    );
    expect(lastLaunch().initBackspinRPM).toBeGreaterThan(up.initBackspinRPM);
  });

  test("attack and loft are read from the URL", () => {
    renderApp("/?attack=-3&loft=2");
    expect(screen.getByLabelText(/attack angle/i)).toHaveValue("-3");
    expect(screen.getByLabelText(/loft at impact/i)).toHaveValue("2");
  });

  test("strike location is used by the next hit, shown in words, and read from the URL", () => {
    renderApp("/?speed=105");
    expect(screen.getByText("centre")).toBeInTheDocument();
    hit();
    const centre = lastLaunch();

    fireEvent.change(screen.getByLabelText(/^strike/i), {
      target: { value: "0.75" },
    });
    expect(screen.getByText("0.75 in toe")).toBeInTheDocument();
    hit();
    const toe = lastLaunch();
    expect(toe.smashFactor).toBeLessThan(centre.smashFactor);
    expect(toe.initHorizontalAngleDegrees).toBeGreaterThan(2);
    expect(toe.initSpinAngle).toBeGreaterThan(8);

    fireEvent.change(screen.getByLabelText(/^strike/i), {
      target: { value: "-0.5" },
    });
    expect(screen.getByText("0.5 in heel")).toBeInTheDocument();
  });

  test("strike is read from the URL and clamped", () => {
    renderApp("/?strike=0.75");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("0.75");
  });

  test("a junk or out-of-range strike falls back onto the slider", () => {
    renderApp("/?strike=9");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("1");
  });

  test("aiming shows the stance in the scene before the shot", () => {
    renderApp();
    fireEvent.change(screen.getByLabelText(/^aim/i), {
      target: { value: "6" },
    });
    expect(simulator.setAim).toHaveBeenLastCalledWith(6);
  });

  test("Reset clears the shot but keeps the session settings", () => {
    renderApp(
      "/?face=3&path=-2&speed=120&aim=5&attack=4&loft=-2&strike=0.5&side=Left&turf=firm&mode=game",
    );
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("0");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("95");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("0");
    expect(screen.getByLabelText(/attack angle/i)).toHaveValue("0");
    expect(screen.getByLabelText(/loft at impact/i)).toHaveValue("0");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("0");

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
    expect(screen.getByLabelText(/club face/i)).toHaveValue("2");
    press("q");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("1");

    press("a");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("-1");
    press("D");
    press("d");
    expect(screen.getByLabelText(/club path/i)).toHaveValue("1");

    press("w");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("96");
    press("s");
    press("s");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("94");

    press("c");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("1");
    press("z");
    press("z");
    expect(screen.getByLabelText(/^aim/i)).toHaveValue("-1");

    press("t");
    press("t");
    expect(screen.getByLabelText(/attack angle/i)).toHaveValue("2");
    press("g");
    expect(screen.getByLabelText(/attack angle/i)).toHaveValue("1");

    press("y");
    expect(screen.getByLabelText(/loft at impact/i)).toHaveValue("1");
    press("h");
    press("h");
    expect(screen.getByLabelText(/loft at impact/i)).toHaveValue("-1");

    press("n");
    press("n");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("0.5");
    press("b");
    press("b");
    press("b");
    expect(screen.getByLabelText(/^strike/i)).toHaveValue("-0.25");
  });

  test("a control stops at the end of its range", () => {
    renderApp("/?face=6&speed=80");
    press("e");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("6");
    press("s");
    expect(screen.getByLabelText(/swing speed/i)).toHaveValue("80");
  });

  test("Space hits with the current setup and R resets it", () => {
    renderApp();
    press("e");
    press(" ");
    expect(simulator.hit).toHaveBeenCalledTimes(1);
    expect(lastLaunch().initHorizontalAngleDegrees).toBeGreaterThan(0);

    press("r");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
  });

  test("shortcuts stand down for modifier combos and while Settings is open", () => {
    renderApp();
    press("r", { metaKey: true });
    press("e", { ctrlKey: true });
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");

    openSettings();
    press("e");
    press(" ");
    expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
    expect(simulator.hit).not.toHaveBeenCalled();
  });

  test("the keys are discoverable from the controls themselves", () => {
    renderApp();
    expect(screen.getByLabelText(/club face/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: Q closes · E opens",
    );
    expect(screen.getByLabelText(/club path/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: A out-to-in · D in-to-out",
    );
    expect(screen.getByLabelText(/swing speed/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: S slower · W faster",
    );
    expect(screen.getByLabelText(/^aim/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: Z left · C right",
    );
    expect(screen.getByLabelText(/attack angle/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: G more down · T more up",
    );
    expect(screen.getByLabelText(/loft at impact/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: H less loft · Y more loft",
    );
    expect(screen.getByLabelText(/^strike/i)).toHaveAttribute(
      "data-tooltip-content",
      "Keys: B toward heel · N toward toe",
    );
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

describe("club view", () => {
  const club = () => screen.getByRole("img", { name: /^Driver at impact/ });
  const posed = () => clubScene.update.mock.calls.at(-1)[0];
  const region = () =>
    within(screen.getByRole("region", { name: "Club at impact" }));

  test("a 3D close-up sits under the controls and is posed from the current setup", () => {
    renderApp("/?face=2&path=-1&speed=100");
    expect(club()).toHaveAccessibleName(
      "Driver at impact: face 2° open, path 1° out-to-in, ball starts 1.5° right, aim straight, attack level, 14.5° of loft, launches at 12.4° with 2815 rpm of backspin, struck in the centre",
    );
    expect(posed()).toMatchObject({
      faceDegrees: 2,
      pathDegrees: -1,
      aimDegrees: 0,
      strikeCm: 0,
      mirror: 1,
    });
    expect(region().getByText("2° open")).toBeInTheDocument();
    expect(region().getByText("1° out-to-in")).toBeInTheDocument();
    expect(region().getByText("1.5° right")).toBeInTheDocument();
  });

  test("the club is re-posed as each control changes", () => {
    renderApp();
    press("e");
    press("e");
    press("a");
    expect(posed()).toMatchObject({ faceDegrees: 2, pathDegrees: -1 });

    press("c");
    expect(posed()).toMatchObject({
      aimDegrees: 1,
      faceDegrees: 3,
      pathDegrees: 0,
    });

    const level = posed();
    press("t");
    press("y");
    expect(posed().attackDegrees).toBe(1);
    expect(posed().loftTiltDegrees).toBeGreaterThan(level.loftTiltDegrees);

    press("n");
    expect(posed().strikeCm).toBeCloseTo(0.635);
    expect(club()).toHaveAccessibleName(/struck 0\.25 in toe side$/);
  });

  test("a left-hander's club is mirrored", () => {
    renderApp("/?face=2&side=Left");
    expect(posed()).toMatchObject({ mirror: -1, faceDegrees: -2 });
  });

  test("the angle buttons move the camera", () => {
    renderApp();
    const angles = region().getByRole("group", { name: "Camera angle" });
    expect(
      within(angles).getByRole("button", { name: "Behind" }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const [label, name] of [
      ["Toe", "toe"],
      ["Above", "above"],
      ["Face", "face"],
      ["Behind", "behind"],
    ]) {
      fireEvent.click(within(angles).getByRole("button", { name: label }));
      expect(clubScene.setView).toHaveBeenLastCalledWith(name);
      expect(
        within(angles).getByRole("button", { name: label }),
      ).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("the view can be enlarged and shrunk again", () => {
    renderApp();
    fireEvent.click(
      region().getByRole("button", { name: "Enlarge club view" }),
    );
    expect(
      region().getByRole("button", { name: "Shrink club view" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(region().getByRole("button", { name: "Shrink club view" }));
    expect(
      region().getByRole("button", { name: "Enlarge club view" }),
    ).toBeInTheDocument();
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
