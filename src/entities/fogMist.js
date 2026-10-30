/**
 * Динамическая система дымки и живого тумана (Fog of War & Atmospheric Mist).
 * Устраняет любые черные провалы у ног Агаты:
 * 1. Вокруг героини свет кристально чистый и яркий.
 * 2. Туман начинается на расстоянии и колышется живыми клубами и щупальцами (шум Перлина).
 * 3. На границе света клубы дымки озаряются теплым золотым отсветом.
 * 4. Парящие частицы используют аддитивное смешивание, поэтому никогда не создают темных пятен.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export class FogMistManager {
  constructor(scene, fieldSize = 36) {
    this.scene = scene;
    this.cameraHeads = [];
    this.fieldSize = fieldSize;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.createVolumetricGroundMist();
    this.createFloatingMistWisps();
  }

  /**
   * Анимированный приземный туман войны.
   * Зона прямо вокруг игрока (r < 3.8м) полностью прозрачна (alpha = 0),
   * а дальше туман накатывает живыми волнообразными клубами.
   */
  createVolumetricGroundMist() {
    // Full-screen fog layer: every screen pixel maps to the ground under it.
    const vertexShader = `
      varying vec2 vScreenUv;
      void main() {
        vScreenUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vScreenUv;
      uniform mat4 uInverseProjection;
      uniform mat4 uCameraWorld;
      uniform vec3 uPlayerPos;
      uniform float uTime;
      uniform float uLanternRadius;
      uniform vec4 uCameraLights[3];
      uniform int uCameraLightCount;
      uniform vec2 uCameraScreen[3];
      uniform float uScreenAspect;

      // 2D Шум Simplex для клубящегося тумана
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 ndc = vScreenUv * 2.0 - 1.0;
        vec4 nearPoint = uCameraWorld * uInverseProjection * vec4(ndc, -1.0, 1.0);
        vec4 farPoint = uCameraWorld * uInverseProjection * vec4(ndc, 1.0, 1.0);
        vec3 rayStart = nearPoint.xyz / nearPoint.w;
        vec3 rayEnd = farPoint.xyz / farPoint.w;
        vec3 ray = rayEnd - rayStart;
        float hit = -rayStart.y / min(ray.y, -0.00001);
        vec2 worldXZ = (rayStart + ray * hit).xz;
        float dist = distance(worldXZ, uPlayerPos.xz);

        // Прежние слои шума, но с одинаковым масштабом по обеим осям.
        vec2 flow = worldXZ * 0.14;
        float warp = snoise(flow * 0.75 + vec2(uTime * 0.025, -uTime * 0.018));
        float cloud = snoise(flow + vec2(warp * 0.4 + uTime * 0.035, -uTime * 0.02));
        float fine = snoise(flow * 1.7 + vec2(-uTime * 0.018, uTime * 0.027));
        float veil = smoothstep(3.0, 11.0, dist + cloud * 0.38 + warp * 0.18);
        float opaqueFog = smoothstep(9.5, 16.0, dist);
        float variation = clamp(0.9 + cloud * 0.07 + fine * 0.035, 0.62, 1.0);
        vec3 fogColor = mix(vec3(0.045, 0.035, 0.06), vec3(0.12, 0.10, 0.145), clamp(0.5 + 0.25 * cloud, 0.0, 1.0));
        float alpha = mix(clamp(veil * 0.82 * variation, 0.0, 0.82), 1.0, opaqueFog);
        for (int i = 0; i < 3; i++) {
          if (i >= uCameraLightCount) break;
          vec4 beam = uCameraLights[i];
          vec2 start = beam.xy;
          vec2 end = beam.zw;
          vec2 direction = end - start;
          float along = clamp(dot(worldXZ - start, direction) / max(dot(direction,direction), 0.001), 0.0, 1.0);
          float distanceToBeam = distance(worldXZ, mix(start, end, along));
          float pool = 1.0 - smoothstep(0.35, 2.3, distance(worldXZ, end));
          float shaft = (1.0 - smoothstep(0.25, 1.4, distanceToBeam)) * (1.0 - smoothstep(0.65, 1.0, along));
          float illumination = max(pool, shaft * 0.4);
          alpha *= 1.0 - illumination * 0.9;
        }
        // Camera beacons remain visible through the screen-space fog.
        for (int i = 0; i < 3; i++) {
          if (i >= uCameraLightCount) break;
          vec2 delta = (vScreenUv - uCameraScreen[i]) * vec2(uScreenAspect, 1.0);
          float beacon = 1.0 - smoothstep(0.008, 0.035, length(delta));
          alpha *= 1.0 - beacon * 0.9;
        }
        gl_FragColor = vec4(fogColor, alpha);
      }
    `;

    this.groundMistUniforms = {
      uPlayerPos: { value: new THREE.Vector3(0, 0, 4) },
      uInverseProjection: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uLanternRadius: { value: 6.8 },
      uCameraLights: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uCameraLightCount: { value: 0 },
      uCameraScreen: { value: [new THREE.Vector2(-10,-10), new THREE.Vector2(-10,-10), new THREE.Vector2(-10,-10)] },
      uScreenAspect: { value: 1 }
    };

    const mistGeo = new THREE.PlaneGeometry(2, 2);
    const mistMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.groundMistUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending
    });

    this.groundMistMesh = new THREE.Mesh(mistGeo, mistMat);
    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.Camera();
    this.overlayScene.add(this.groundMistMesh);
  }

  /**
   * Парящие в воздухе клубы мягкой дымки.
   * Использование аддитивного смешивания гарантирует, что частицы НИКОГДА
   * не затемняют игрока или землю черными кругами, а лишь добавляют мягкое свечение.
   */
  createFloatingMistWisps() {
    // Генерация гладкой текстуры дымки
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 235, 190, 0.8)');
    grad.addColorStop(0.3, 'rgba(230, 200, 150, 0.4)');
    grad.addColorStop(0.65, 'rgba(180, 150, 120, 0.12)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const mistTexture = new THREE.CanvasTexture(cv);

    this.wisps = [];
    const count = 18;
    const spawnRange = this.fieldSize * 0.44;

    for (let i = 0; i < count; i++) {
      const size = 3.0 + Math.random() * 3.5;
      const mat = new THREE.SpriteMaterial({
        map: mistTexture,
        color: 0xb7a6c9,
        transparent: true,
        opacity: 0.08 + Math.random() * 0.12,
        blending: THREE.AdditiveBlending, // Аддитивное смешивание — никакого затемнения!
        depthWrite: false
      });

      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);

      const x = (Math.random() - 0.5) * spawnRange * 2;
      const z = (Math.random() - 0.5) * spawnRange * 2;
      const y = 0.4 + Math.random() * 1.2;
      sprite.position.set(x, y, z);
      sprite.renderOrder = 4;

      this.group.add(sprite);

      this.wisps.push({
        sprite,
        mat,
        baseX: x,
        baseZ: z,
        baseY: y,
        speedX: 0.12 + Math.random() * 0.28,
        speedZ: 0.08 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        maxOpacity: 0.035 + Math.random() * 0.025,
        size
      });
    }
  }

  renderOverlay(renderer, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.groundMistUniforms.uScreenAspect.value = size.x / size.y;
    for (let i = 0; i < this.groundMistUniforms.uCameraLightCount.value; i++) {
      const point = this.cameraHeads?.[i];
      if (point) {
        const projected = point.clone().project(camera);
        this.groundMistUniforms.uCameraScreen.value[i].set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
      }
    }
    this.groundMistUniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    this.groundMistUniforms.uCameraWorld.value.copy(camera.matrixWorld);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.overlayScene, this.overlayCamera);
    renderer.autoClear = autoClear;
  }

  addCameraLight(x, z, targetX, targetZ) {
    const count = this.groundMistUniforms.uCameraLightCount.value;
    if (count >= 3) return;
    this.groundMistUniforms.uCameraLights.value[count].set(x, z, targetX, targetZ);
    this.groundMistUniforms.uCameraLightCount.value = count + 1;
    return count;
  }

  update(playerPos, dt, now) {
    const time = now * 0.001;

    // Обновление униформов шейдера тумана
    this.groundMistUniforms.uTime.value = time;
    this.groundMistUniforms.uPlayerPos.value.copy(playerPos);

    // Анимация парящих клубов дымки
    const half = this.fieldSize * 0.48;
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];

      // Дрейф по ветру
      w.sprite.position.x += w.speedX * dt;
      w.sprite.position.z += w.speedZ * dt;
      w.sprite.position.y = w.baseY + Math.sin(time * 1.1 + w.phase) * 0.18;

      // Циклический перенос
      if (w.sprite.position.x > half) w.sprite.position.x = -half;
      if (w.sprite.position.z > half) w.sprite.position.z = -half;

      // Расстояние до Агаты
      const dx = w.sprite.position.x - playerPos.x;
      const dz = w.sprite.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);

      // Частицы плавно светятся золотистой дымкой в лучах фонаря (от 2.5 до 8 метров)
      if (dist < 8.5) {
        // Плавное угасание прямо перед глазами, чтобы не мешать обзору Агаты
        const viewClear = smoothstep(0.8, 2.5, dist);
        const lightIntensity = Math.max(0, 1.0 - dist / 8.5) * viewClear;
        w.mat.opacity = w.maxOpacity * lightIntensity;
      } else {
        w.mat.opacity = 0;
      }
    }
  }
}

function smoothstep(min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}
