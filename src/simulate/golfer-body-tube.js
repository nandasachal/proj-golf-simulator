import * as THREE from "three";

// The golfer's body is skinned from tubes: stacks of rings, each ring a rounded
// outline around a bone's local y axis. A ring that sits at a joint is given
// to both bones it joins, so the surface bends with them instead of meeting
// at a ball.

// A point of a ring's outline, as [x, z] in the ring's plane. Bones all look
// the same way at rest: +x is the golfer's back, +z their lead side.
//   rx / rz   half depth and half width (or `back` and `front` in place of rx)
//   n         2 is an ellipse, higher is boxier
//   half      keep only the +z half, flat along z = 0 (one side of the hips)
//   floor     nothing below this x (the flat of a shoe)
export function ringOffset(shape, theta) {
  const { rx = 0, rz = rx, n = 2, cx = 0, cz = 0, half = false, floor } = shape;
  const { back = rx, front = rx } = shape;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  let x = Math.sign(c) * Math.abs(c) ** e * (c >= 0 ? back : front) + cx;
  let z = Math.sign(s) * Math.abs(s) ** e * rz;
  if (half) z = Math.max(z, 0);
  if (floor !== undefined) x = Math.max(x, floor);
  return [x, z + cz];
}

const point = new THREE.Vector3();
const sum = new THREE.Vector3();

// rings: [{ parts: [{ bone, weight, y, shape }], v, lift(theta), scale(theta) }]
// A ring's vertices are the weighted blend of its parts, each placed by its
// own bone's bind matrix (`binds`); without `binds` the tube is rigid and
// stays in its own space. `mirror` builds the other side of the body.
export function buildTube(
  rings,
  { segments = 28, binds = null, mirror = false } = {},
) {
  const columns = segments + 1;
  const count = rings.length * columns;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const skinIndex = binds ? new Uint16Array(count * 4) : null;
  const skinWeight = binds ? new Float32Array(count * 4) : null;

  rings.forEach((ring, i) => {
    for (let j = 0; j < columns; j++) {
      const theta = ((j % segments) / segments) * Math.PI * 2;
      const lift = ring.lift ? ring.lift(theta) : 0;
      const scale = ring.scale ? ring.scale(theta) : 1;
      const vertex = i * columns + j;
      sum.set(0, 0, 0);
      ring.parts.forEach((part, k) => {
        const weight = part.weight === undefined ? 1 : part.weight;
        const [x, z] = ringOffset(part.shape, theta);
        point.set(x * scale, part.y + lift, (mirror ? -z : z) * scale);
        if (binds) {
          point.applyMatrix4(binds[part.bone]);
          skinIndex[vertex * 4 + k] = part.bone;
          skinWeight[vertex * 4 + k] = weight;
        }
        sum.addScaledVector(point, weight);
      });
      positions.set([sum.x, sum.y, sum.z], vertex * 3);
      uvs.set(
        [
          j / segments,
          ring.v === undefined ? 1 - i / (rings.length - 1) : ring.v,
        ],
        vertex * 2,
      );
    }
  });

  const indices = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * columns + j;
      const b = a + columns;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Face outward whichever way the rings happened to wind.
  if (signedVolume(positions, indices) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  if (binds) {
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute(
      "skinWeight",
      new THREE.BufferAttribute(skinWeight, 4),
    );
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // The first and last column are the same line: shade them as one.
  const normals = geometry.attributes.normal;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < rings.length; i++) {
    const first = i * columns;
    const last = first + segments;
    a.fromBufferAttribute(normals, first);
    b.fromBufferAttribute(normals, last);
    a.add(b).normalize();
    normals.setXYZ(first, a.x, a.y, a.z);
    normals.setXYZ(last, a.x, a.y, a.z);
  }
  return geometry;
}

function signedVolume(positions, indices) {
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const centre = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    centre.x += positions[i];
    centre.y += positions[i + 1];
    centre.z += positions[i + 2];
  }
  centre.multiplyScalar(3 / positions.length);
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      p[k].fromArray(positions, indices[i + k] * 3).sub(centre);
    }
    volume += p[0].dot(p[1].cross(p[2]));
  }
  return volume;
}
