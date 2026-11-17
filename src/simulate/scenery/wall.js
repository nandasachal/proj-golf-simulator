import * as THREE from "three";
import { canvasTexture, valueNoise } from "./shared";
import logoUrl from "../../assets/images/saanchal-logo.jpg";

// The wall behind the tee line: plain grey concrete with the house motto and
// the Saanchal mark, there for when the view is swung round to face the golfer.

const WALL = { width: 64, height: 9.5, z: -12.5, thickness: 0.5 };
const SIGN = { width: 22, height: 7.2, bottom: 2.1 };
const LINES = ["In Every Experience", "You Either Win or You Learn"];
// The mark within its file: the picture has wide black margins.
const LOGO_CROP = { x: 320, y: 315, width: 640, height: 560 };
const INK = "#ffffff";

function concrete() {
  const texture = canvasTexture(512, 512, (context) => {
    const image = context.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const grain =
          0.6 * valueNoise(x / 90, y / 90) +
          0.3 * valueNoise(x / 17, y / 17) +
          0.1 * Math.random();
        const value = 136 + 30 * grain;
        const i = (y * 512 + x) * 4;
        image.data[i] = value;
        image.data[i + 1] = value + 1;
        image.data[i + 2] = value + 3;
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    // Form lines, where the shuttering boards met.
    context.strokeStyle = "rgba(40, 42, 46, 0.35)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, 510, 510);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WALL.width / 4, WALL.height / 4);
  return texture;
}

// The motto, with the mark above it once its picture has loaded.
function drawSign(context, width, height, logo) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = INK;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const size = height * 0.135;
  context.font = `600 ${size}px Georgia, "Times New Roman", serif`;
  LINES.forEach((line, i) => {
    context.fillText(line, width / 2, height * (0.66 + 0.19 * i), width * 0.96);
  });
  if (!logo) return;
  // White on black in the file: its brightness becomes the paint's cover.
  const markHeight = height * 0.5;
  const markWidth = (markHeight * LOGO_CROP.width) / LOGO_CROP.height;
  const scratch = document.createElement("canvas");
  scratch.width = Math.round(markWidth);
  scratch.height = Math.round(markHeight);
  const pen = scratch.getContext("2d");
  pen.drawImage(
    logo,
    LOGO_CROP.x,
    LOGO_CROP.y,
    LOGO_CROP.width,
    LOGO_CROP.height,
    0,
    0,
    scratch.width,
    scratch.height,
  );
  const mark = pen.getImageData(0, 0, scratch.width, scratch.height);
  for (let i = 0; i < mark.data.length; i += 4) {
    const cover = mark.data[i];
    mark.data[i] = 255;
    mark.data[i + 1] = 255;
    mark.data[i + 2] = 255;
    // Its lines are fine: lay the paint on thick so they hold at a distance.
    mark.data[i + 3] = Math.min(255, cover * 1.8);
  }
  pen.putImageData(mark, 0, 0);
  context.drawImage(scratch, (width - scratch.width) / 2, height * 0.03);
}

export function buildWall({ anisotropy = 1 } = {}) {
  const object = new THREE.Group();
  object.name = "wall";

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(WALL.width, WALL.height, WALL.thickness),
    new THREE.MeshStandardMaterial({ map: concrete(), roughness: 0.95 }),
  );
  wall.position.set(0, WALL.height / 2, WALL.z - WALL.thickness / 2);
  wall.receiveShadow = true;
  object.add(wall);

  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = Math.round((2048 * SIGN.height) / SIGN.width);
  const context = canvas.getContext("2d");
  drawSign(context, canvas.width, canvas.height, null);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(SIGN.width, SIGN.height),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  sign.position.set(0, SIGN.bottom + SIGN.height / 2, WALL.z + 0.01);
  object.add(sign);

  const logo = new Image();
  logo.onload = () => {
    drawSign(context, canvas.width, canvas.height, logo);
    texture.needsUpdate = true;
  };
  logo.src = logoUrl;

  return { object, update() {} };
}
