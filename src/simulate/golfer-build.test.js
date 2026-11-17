import fs from "fs";
import path from "path";

// The golfer's design follows a reference video of a heavier man; his build
// must not. The Blender build writes the bare body's girth over its height
// (tools/blender/golfer_measure.json); these are the values of the golfer as
// he was on 2026-11-16, before the redesign.
const BASELINE = { chest: 0.5207, waist: 0.4384, hips: 0.5274 };

const measured = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../tools/blender/golfer_measure.json"),
    "utf8",
  ),
);

test.each(Object.keys(BASELINE))("%s is no more than 2% over the baseline", (part) => {
  expect(measured[part]).toBeLessThanOrEqual(BASELINE[part] * 1.02);
});
