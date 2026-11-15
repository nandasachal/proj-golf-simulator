import * as THREE from "three";

const DrawLib = {};

DrawLib.getGrid = function (sizeX, sizeZ, step, color) {
  const adjSizeX = sizeX / 2.0;
  const adjSizeZ = sizeZ / 2.0;
  const vertices = [];

  for (let i = -adjSizeX; i <= adjSizeX; i += step) {
    vertices.push(i, 0, -adjSizeZ, i, 0, adjSizeZ);
  }
  for (let j = -adjSizeZ; j <= adjSizeZ; j += step) {
    vertices.push(-adjSizeX, 0, j, adjSizeX, 0, j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.2,
  });
  return new THREE.LineSegments(geometry, material);
};

DrawLib.getSplinedLine = function (points, interpolationNum, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.BufferGeometry().setFromPoints(
    curve.getPoints(points.length * interpolationNum)
  );
  const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  return new THREE.Line(geometry, material);
};

export default DrawLib;
