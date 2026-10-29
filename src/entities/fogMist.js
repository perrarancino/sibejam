/**
 * Динамическая система дымки и живого тумана (Fog of War & Atmospheric Mist).
 * Устраняет статичный круг освещения: края света колышутся живыми клубами тумана,
 * а над землей плывут полупрозрачные клубящиеся частицы дымки.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export class FogMistManager {
  constructor(scene, fieldSize = 34) {
    this.scene = scene;
    this.fieldSize = fieldSize;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.createVolumetricGroundMist();
    this.createFloatingMistWisps();
  }

  /**
   * Анимированный шейдерный слой тумана прямо над землей.
   * Граница света органически искажается процедурным шумом (перлин/симплекс),
   * создавая клубящиеся щупальца дымки вместо плоского круга.
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

      // 2D Шум для клубящегося тумана
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

        // Двухслойный анимированный шум (ветер гонит дымку)
        vec2 wind1 = vec2(uTime * 0.07, uTime * 0.035);
        vec2 wind2 = vec2(-uTime * 0.05, uTime * 0.08);
        float n1 = snoise(worldXZ * 0.16 + wind1);
        float n2 = snoise(worldXZ * 0.32 + wind2) * 0.5;
        float mistFlow = n1 + n2;

        // Динамическое искажение границы света клубами тумана
        float perturbedDist = dist - mistFlow * 2.4;

        // Рассеивание тумана около Агаты:
        // Вблизи Агаты дымка полупрозрачная, вдалеке — глубокая темная мгла
        float innerClear = smoothstep(1.8, uLanternRadius * 1.35, perturbedDist);

        // Плотность и колыхание тумана
        float hazeDensity = 0.72 + 0.28 * mistFlow;
        float alpha = clamp(innerClear * hazeDensity, 0.0, 0.98);

        // Теплый отблеск на клубах тумана, касающихся освященного света (дымка в лучах)
        float edgeGlowFactor = smoothstep(1.5, uLanternRadius * 0.9, dist) * (1.0 - smoothstep(uLanternRadius * 0.9, uLanternRadius * 1.5, dist));
        vec3 darkFogColor = vec3(0.024, 0.016, 0.032);
        vec3 holyLightColor = vec3(0.98, 0.72, 0.32);

        vec3 color = mix(darkFogColor, holyLightColor, edgeGlowFactor * 0.38 * (0.6 + 0.4 * n1));

        gl_FragColor = vec4(color, alpha);
      }
    `;

    this.groundMistUniforms = {
      uPlayerPos: { value: new THREE.Vector3(0, 0, 4) },
      uTime: { value: 0 },
      uLanternRadius: { value: 6.2 }
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
    this.groundMistMesh.position.y = 0.07; // чуть выше плитки поля
    this.groundMistMesh.renderOrder = 3;
    this.group.add(this.groundMistMesh);
  }

  /**
   * Парящие клубы дымки (плавающие объемные частицы тумана).
   * Дрейфуют над полем, плавно покачиваясь и озаряясь золотом в лучах фонаря.
   */
  createFloatingMistWisps() {
    // Генерация текстуры мягкого облачка дымки на canvas
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.35, 'rgba(230, 220, 240, 0.45)');
    grad.addColorStop(0.7, 'rgba(180, 160, 200, 0.15)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const mistTexture = new THREE.CanvasTexture(cv);

    this.wisps = [];
    const count = 48;
    const spawnRange = this.fieldSize * 0.45;

    for (let i = 0; i < count; i++) {
      const size = 3.5 + Math.random() * 3.5;
      const mat = new THREE.SpriteMaterial({
        map: mistTexture,
        color: 0x1b1424,
        transparent: true,
        opacity: 0.18 + Math.random() * 0.22,
        blending: THREE.NormalBlending,
        depthWrite: false
      });

      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(size, size, 1);

      const x = (Math.random() - 0.5) * spawnRange * 2;
      const z = (Math.random() - 0.5) * spawnRange * 2;
      const y = 0.35 + Math.random() * 1.4;
      sprite.position.set(x, y, z);
      sprite.renderOrder = 4;

      this.group.add(sprite);

      this.wisps.push({
        sprite,
        mat,
        baseX: x,
        baseZ: z,
        baseY: y,
        speedX: 0.15 + Math.random() * 0.35,
        speedZ: 0.1 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        baseOpacity: mat.opacity,
        size
      });
    }
  }

  update(playerPos, dt, now) {
    const time = now * 0.001;

    // Обновление униформов шейдера земли
    this.groundMistUniforms.uTime.value = time;
    this.groundMistUniforms.uPlayerPos.value.copy(playerPos);

    // Анимация парящих клубов дымки
    const half = this.fieldSize * 0.48;
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];

      // Дрейф по ветру
      w.sprite.position.x += w.speedX * dt;
      w.sprite.position.z += w.speedZ * dt;
      w.sprite.position.y = w.baseY + Math.sin(time * 1.2 + w.phase) * 0.22;

      // Циклический перенос при выходе за границы
      if (w.sprite.position.x > half) w.sprite.position.x = -half;
      if (w.sprite.position.z > half) w.sprite.position.z = -half;

      // Расстояние до Агаты
      const dx = w.sprite.position.x - playerPos.x;
      const dz = w.sprite.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);

      // В лучах фонаря клубы дымки озаряются теплым золотистым светом
      if (dist < 8.0) {
        const lightIntensity = Math.max(0, 1.0 - dist / 8.0);
        // Интерполяция цвета от темной мглы к теплой золотистой дымке
        w.mat.color.setRGB(
          THREE.MathUtils.lerp(0.12, 0.95, lightIntensity * 0.65),
          THREE.MathUtils.lerp(0.09, 0.72, lightIntensity * 0.65),
          THREE.MathUtils.lerp(0.16, 0.35, lightIntensity * 0.65)
        );
        w.mat.opacity = w.baseOpacity * (1.0 + lightIntensity * 0.8);
      } else {
        // Вдалеке от света — глубокая темная мгла
        w.mat.color.setRGB(0.08, 0.05, 0.11);
        w.mat.opacity = w.baseOpacity;
      }
    }
  }
}
