import * as THREE from "three";

// How the golfer's skin and cloth take the light. three's physical material
// cuts direct light off dead at the terminator, which is right for stone and
// wrong for anything light gets into: here it is let round the edge a little
// way - further for red than for blue on skin, which is what gives flesh its
// warm shadow edge - without a second pass or a thickness map.

const LAMBERT = `float dotNL = saturate( dot( geometryNormal, directLight.direction ) );

	vec3 irradiance = dotNL * directLight.color;`;

// wrap: how far past the terminator light reaches (0 = plain Lambert).
// tint: per channel, how much of that wrapped light is kept.
export function softLit(material, { wrap = 0.3, tint = [1, 1, 1] } = {}) {
  const wrapped = `float rawNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( rawNL );
	float wrapNL = saturate( ( rawNL + ${wrap.toFixed(3)} ) / ${(1 + wrap).toFixed(3)} );
	vec3 irradiance = mix( vec3( dotNL ), vec3( wrapNL * wrapNL ), vec3( ${tint
    .map((channel) => channel.toFixed(3))
    .join(", ")} ) ) * directLight.color;`;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(LAMBERT, wrapped),
    );
  };
  material.customProgramCacheKey = () => `soft-${wrap}-${tint.join()}`;
  return material;
}

export function skinMaterial(parameters) {
  return softLit(
    new THREE.MeshPhysicalMaterial({
      roughness: 0.56,
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: 0xff9c7a,
      specularIntensity: 0.6,
      ...parameters,
    }),
    { wrap: 0.42, tint: [1, 0.55, 0.38] },
  );
}

export function clothMaterial(
  parameters,
  { sheen = 0.5, sheenColor = 0xffffff } = {},
) {
  return softLit(
    new THREE.MeshPhysicalMaterial({
      sheen,
      sheenRoughness: 0.6,
      sheenColor,
      specularIntensity: 0.25,
      ...parameters,
    }),
    { wrap: 0.22 },
  );
}
