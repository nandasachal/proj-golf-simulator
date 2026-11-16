import * as THREE from "three";
import {
  BONE,
  BONE_COUNT,
  buildTorso,
  buildSleeve,
  buildArm,
  buildTrouserLeg,
  buildSock,
} from "./golfer-body-figure";
import { buildHand, buildShoe, buildCollar, WRIST } from "./golfer-body-kit";
import { buildNeck } from "./golfer-body-neck";

const binds = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());

function expectSound(geometry) {
  const { position, normal, skinWeight } = geometry.attributes;
  for (const attribute of [position, normal]) {
    for (let i = 0; i < attribute.array.length; i++) {
      if (!Number.isFinite(attribute.array[i]))
        throw new Error("broken vertex");
    }
  }
  if (!skinWeight) return;
  for (let i = 0; i < skinWeight.count; i++) {
    expect(
      skinWeight.getX(i) +
        skinWeight.getY(i) +
        skinWeight.getZ(i) +
        skinWeight.getW(i),
    ).toBeCloseTo(1);
  }
}

describe("skinned surfaces", () => {
  test("every surface is whole and fully weighted, on both sides", () => {
    expectSound(buildTorso(binds, 0.62));
    for (const mirror of [false, true]) {
      expectSound(buildSleeve(binds, BONE.leadUpperArm, mirror));
      expectSound(
        buildSleeve(binds, BONE.leadUpperArm, mirror, BONE.leadClavicle),
      );
      expectSound(buildArm(binds, BONE.leadUpperArm, BONE.leadForearm, mirror));
      expectSound(
        buildTrouserLeg(
          binds,
          { thigh: BONE.leadThigh, shin: BONE.leadShin },
          mirror,
        ),
      );
    }
    expectSound(buildSock(binds, BONE.leadShin));
  });

  test("the trunk narrows to a waist and again to the neck", () => {
    const stood = binds.map((bind) => bind.clone());
    stood[BONE.spine].makeTranslation(0, 0.19, 0);
    stood[BONE.chest].makeTranslation(0, 0.62, 0);
    const { position } = buildTorso(stood, 0.62).attributes;
    const widthAt = (height) => {
      let width = 0;
      for (let i = 0; i < position.count; i++) {
        if (Math.abs(position.getY(i) - height) < 0.02) {
          width = Math.max(width, Math.abs(position.getZ(i)));
        }
      }
      return width;
    };
    expect(widthAt(0.54)).toBeGreaterThan(widthAt(0.22) + 0.02);
    expect(widthAt(0.71)).toBeLessThan(0.08);
  });
});

describe("rigid kit", () => {
  test("hands, shoes and collar are whole", () => {
    const material = new THREE.MeshBasicMaterial();
    const parts = [
      buildHand(material),
      buildHand(material, {
        overlap: true,
        glove: { tab: material, trim: material },
      }),
      buildShoe({ upper: material, sole: material, lace: material }),
      ...buildShoe(
        { upper: material, sole: material, lace: material },
        { binds, foot: BONE.leadFoot, toe: BONE.leadToe },
      ).userData.skins.map(([geometry]) => new THREE.Mesh(geometry, material)),
      buildCollar(material),
    ];
    for (const part of parts) {
      part.traverse((child) => child.isMesh && expectSound(child.geometry));
    }
  });

  test("a hand reaches from its wrist down round the grip", () => {
    const box = new THREE.Box3().setFromObject(
      buildHand(new THREE.MeshBasicMaterial()),
    );
    expect(box.max.y).toBeGreaterThan(WRIST.y);
    expect(box.min.y).toBeLessThan(-0.04);
    expect(box.max.x - box.min.x).toBeLessThan(0.09);
  });
});

describe("buildNeck", () => {
  test("runs from the chest to wherever the head is, with no gap", () => {
    const group = new THREE.Group();
    const chest = new THREE.Object3D();
    const head = new THREE.Object3D();
    head.position.set(-0.05, 0.25, 0);
    group.add(chest, head);
    const neck = buildNeck(new THREE.MeshBasicMaterial(), chest, head);
    group.add(neck);
    const top = () => {
      group.updateMatrixWorld(true);
      neck.userData.update();
      expectSound(neck.geometry);
      return new THREE.Box3().setFromBufferAttribute(
        neck.geometry.attributes.position,
      );
    };
    const before = top();
    expect(before.min.y).toBeLessThan(0.08);
    expect(before.max.y).toBeGreaterThan(0.1);
    head.position.x = -0.15;
    const after = top();
    expect(after.min.x).toBeLessThan(before.min.x - 0.05);
  });
});
