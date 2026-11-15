import { toYards } from "./conversions-lib";

const STRAIGHT_START_DEGREES = 1;
const STRAIGHT_CURVE_FRACTION = 0.012; // curve as a share of carry
const BIG_CURVE_FRACTION = 0.1;

// Summarizes a finished Shot in the units and vocabulary a golfer uses.
// Lateral values are positive to the right when looking downrange. Pass the
// groundRun result to include bounce and roll; without it the ball is taken
// to stop where it lands.
export function analyzeShot(shot, side = "Right", run = null) {
  const points = shot.points;
  const launch = points[0].velocity;
  const landing = points[points.length - 1].position;

  let apex = 0;
  for (const point of points) {
    if (point.position.y > apex) apex = point.position.y;
  }

  const carryYards = toYards(landing.z);
  const offlineYards = toYards(-landing.x);
  const startDirectionDegrees =
    (Math.atan2(-launch.x, launch.z) * 180) / Math.PI;
  const curveYards =
    offlineYards -
    carryYards * Math.tan((startDirectionDegrees * Math.PI) / 180);

  const rest = run ? run.rest : landing;

  return {
    carryYards,
    runYards: run ? toYards(run.runDistance) : 0,
    totalYards: toYards(rest.z),
    // where the ball lands, and where it finally stops
    carryOfflineYards: offlineYards,
    offlineYards: toYards(-rest.x),
    hops: run ? run.hops : 0,
    runSeconds: run ? run.seconds : 0,
    apexYards: toYards(apex),
    flightSeconds: (points.length - 1) * shot.dt,
    startDirectionDegrees,
    curveYards,
    shape: shotShape({ startDirectionDegrees, curveYards, carryYards, side }),
  };
}

// Push/pull describes where the ball starts, fade/draw (slice/hook when
// large) how it curves. Both flip for a left-hander.
export function shotShape({
  startDirectionDegrees,
  curveYards,
  carryYards,
  side,
}) {
  const mirror = side === "Left" ? -1 : 1;
  const start = startDirectionDegrees * mirror;
  const curve = carryYards > 0 ? (curveYards * mirror) / carryYards : 0;

  let startLabel = "";
  if (start > STRAIGHT_START_DEGREES) startLabel = "Push";
  else if (start < -STRAIGHT_START_DEGREES) startLabel = "Pull";

  let curveLabel = "";
  if (curve > BIG_CURVE_FRACTION) curveLabel = "Slice";
  else if (curve > STRAIGHT_CURVE_FRACTION) curveLabel = "Fade";
  else if (curve < -BIG_CURVE_FRACTION) curveLabel = "Hook";
  else if (curve < -STRAIGHT_CURVE_FRACTION) curveLabel = "Draw";

  return [startLabel, curveLabel].filter(Boolean).join(" ") || "Straight";
}
