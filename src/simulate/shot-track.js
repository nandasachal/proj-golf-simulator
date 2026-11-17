// A shot seen from straight above, for the bird's-eye map: the flight and
// the run as short lists of [yards right of the centre line, yards downrange].
// Scene x points left when looking downrange, so right is -x.

const MAX_POINTS = 40;

// `points` are positions in any unit; `scale` turns them into yards.
function thin(points, scale) {
  const stride = Math.max(1, Math.ceil((points.length - 1) / (MAX_POINTS - 1)));
  const out = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out.map(({ x, z }) => [
    Math.round(-x * scale * 10) / 10 + 0,
    Math.round(z * scale * 10) / 10,
  ]);
}

export function shotTrack(
  airPositions,
  runPositions,
  scale = 1,
  target = null,
) {
  return {
    air: thin(airPositions, scale),
    run: runPositions.length ? thin(runPositions, scale) : [],
    // The game target the shot was hit at, if any.
    target: target && {
      right: -target.x,
      downrange: target.z,
      radius: target.radius,
      air: Boolean(target.air),
    },
  };
}

// How much range the map should show for a track: to the next 50 yd past the
// farthest point, and never less than 150 yd.
export function mapLength(track) {
  let far = track.target ? track.target.downrange + track.target.radius : 0;
  for (const [, z] of [...track.air, ...track.run]) far = Math.max(far, z);
  return Math.max(150, Math.ceil((far + 15) / 50) * 50);
}
