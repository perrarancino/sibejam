import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/** Static decorative lights, baked once into a directional irradiance volume.
 * Four filtered texture reads replace a per-pixel PBR loop over every lantern.
 * The volume also lights moving characters; the editor keeps the real lights.
 */
export class StaticLightField {
  constructor() {
    this.enabled = { value: 0 };
    this.minimum = { value: new THREE.Vector3() };
    this.inverseSize = { value: new THREE.Vector3(1, 1, 1) };
    this.fields = Array.from({ length: 4 }, () => ({ value: null }));
    this.boundMaterials = new WeakSet();
  }

  bindScene(scene) {
    scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.isMeshStandardMaterial || this.boundMaterials.has(material)) continue;
        this.boundMaterials.add(material);
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          Object.assign(shader.uniforms, {
            bakedEnabled: this.enabled, bakedMin: this.minimum, bakedInvSize: this.inverseSize,
            bakedL0: this.fields[0], bakedLx: this.fields[1], bakedLy: this.fields[2], bakedLz: this.fields[3]
          });
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBakedWorld;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
              vec4 bakedWorld = vec4(transformed, 1.0);
              #ifdef USE_INSTANCING
                bakedWorld = instanceMatrix * bakedWorld;
              #endif
              vBakedWorld = (modelMatrix * bakedWorld).xyz;`);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
              precision highp sampler3D;
              varying vec3 vBakedWorld;
              uniform float bakedEnabled;
              uniform vec3 bakedMin, bakedInvSize;
              uniform sampler3D bakedL0, bakedLx, bakedLy, bakedLz;`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
              if (bakedEnabled > 0.5) {
                vec3 fieldUv = clamp((vBakedWorld - bakedMin) * bakedInvSize, 0.0, 1.0);
                vec3 fieldNormal = inverseTransformDirection(normal, viewMatrix);
                vec3 irradiance = texture(bakedL0, fieldUv).rgb
                  + texture(bakedLx, fieldUv).rgb * fieldNormal.x
                  + texture(bakedLy, fieldUv).rgb * fieldNormal.y
                  + texture(bakedLz, fieldUv).rgb * fieldNormal.z;
                reflectedLight.indirectDiffuse += diffuseColor.rgb * max(irradiance, vec3(0.0)) * RECIPROCAL_PI;
              }`);
        };
        material.customProgramCacheKey = () => `${previousKey}|static-light-volume-v1`;
        material.needsUpdate = true;
      }
    });
  }

  bake(lights, mapSize) {
    const started = performance.now();
    const width = 64, height = 24, depth = 64;
    const extent = mapSize / 2 + 3;
    const min = this.minimum.value.set(-extent, -0.5, -extent);
    const size = new THREE.Vector3(extent * 2, 12.5, extent * 2);
    this.inverseSize.value.set(1 / size.x, 1 / size.y, 1 / size.z);
    const values = Array.from({ length: 4 }, () => new Float32Array(width * height * depth * 4));
    const pos = new THREE.Vector3();
    const dimensions = [width, height, depth], spans = [size.x, size.y, size.z], lower = [min.x, min.y, min.z];
    for (const light of lights) {
      light.getWorldPosition(pos);
      const radius = light.distance || 10;
      const origin = [pos.x, pos.y, pos.z];
      const lo = origin.map((v, i) => Math.max(0, Math.floor((v - radius - lower[i]) / spans[i] * dimensions[i] - 0.5)));
      const hi = origin.map((v, i) => Math.min(dimensions[i] - 1, Math.ceil((v + radius - lower[i]) / spans[i] * dimensions[i] - 0.5)));
      for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) {
        const dx = pos.x - (min.x + (x + 0.5) / width * size.x);
        const dy = pos.y - (min.y + (y + 0.5) / height * size.y);
        const dz = pos.z - (min.z + (z + 0.5) / depth * size.z);
        const distance = Math.hypot(dx, dy, dz);
        if (distance >= radius) continue;
        const cutoff = Math.max(0, 1 - (distance / radius) ** 4);
        const energy = light.intensity * cutoff * cutoff / Math.max(0.35, distance ** light.decay);
        const offset = ((z * height + y) * width + x) * 4;
        const direction = 0.8 / Math.max(distance, 0.01);
        const coefficients = [0.2, dx * direction, dy * direction, dz * direction];
        for (let field = 0; field < 4; field++) {
          const amount = energy * coefficients[field];
          values[field][offset] += light.color.r * amount;
          values[field][offset + 1] += light.color.g * amount;
          values[field][offset + 2] += light.color.b * amount;
        }
      }
    }
    for (let field = 0; field < 4; field++) {
      const half = new Uint16Array(values[field].length);
      for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(values[field][i]);
      const texture = new THREE.Data3DTexture(half, width, height, depth);
      texture.type = THREE.HalfFloatType;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.unpackAlignment = 1; texture.needsUpdate = true;
      this.fields[field].value?.dispose(); this.fields[field].value = texture;
    }
    this.enabled.value = 1;
    this.stats = { sources: lights.length, bytes: width * height * depth * 4 * 2 * 4, bakeMs: performance.now() - started };
  }
}
