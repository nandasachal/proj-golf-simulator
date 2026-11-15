import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { createSimulator } from "./simulate/main";

// jsdom has no WebGL, so the 3D scene can't start under Jest; the fake stands
// in for it and records what the UI asks it to do.
jest.mock("./simulate/main", () => ({ createSimulator: jest.fn() }));

let simulator;
let callbacks;

beforeEach(() => {
  simulator = {
    hit: jest.fn(),
    setSide: jest.fn(),
    setViewInset: jest.fn(),
    dispose: jest.fn(),
  };
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

const lastLaunch = () => simulator.hit.mock.calls.at(-1)[0];

test("renders the title and the three shot controls", () => {
  renderApp();
  expect(screen.getAllByText(/golf simulator/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
  expect(screen.getByLabelText(/club path/i)).toHaveValue("0");
  expect(screen.getByLabelText(/swing speed/i)).toHaveValue("95");
});

test("a slider change is used by the very next hit", () => {
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: /hit/i }));
  expect(lastLaunch()).toMatchObject({ initSpeedMPH: 95 });
  expect(lastLaunch().initHorizontalAngleDegrees).toBeCloseTo(0);
  expect(lastLaunch().initSpinAngle).toBeCloseTo(0);

  fireEvent.change(screen.getByLabelText(/club face/i), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByLabelText(/club path/i), {
    target: { value: "-2" },
  });
  fireEvent.change(screen.getByLabelText(/swing speed/i), {
    target: { value: "120" },
  });
  expect(screen.getByText("4° open")).toBeInTheDocument();
  expect(screen.getByText("2° out-to-in")).toBeInTheDocument();
  expect(screen.getByText("120 mph")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /hit/i }));
  const launch = lastLaunch();
  expect(launch.initSpeedMPH).toBe(120);
  // Open face, out-to-in path: starts right (positive) and curves right
  // (negative spin angle) for a right-hander.
  expect(launch.initHorizontalAngleDegrees).toBeGreaterThan(2);
  expect(launch.initSpinAngle).toBeLessThan(-10);
  expect(simulator.hit.mock.calls.at(-1)[1]).toBe("Right");
});

test("shot setup is read from the URL", () => {
  renderApp("/?face=-3&path=5&speed=110&side=Left");
  expect(screen.getByLabelText(/club face/i)).toHaveValue("-3");
  expect(screen.getByLabelText(/club path/i)).toHaveValue("5");
  expect(screen.getByLabelText(/swing speed/i)).toHaveValue("110");
  expect(screen.getByRole("button", { name: /left-handed/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("out-of-range or junk URL values fall back onto the sliders", () => {
  renderApp("/?face=abc&path=40&speed=500&side=Banana");
  expect(screen.getByLabelText(/club face/i)).toHaveValue("0");
  expect(screen.getByLabelText(/club path/i)).toHaveValue("6");
  expect(screen.getByLabelText(/swing speed/i)).toHaveValue("140");
  expect(screen.getByRole("button", { name: /right-handed/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  fireEvent.click(screen.getByRole("button", { name: /hit/i }));
  expect(lastLaunch().initSpeedMPH).toBe(140);
});

test("switching dominant side tells the scene and mirrors the next launch", () => {
  renderApp("/?face=4");
  fireEvent.click(screen.getByRole("button", { name: /left-handed/i }));
  expect(simulator.setSide).toHaveBeenLastCalledWith("Left");

  fireEvent.click(screen.getByRole("button", { name: /hit/i }));
  expect(lastLaunch().initHorizontalAngleDegrees).toBeLessThan(0);
  expect(simulator.hit.mock.calls.at(-1)[1]).toBe("Left");
});

test("shows live carry in flight, then distance and shape once the ball lands", () => {
  renderApp();
  expect(
    screen.queryByRole("status", { name: "Shot result" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /hit/i }));
  act(() => callbacks.onProgress({ carryYards: 87.4 }));
  expect(screen.getByRole("status", { name: "Shot result" })).toHaveTextContent(
    "In the air",
  );
  expect(screen.getByRole("status", { name: "Shot result" })).toHaveTextContent(
    "87",
  );

  act(() =>
    callbacks.onResult({
      shape: "Push Fade",
      carryYards: 243.2,
      offlineYards: 26.4,
      apexYards: 31,
      flightSeconds: 6.24,
    }),
  );
  const status = screen.getByRole("status", { name: "Shot result" });
  expect(status).toHaveTextContent("Push Fade");
  expect(status).toHaveTextContent("243");
  expect(status).toHaveTextContent("26 yd right");
  expect(status).toHaveTextContent("93 ft");
  expect(status).toHaveTextContent("6.2 s");
});
