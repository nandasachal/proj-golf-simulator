// One line of advice after a missed target: what to change for the next one.
// Uses only what the outcome and the shot controls say. Side misses are worked
// out in the golfer's own frame, where positive face and path point to the
// open side (right for a right-hander, left for a left-hander), so the advice
// holds for both.

import { getClub } from "./clubs";
import { SHAPE_NOUN } from "./game";

// Face-to-path, in degrees, below which the curve is too small to blame.
const CURVE_DEGREES = 1;

const sideTip = (outcome, { clubFaceAngle, clubPathAngle }, side) => {
  const { rightYards } = outcome;
  const direction = rightYards > 0 ? "right" : "left";
  const yards = Math.round(Math.abs(rightYards));
  // Positive: missed toward the open side.
  const towardOpen = side === "Left" ? -rightYards : rightYards;
  const faceToPath = clubFaceAngle - clubPathAngle;
  if (Math.abs(faceToPath) >= CURVE_DEGREES && faceToPath * towardOpen > 0) {
    const open = towardOpen > 0;
    return {
      tip: "curve",
      text: `${yards} yd ${direction}: it curved ${direction} because the club face was ${
        open ? "open" : "closed"
      } to the path. Try ${open ? "less" : "more"} club face or ${
        open ? "more" : "less"
      } club path.`,
    };
  }
  return {
    tip: "start",
    text: `${yards} yd ${direction}: the club face pointed ${direction}. Try ${
      towardOpen > 0 ? "less" : "more"
    } club face.`,
  };
};

// `outcome` is what evaluateTarget returned for a miss; `controls` the shot
// as hit. Returns { tip, text }, `tip` naming the kind of advice.
export function coachMiss(outcome, controls, side = "Right") {
  // The club and shape a target names come before where the ball went.
  if (outcome.wrongClub)
    return {
      tip: "wrong_club",
      text: `This target has to be hit with the ${getClub(outcome.need.clubId).name.toLowerCase()}.`,
    };
  if (outcome.wrongShape) {
    const needed = outcome.need.shape;
    return {
      tip: "wrong_shape",
      text: `That was ${SHAPE_NOUN[outcome.shape]}; this target needs ${SHAPE_NOUN[needed]}. Set the club face ${
        { Draw: "closed to", Fade: "open to", Straight: "the same as" }[needed]
      } the club path.`,
    };
  }
  if (outcome.air) {
    if (outcome.shortYards != null)
      return {
        tip: "faster",
        text: `Fell ${Math.round(outcome.shortYards)} yd short: try more swing speed.`,
      };
    if (Math.abs(outcome.highYards) >= Math.abs(outcome.rightYards)) {
      const yards = Math.round(Math.abs(outcome.highYards));
      return outcome.highYards > 0
        ? { tip: "less_loft", text: `${yards} yd over it: try less loft.` }
        : {
            tip: "more_loft",
            text: `${yards} yd under it: try more loft or more swing speed.`,
          };
    }
    return sideTip(outcome, controls, side);
  }
  if (Math.abs(outcome.longYards) >= Math.abs(outcome.rightYards)) {
    const yards = Math.round(Math.abs(outcome.longYards));
    return outcome.longYards > 0
      ? { tip: "slower", text: `${yards} yd long: try less swing speed.` }
      : { tip: "faster", text: `${yards} yd short: try more swing speed.` };
  }
  return sideTip(outcome, controls, side);
}
