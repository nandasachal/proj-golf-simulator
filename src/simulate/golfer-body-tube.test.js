import { Matrix4, Vector3 } from "three";
import { ringOffset, buildTube } from "./golfer-body-tube";

describe("ringOffset", () => {
  test("traces an ellipse, back to +x and the lead side to +z", () => {
    const shape = { rx: 2, rz: 1 };
    expect(ringOffset(shape, 0)[0]).toBeCloseTo(2);
    expect(ringOffset(shape, Math.PI / 2)[1]).toBeCloseTo(1);
    expect(ringOffset(shape, Math.PI)[0]).toBeCloseTo(-2);
  });

  test("can be deeper behind than in front, flat on one side, and floored", () => {
    expect(ringOffset({ back: 3, front: 1, rz: 1 }, Math.PI)[0]).toBeCloseTo(
      -1,
    );
    expect(ringOffset({ rx: 1, half: true }, -Math.PI / 2)[1]).toBeCloseTo(0);
    expect(ringOffset({ rx: 1, floor: -0.25 }, Math.PI)[0]).toBeCloseTo(-0.25);
  });
});

describe("buildTube", () => {
  const ring = (y, r, bone, weight) => ({
    parts: [
      { bone, weight, y, shape: { rx: r } },
      { bone: 1 - bone, weight: 1 - weight, y, shape: { rx: r } },
    ],
  });
  const rings = [ring(0, 1, 0, 1), ring(1, 1, 0, 0.5), ring(2, 1, 0, 0)];
  const binds = [new Matrix4(), new Matrix4()];

  test("faces outward whichever way round it is built", () => {
    for (const mirror of [false, true]) {
      const geometry = buildTube(rings, { segments: 8, binds, mirror });
      const position = new Vector3();
      const normal = new Vector3();
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        position.fromBufferAttribute(geometry.attributes.position, i).setY(0);
        normal.fromBufferAttribute(geometry.attributes.normal, i);
        expect(normal.dot(position)).toBeGreaterThan(0.5);
      }
    }
  });

  test("gives every vertex skin weights that add up to one", () => {
    const geometry = buildTube(rings, { segments: 8, binds });
    const weights = geometry.attributes.skinWeight;
    expect(weights.count).toBe(3 * 9);
    for (let i = 0; i < weights.count; i++) {
      expect(
        weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i),
      ).toBeCloseTo(1);
    }
  });

  test("closes its seam: first and last column share a place and a normal", () => {
    const geometry = buildTube(rings, { segments: 8 });
    for (const name of ["position", "normal"]) {
      const attribute = geometry.attributes[name];
      const first = new Vector3().fromBufferAttribute(attribute, 0);
      const last = new Vector3().fromBufferAttribute(attribute, 8);
      expect(first.distanceTo(last)).toBeLessThan(1e-6);
    }
  });
});
