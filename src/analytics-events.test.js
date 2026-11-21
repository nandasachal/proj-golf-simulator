import {
  appReady,
  gameFinished,
  gameStarted,
  missKind,
  sceneErrorKind,
  shotLanded,
  targetAttempted,
} from "./analytics-events";

const result = {
  totalYards: 231.4,
  carryYards: 218.6,
  offlineYards: -7.2,
  apexYards: 31.9,
  shape: "Push Fade",
};
const controls = {
  aim: 0,
  clubFaceAngle: 1.26,
  clubPathAngle: -2,
  attackAngle: -1.04,
  loftChange: 0,
  swingSpeed: 99.96,
  strike: 0.2,
};

test("a game shot carries its game id, the result and every control", () => {
  expect(
    shotLanded({ mode: "normal", club: "7i", gameId: "g1", result, controls }),
  ).toEqual({
    mode: "normal",
    club: "7i",
    in_game: true,
    game_id: "g1",
    total_yards: 231,
    carry_yards: 219,
    offline_yards: -7,
    apex_yards: 32,
    shape: "Push Fade",
    aim: 0,
    face: 1.3,
    path: -2,
    attack: -1,
    loft_change: 0,
    swing_speed: 100,
    strike_inches: 0.2,
  });
});

test("a practice shot belongs to no game", () => {
  const props = shotLanded({
    mode: "practice",
    club: "driver",
    gameId: "g1",
    result,
    controls,
  });
  expect(props.in_game).toBe(false);
  expect(props.game_id).toBeNull();
});

test("a ground miss is named by its larger error", () => {
  expect(missKind({ longYards: -9, rightYards: -4 })).toBe("short");
  expect(missKind({ longYards: 3, rightYards: 8 })).toBe("right");
  expect(missKind({ longYards: 12, rightYards: 1 })).toBe("long");
  expect(missKind({ longYards: 1, rightYards: -6 })).toBe("left");
});

test("an air miss is high, low, off to a side, or fell short", () => {
  const air = { air: true, longYards: 0 };
  expect(missKind({ ...air, highYards: 5, rightYards: 3 })).toBe("high");
  expect(missKind({ ...air, highYards: -5, rightYards: 3 })).toBe("low");
  expect(missKind({ ...air, highYards: 1, rightYards: -3 })).toBe("left");
  expect(missKind({ ...air, shortYards: 40, rightYards: 0 })).toBe(
    "fell_short",
  );
});

test("a target attempt has no miss on a hit, and a height only in advanced", () => {
  const base = { gameId: "g1", club: "7i", shotNumber: 2 };
  expect(
    targetAttempted({
      ...base,
      mode: "normal",
      target: { distanceYards: 140, heightYards: 12 },
      outcome: { hit: true, longYards: 0, rightYards: 0 },
    }),
  ).toEqual({
    game_id: "g1",
    mode: "normal",
    club: "7i",
    hit: true,
    miss: null,
    target_yards: 140,
    target_height_yards: null,
    target_number: 2,
  });
  const advanced = targetAttempted({
    ...base,
    mode: "advanced",
    target: { distanceYards: 140, heightYards: 12 },
    outcome: { hit: false, air: true, highYards: 4, rightYards: 1 },
  });
  expect(advanced.target_height_yards).toBe(12);
  expect(advanced.miss).toBe("high");
});

test("game events share the game id", () => {
  const played = { gameId: "g1", mode: "normal", club: "7i" };
  expect(gameStarted(played)).toEqual({
    game_id: "g1",
    mode: "normal",
    club: "7i",
  });
  expect(gameFinished({ ...played, hits: 3, won: true })).toEqual({
    game_id: "g1",
    mode: "normal",
    club: "7i",
    hits: 3,
    won: true,
  });
});

test("app_ready rounds the load time and defaults to the modelled golfer", () => {
  expect(appReady({ loadMs: 2345.67 })).toEqual({
    load_ms: 2346,
    model: "glb",
  });
  expect(appReady({ loadMs: 900, model: "figure_fallback" }).model).toBe(
    "figure_fallback",
  );
});

test("a scene error is named for missing WebGL, otherwise scene_failed", () => {
  expect(sceneErrorKind(new Error("Error creating WebGL context."))).toBe(
    "webgl_unsupported",
  );
  expect(sceneErrorKind(new Error("boom"))).toBe("scene_failed");
  expect(sceneErrorKind(undefined)).toBe("scene_failed");
});
