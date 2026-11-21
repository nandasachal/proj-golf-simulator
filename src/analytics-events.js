// What each analytics event carries. Pure, so the property sets are tested
// without PostHog. The tracking plan is planning/product-specs/analytics.md.

const tenth = (value) => Math.round(value * 10) / 10;
const yards = (value) => Math.round(value);

// A game is only a game outside practice; practice shots belong to no game.
export function shotLanded({ mode, club, gameId, result, controls }) {
  const inGame = mode !== "practice";
  return {
    mode,
    club,
    in_game: inGame,
    game_id: inGame ? gameId : null,
    total_yards: yards(result.totalYards),
    carry_yards: yards(result.carryYards),
    offline_yards: yards(result.offlineYards),
    apex_yards: yards(result.apexYards),
    shape: result.shape,
    aim: tenth(controls.aim),
    face: tenth(controls.clubFaceAngle),
    path: tenth(controls.clubPathAngle),
    attack: tenth(controls.attackAngle),
    loft_change: tenth(controls.loftChange),
    swing_speed: tenth(controls.swingSpeed),
    strike_inches: tenth(controls.strike),
  };
}

// The side a scored shot missed on, or how: the larger of the two misses.
export function missKind(outcome) {
  const { longYards, rightYards } = outcome;
  const side = rightYards > 0 ? "right" : "left";
  if (outcome.air) {
    if (outcome.shortYards != null) return "fell_short";
    const high = outcome.highYards > 0 ? "high" : "low";
    return Math.abs(outcome.highYards) >= Math.abs(rightYards) ? high : side;
  }
  const along = longYards > 0 ? "long" : "short";
  return Math.abs(longYards) >= Math.abs(rightYards) ? along : side;
}

export const gameStarted = ({ gameId, mode, club }) => ({
  game_id: gameId,
  mode,
  club,
});

export function targetAttempted({
  gameId,
  mode,
  club,
  target,
  outcome,
  shotNumber,
}) {
  return {
    game_id: gameId,
    mode,
    club,
    hit: outcome.hit,
    miss: outcome.hit ? null : missKind(outcome),
    target_yards: target.distanceYards,
    target_height_yards: mode === "advanced" ? target.heightYards : null,
    target_number: shotNumber,
  };
}

export const gameFinished = ({ gameId, mode, club, hits, won }) => ({
  game_id: gameId,
  mode,
  club,
  hits,
  won,
});

// model: "glb" for the modelled golfer, "figure_fallback" for the one built in
// code after a failed download.
export const appReady = ({ loadMs, model }) => ({
  load_ms: Math.round(loadMs),
  model: model || "glb",
});

export const sceneErrorKind = (error) =>
  /webgl/i.test(String(error?.message)) ? "webgl_unsupported" : "scene_failed";
