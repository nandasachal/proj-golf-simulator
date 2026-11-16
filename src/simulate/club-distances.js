import { getClub, swingSpeedRange } from "./clubs";
import { launchConditions } from "./launch-conditions";
import { Shot } from "./shot";
import { toYards } from "./conversions-lib";

// How far each club carries, and the swing speed a carry distance implies.
// The conditions are the ones Shot always flies in: sea level, 68°F (air
// density 1.204 kg/m³), no wind, a centred strike with a square face and the
// club's standard attack angle and loft.
export const STOCK_CONDITIONS = "sea level, 68°F, no wind";

const CARRY_DT = 0.005;

export function stockCarryYards(clubId, swingSpeedMPH) {
  const shot = new Shot({
    dt: CARRY_DT,
    ...launchConditions({
      faceAngle: 0,
      pathAngle: 0,
      swingSpeedMPH,
      side: "Right",
      club: clubId,
    }),
  });
  return toYards(shot.points[shot.points.length - 1].position.z);
}

// The shortest and longest stock carry the swing-speed control allows.
export function carryLimits(clubId) {
  const range = swingSpeedRange(getClub(clubId));
  return {
    min: Math.ceil(stockCarryYards(clubId, range.MIN)),
    max: Math.floor(stockCarryYards(clubId, range.MAX)),
  };
}

// The swing speed (to a tenth of a mph) whose stock carry is `yards`, kept
// inside the club's swing-speed range. Carry rises with speed, so bisect.
export function speedForCarry(clubId, yards) {
  const range = swingSpeedRange(getClub(clubId));
  let low = range.MIN;
  let high = range.MAX;
  if (stockCarryYards(clubId, low) >= yards) return low;
  if (stockCarryYards(clubId, high) <= yards) return high;
  while (high - low > 0.05) {
    const middle = (low + high) / 2;
    if (stockCarryYards(clubId, middle) < yards) low = middle;
    else high = middle;
  }
  return Math.round(((low + high) / 2) * 10) / 10;
}
