import { Matrix4, Vector3 } from "three";
import { ringOffset, buildTube, buildLoft, table } from "./golfer-body-tube";

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

describe("table", () => {
  test("runs smoothly through its rows, whichever order they are given in", () => {
    const at = table([
      [2, 20, 1],
      [0, 0, 1],
      [1, 10, 3],
    ]);
    expect(at(1)).toEqual([10, 3]);
    expect(at(-5)).toEqual([0, 1]);
    expect(at(9)).toEqual([20, 1]);
    expect(at(0.5)[0]).toBeCloseTo(5, 0);
    expect(at(0.5)[1]).toBeGreaterThan(1);
  });
});

describe("ringOffset push", () => {
  test("moves the outline straight out from the ring's own centre", () => {
    const shape = { rx: 1, cx: 5, push: () => 0.5 };
    expect(ringOffset(shape, 0)[0]).toBeCloseTo(6.5);
    expect(ringOffset(shape, Math.PI / 2)[1]).toBeCloseTo(1.5);
  });
});

describe("buildLoft", () => {
  test("closes its seam and faces outward", () => {
    const geometry = buildLoft(4, 8, (i, j, out) => {
      const phi = (j / 8) * Math.PI * 2;
      out.set(Math.cos(phi), i, Math.sin(phi));
    });
    const position = new Vector3();
    const normal = new Vector3();
    for (let k = 0; k < geometry.attributes.position.count; k++) {
      position.fromBufferAttribute(geometry.attributes.position, k).setY(0);
      normal.fromBufferAttribute(geometry.attributes.normal, k);
      expect(normal.dot(position)).toBeGreaterThan(0.5);
    }
    const first = new Vector3().fromBufferAttribute(
      geometry.attributes.position,
      0,
    );
    const last = new Vector3().fromBufferAttribute(
      geometry.attributes.position,
      8,
    );
    expect(first.distanceTo(last)).toBeLessThan(1e-6);
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
