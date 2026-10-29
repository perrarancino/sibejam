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
    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      uniform vec3 uPlayerPos;
      uniform float uTime;
      uniform float uLanternRadius;

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
        vec2 worldXZ = vWorldPosition.xz;
        float dist = distance(worldXZ, uPlayerPos.xz);

        // Слоистые вытянутые потоки и мягкая, неровная граница видимости.
        vec2 flow = vec2(worldXZ.x * 0.10 + worldXZ.y * 0.035, worldXZ.y * 0.24);
        float warp = snoise(flow * 0.75 + vec2(uTime * 0.025, -uTime * 0.018));
        float ribbons = snoise(flow + vec2(warp * 0.55 + uTime * 0.035, -uTime * 0.02));
        float fine = snoise(flow * 1.9 + vec2(-uTime * 0.018, uTime * 0.027));
        float veil = smoothstep(1.7, 9.0, dist + ribbons * 0.38 + warp * 0.18);
        float opaqueFog = smoothstep(7.5, 13.5, dist);
        float variation = clamp(0.9 + ribbons * 0.07 + fine * 0.035, 0.62, 1.0);
        vec3 fogColor = mix(vec3(0.035, 0.055, 0.047), vec3(0.10, 0.14, 0.115), clamp(0.5 + 0.25 * ribbons, 0.0, 1.0));
        float alpha = mix(clamp(veil * 0.82 * variation, 0.0, 0.82), 1.0, opaqueFog);
        gl_FragColor = vec4(fogColor, alpha);
      }
    `;

    this.groundMistUniforms = {
      uPlayerPos: { value: new THREE.Vector3(0, 0, 4) },
      uTime: { value: 0 },
      uLanternRadius: { value: 6.8 }
    };

    const mistGeo = new THREE.PlaneGeometry(this.fieldSize, this.fieldSize, 64, 64);
    const mistMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.groundMistUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.groundMistMesh = new THREE.Mesh(mistGeo, mistMat);
    this.groundMistMesh.rotation.x = -Math.PI / 2;
    this.groundMistMesh.position.y = 0.06;
    this.groundMistMesh.renderOrder = 3;
    this.group.add(this.groundMistMesh);
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
        color: 0xa9c1ae,
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
