import * as THREE from "three";
import {
  canPaint,
  shirtMaps,
  sleeveMaps,
  trouserMaps,
  shoeMaps,
  leatherNormals,
  surroundings,
} from "./golfer-body-textures";
import { clothMaterial, skinMaterial } from "./golfer-body-shading";

// Every material the golfer's body is dressed in.
export function golferLook(skinColor) {
  const paint = canPaint();
  const leather = paint ? leatherNormals() : null;
  const reflection = paint ? surroundings() : null;
  const shirt = paint ? shirtMaps(skinColor) : { color: 0xcbd0d8 };
  const sleeve = paint ? sleeveMaps() : { color: 0xcbd0d8 };
  const trousers = paint ? trouserMaps() : { color: 0x1b243e };
  const shoe = paint ? shoeMaps() : { color: 0xf4f4f0 };
  const plain = (color, roughness) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const metal = (color, roughness) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 1,
      envMap: reflection,
      envMapIntensity: 1.2,
    });
  return {
    skin: skinMaterial({ color: skinColor }),
    nail: skinMaterial({
      color: new THREE.Color(skinColor).lerp(new THREE.Color(0xf2c9bd), 0.45),
      roughness: 0.3,
    }),
    shirt: clothMaterial({ ...shirt, roughness: 0.9 }),
    sleeve: clothMaterial({ ...sleeve, roughness: 0.9 }),
    collar: clothMaterial({
      ...sleeve,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    trousers: clothMaterial(
      { ...trousers, roughness: 0.82 },
      { sheen: 0.35, sheenColor: 0x8fa0d0 },
    ),
    shoe: softLeather({ ...shoe, roughness: 0.42 }),
    shoeLining: plain(0x1a1c22, 0.9),
    sole: plain(0xe6e4dc, 0.85),
    tread: plain(0x23262c, 0.9),
    lace: plain(0xf6f6f3, 0.9),
    sock: clothMaterial({ color: 0xf1f1ee, roughness: 0.95 }),
    belt: new THREE.MeshStandardMaterial({
      color: 0x2a1a11,
      roughness: 0.48,
      normalMap: leather,
    }),
    buckle: metal(0xdfe3e8, 0.22),
    gold: metal(0xf0c14a, 0.3),
    glove: softLeather({
      color: 0xf8f7f2,
      roughness: 0.5,
      normalMap: leather,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    gloveTab: plain(0xe4e4df, 0.75),
    gloveTrim: plain(0xa9adb3, 0.7),
  };
}

function softLeather(parameters) {
  return clothMaterial(parameters, { sheen: 0.15 });
}
