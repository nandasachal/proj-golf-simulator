import * as THREE from "three";
import { seededRandom } from "./scenery/shared";
import { buildSky, buildLights } from "./scenery/sky";
import { buildTerrain } from "./scenery/terrain";
import { buildTrees } from "./scenery/trees";
import { buildProps } from "./scenery/props";
import { buildWall } from "./scenery/wall";
import { buildFleet } from "./scenery/fleet";

// Scene units are yards. The tee is at the origin and the range runs down +z;
// -x is the right-hand side when looking downrange. Each part of the scenery
// is a module in ./scenery returning { object, update(seconds, camera) }.

export {
  RANGE_LENGTH,
  FAIRWAY_HALF_WIDTH,
  MARKER_INTERVAL,
  LAST_MARKER,
  groundOverlay,
} from "./scenery/shared";
export { FOG } from "./scenery/sky";

export function buildRange({ anisotropy = 1, fleet = false } = {}) {
  const random = seededRandom(20261115);
  const range = new THREE.Group();
  range.name = "range";
  const parts = [
    buildSky({ random }),
    buildTerrain({ random, anisotropy }),
    buildProps({ random, anisotropy }),
    buildWall({ anisotropy }),
    buildTrees({ random }),
    buildLights(),
  ];
  if (fleet) parts.push(buildFleet());
  for (const part of parts) range.add(part.object);
  range.userData.update = (seconds, camera) => {
    for (const part of parts) part.update(seconds, camera);
  };
  return range;
}
