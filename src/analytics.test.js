import { internalDevice } from "./analytics";

const storage = () => {
  const kept = {};
  return {
    getItem: (key) => kept[key] ?? null,
    setItem: (key, value) => (kept[key] = value),
    removeItem: (key) => delete kept[key],
  };
};

test("?internal=1 marks the browser and it stays marked on later visits", () => {
  const browser = storage();
  expect(internalDevice("", browser)).toBe(false);
  expect(internalDevice("?mode=practice&internal=1", browser)).toBe(true);
  expect(internalDevice("", browser)).toBe(true);
});

test("?internal=0 unmarks it", () => {
  const browser = storage();
  internalDevice("?internal=1", browser);
  expect(internalDevice("?internal=0", browser)).toBe(false);
  expect(internalDevice("", browser)).toBe(false);
});

test("a browser with no storage is not internal", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  expect(internalDevice("", broken)).toBe(false);
});

describe("with analytics on", () => {
  let analytics;
  let posthog;
  const env = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("posthog-js", () => ({
      __esModule: true,
      default: {
        init: jest.fn(),
        register: jest.fn(),
        capture: jest.fn(),
        identify: jest.fn(),
      },
    }));
    process.env.REACT_APP_POSTHOG_KEY = "phc_test";
    process.env.NODE_ENV = "development";
    posthog = require("posthog-js").default;
    analytics = require("./analytics");
    analytics.startAnalytics();
  });

  afterEach(() => {
    process.env = { ...env };
  });

  test("every event carries the build version and starts as no saved player", () => {
    expect(posthog.register).toHaveBeenCalledWith({
      app_version: "dev",
      player_saved: false,
    });
  });

  test("identify sends the player id and no name", () => {
    analytics.identify({ id: "p1", name: "Ada" });
    expect(posthog.identify).toHaveBeenCalledWith("p1");
    expect(JSON.stringify(posthog.identify.mock.calls)).not.toContain("Ada");
    expect(posthog.register).toHaveBeenCalledWith({ player_saved: true });
  });

  test("setContext registers properties for later events", () => {
    analytics.setContext({ viewport: "phone" });
    expect(posthog.register).toHaveBeenCalledWith({ viewport: "phone" });
  });
});
