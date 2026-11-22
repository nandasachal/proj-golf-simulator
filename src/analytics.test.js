import { identify, internalDevice, markInternal } from "./analytics";

const storage = () => {
  const kept = {};
  return {
    getItem: (key) => kept[key] ?? null,
    setItem: (key, value) => (kept[key] = value),
    removeItem: (key) => delete kept[key],
  };
};

test("a browser is internal once it is marked, and stays so on later visits", () => {
  const browser = storage();
  expect(internalDevice(browser)).toBe(false);
  markInternal(browser);
  expect(internalDevice(browser)).toBe(true);
});

test("identifying one of our own accounts marks the browser", () => {
  window.localStorage.clear();
  identify({ id: "p1", name: "Ada", internal: false });
  expect(internalDevice(window.localStorage)).toBe(false);
  identify({ id: "p2", name: "Sachal", internal: true });
  expect(internalDevice(window.localStorage)).toBe(true);
});

test("a browser with no storage is not internal", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  expect(internalDevice(broken)).toBe(false);
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
        startSessionRecording: jest.fn(),
      },
    }));
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  test("an error kind is sent once per page load", () => {
    analytics.reportError("api_unreachable", "/shots");
    analytics.reportError("api_unreachable", "/leaderboard");
    analytics.reportError("webgl_unsupported", "no context");
    expect(posthog.capture.mock.calls).toEqual([
      ["app_error", { kind: "api_unreachable", detail: "/shots" }],
      ["app_error", { kind: "webgl_unsupported", detail: "no context" }],
    ]);
  });

  test("exceptions are captured", () => {
    expect(posthog.init.mock.calls[0][1].capture_exceptions).toBe(true);
  });

  test("a first visit is marked and recorded; recording is off otherwise", () => {
    expect(posthog.register).toHaveBeenCalledWith({ first_visit: true });
    expect(posthog.startSessionRecording).toHaveBeenCalledTimes(1);
    expect(posthog.init.mock.calls[0][1].disable_session_recording).toBe(true);
    expect(posthog.init.mock.calls[0][1].session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: "*",
    });

    window.sessionStorage.clear();
    posthog.startSessionRecording.mockClear();
    analytics.startAnalytics();
    expect(posthog.register).toHaveBeenLastCalledWith({ first_visit: false });
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  test("setContext registers properties for later events", () => {
    analytics.setContext({ viewport: "phone" });
    expect(posthog.register).toHaveBeenCalledWith({ viewport: "phone" });
  });
});

describe("firstVisit", () => {
  const { firstVisit } = require("./analytics");
  const store = () => {
    const data = {};
    return {
      getItem: (key) => (key in data ? data[key] : null),
      setItem: (key, value) => {
        data[key] = String(value);
      },
    };
  };

  test("a new browser is on its first visit for the whole tab session", () => {
    const local = store();
    const session = store();
    expect(firstVisit(local, session)).toBe(true);
    // a reload in the same tab
    expect(firstVisit(local, session)).toBe(true);
    // a later visit, new tab session
    expect(firstVisit(local, store())).toBe(false);
  });

  test("blocked storage counts as a first visit", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(firstVisit(blocked, blocked)).toBe(true);
  });
});
