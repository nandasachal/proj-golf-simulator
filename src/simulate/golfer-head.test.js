import * as THREE from "three";
import { buildGolferHead, SKIN_COLOR } from "./golfer-head";

describe("buildGolferHead", () => {
  const head = buildGolferHead();
  const box = new THREE.Box3().setFromObject(head);

  it("is a group called head", () => {
    expect(head.isGroup).toBe(true);
    expect(head.name).toBe("head");
    expect(Number.isInteger(SKIN_COLOR)).toBe(true);
  });

  it("is the size of an adult head around the skull centre", () => {
    // Chin to top of the hair, ear to ear, and nose tip to the back.
    expect(box.max.y).toBeGreaterThan(0.12);
    expect(box.max.y).toBeLessThan(0.17);
    expect(box.min.y).toBeCloseTo(-0.17, 2);
    expect(box.max.z).toBeCloseTo(-box.min.z, 3);
    expect(box.max.z).toBeGreaterThan(0.075);
    expect(box.max.z).toBeLessThan(0.1);
    expect(box.min.x).toBeLessThan(-0.11);
    expect(box.max.x).toBeLessThan(0.14);
  });

  it("faces -x: the nose is the furthest thing forward", () => {
    expect(-box.min.x).toBeGreaterThan(box.max.x - 0.02);
    const skin = head.getObjectByName("skin").geometry.attributes.position;
    let tip = 0;
    for (let i = 1; i < skin.count; i++) {
      if (skin.getX(i) < skin.getX(tip)) tip = i;
    }
    expect(Math.abs(skin.getZ(tip))).toBeLessThan(0.004);
    expect(skin.getY(tip)).toBeLessThan(-0.02);
    expect(skin.getY(tip)).toBeGreaterThan(-0.06);
  });

  it("has no broken vertices and stays inside the triangle budget", () => {
    let triangles = 0;
    head.traverse((child) => {
      if (!child.isMesh) return;
      const { position } = child.geometry.attributes;
      for (let i = 0; i < position.array.length; i++) {
        if (!Number.isFinite(position.array[i])) throw new Error(child.name);
      }
      triangles += child.geometry.index.count / 3;
    });
    expect(triangles).toBeLessThan(60000);
  });
});
