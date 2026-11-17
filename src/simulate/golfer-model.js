import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The modelled golfer: a rigged character built in Blender from MakeHuman
// (tools/blender), loaded once the range is up. Until it arrives, and if it
// never does, the figure built in code stands in.

const URL = `${process.env.PUBLIC_URL || ""}/models/golfer.glb`;

export function loadGolferModel(url = URL) {
  return new GLTFLoader().loadAsync(url).then((gltf) => {
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // Bounds are of the rest pose only, and the figure is always in view.
      object.frustumCulled = false;
      const material = object.material;
      if (material.transparent || material.alphaTest > 0) {
        // Hair, brows and lashes are cut out of cards: cut them cleanly
        // rather than blend them, so they need no sorting.
        material.transparent = false;
        material.alphaTest = 0.4;
        material.alphaToCoverage = true;
        material.depthWrite = true;
      }
    });
    return gltf.scene;
  });
}
