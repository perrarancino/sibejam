/**
 * 2.5D Изометрическая сцена Three.js, камера и освещение.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060408);
    // Внимание: scene.fog рассчитывается от позиции камеры в небе (87м),
    // что окрашивало всю сцену в 100% черноту! Туманом управляет fogMist.js на земле.

    // Ортографическая изометрическая камера
    this.camera = new THREE.OrthographicCamera(-22, 22, 22, -22, 0.1, 200);
    this.cameraDistance = Math.hypot(45, 45); // ~63.6396
    this.cameraElevation = 60;
    this.cameraAngle = Math.PI / 4;
    this.targetCameraAngle = Math.PI / 4;
    this.isRotating = false;
    this.lastMouseX = 0;

    this.cameraOffset = new THREE.Vector3(45, 60, 45);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.desiredTarget = new THREE.Vector3(0, 0, 0);
    this.zoomLevel = 1.0;
    this.graphics = { frameLimit: 0, renderScale: 1 };
    try {
      const saved = JSON.parse(localStorage.getItem('sibejam-graphics-v2') || 'null');
      if (saved && [0, 60, 90].includes(saved.frameLimit)) this.graphics.frameLimit = saved.frameLimit;
      if (saved && [0.6, 0.75, 1].includes(saved.renderScale)) this.graphics.renderScale = saved.renderScale;
    } catch { /* Storage may be unavailable in a private browser. */ }
    this.shadowPosition = new THREE.Vector3();
    this.shadowTarget = new THREE.Vector3();
    this.lastShadowPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.lastShadowTarget = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.metricsTime = performance.now(); this.metricsFrames = 0; this.metricsPeak = 0;
    this.frameMetrics = { calls: 0, peak: 0, triangles: 0, fps: 0 };

    this.camera.position.copy(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);

    // Рендерер
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // One frame includes the scene, shadow passes and the separate fog overlay.
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(this.getRenderPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.container.appendChild(this.renderer.domElement);

    this.initLights();
    this.initListeners();
    this.initGraphicsUI();
    this.handleResize();
  }

  initLights() {
    // Мягкий ночной заполняющий свет (подчеркивает детали в тени)
    this.ambientLight = new THREE.AmbientLight(0x536a94, 0.27);
    this.scene.add(this.ambientLight);

    // Холодный свет неба и мягкий отражённый свет от земли.
    this.skyLight = new THREE.HemisphereLight(0x8daee8, 0x252736, 0.62);
    this.scene.add(this.skyLight);

    // Холодный лунный свет (отбрасывает мягкие тени от персонажа и стен)
    this.moonLight = new THREE.DirectionalLight(0x94b8ff, 0.58);
    this.moonLight.position.set(30, 50, 20);
    this.moonLight.castShadow = true;
    // The world shadow only changes when the editor or visibility buffers do.
    this.moonLight.shadow.autoUpdate = false;
    this.moonLight.shadow.needsUpdate = true;
    this.moonLight.shadow.mapSize.width = 2048;
    this.moonLight.shadow.mapSize.height = 2048;
    this.moonLight.shadow.camera.near = 10;
    this.moonLight.shadow.camera.far = 120;
    const shadowD = 25;
    this.moonLight.shadow.camera.left = -shadowD;
    this.moonLight.shadow.camera.right = shadowD;
    this.moonLight.shadow.camera.top = shadowD;
    this.moonLight.shadow.camera.bottom = -shadowD;
    this.moonLight.shadow.bias = -0.0005;
    this.moonLight.shadow.normalBias = 0.025;
    this.moonLight.shadow.radius = 2;
    this.scene.add(this.moonLight);
  }

  initListeners() {
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('wheel', (e) => {
      this.setZoom(this.zoomLevel * Math.exp(-e.deltaY * 0.0012));
    }, { passive: true });

    // Отключаем всплывающее меню браузера при клике ПКМ по игре
    window.addEventListener('contextmenu', (e) => {
      if (e.target === this.renderer.domElement || this.container.contains(e.target)) {
        e.preventDefault();
      }
    });

    // Вращение камеры при зажатии правой кнопки мыши (ПКМ)
    window.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        if (this.game?.editor?.active && this.game?.editor?.mode !== 'select') {
          return; // В редакторе ПКМ стирает объекты
        }
        if (e.target === this.renderer.domElement || this.container.contains(e.target)) {
          this.isRotating = true;
          this.lastMouseX = e.clientX;
          this.renderer.domElement.style.cursor = 'grabbing';
          e.preventDefault();
        }
      } else if (e.button === 1) { // Клик колесиком мыши (СКМ) сбрасывает угол к стандартному
        if (e.target === this.renderer.domElement || this.container.contains(e.target)) {
          this.targetCameraAngle = Math.PI / 4;
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isRotating) {
        const deltaX = e.clientX - this.lastMouseX;
        this.lastMouseX = e.clientX;
        this.targetCameraAngle -= deltaX * 0.006;
      }
    });

    const stopRotation = () => {
      if (this.isRotating) {
        this.isRotating = false;
        if (this.renderer?.domElement) {
          this.renderer.domElement.style.cursor = '';
        }
      }
    };

    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) stopRotation();
    });
    window.addEventListener('blur', stopRotation);
  }

  handleResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 34;
    this.camera.left = -frustumSize * Math.max(aspect, 1) / 2;
    this.camera.right = frustumSize * Math.max(aspect, 1) / 2;
    this.camera.top = frustumSize * Math.max(1, 1 / aspect) / 2;
    this.camera.bottom = -frustumSize * Math.max(1, 1 / aspect) / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.getRenderPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  getRenderPixelRatio() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.graphics.renderScale;
    // Bound fill cost on large/high-DPI displays; native mode remains available.
    return this.graphics.renderScale < 1
      ? Math.min(ratio, 1600 / Math.max(window.innerWidth, window.innerHeight))
      : ratio;
  }

  initGraphicsUI() {
    const panel = document.createElement('details');
    panel.className = 'graphics-settings';
    panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:90;color:#ded5e7;background:#15121de6;border:1px solid #4d4259;border-radius:6px;padding:8px 10px;font:12px system-ui;line-height:1.8';
    panel.innerHTML = '<summary style="cursor:pointer">Графика</summary><label>Кадры <select aria-label="Ограничение FPS"><option value="60">60 FPS — экономно</option><option value="90">90 FPS</option><option value="0">По герцовке монитора</option></select></label><br><label>Рендер <select aria-label="Разрешение рендера"><option value="0.6">60%</option><option value="0.75">75% — экономно</option><option value="1">100%</option></select></label><output style="display:block;max-width:280px" aria-label="Статистика отрисовки"></output>';
    this.graphicsPanel = panel; this.graphicsStats = panel.querySelector('output');
    const [frames, scale] = panel.querySelectorAll('select');
    frames.value = String(this.graphics.frameLimit); scale.value = String(this.graphics.renderScale);
    const save = () => {
      this.graphics.frameLimit = Number(frames.value);
      this.graphics.renderScale = Number(scale.value);
      try { localStorage.setItem('sibejam-graphics-v2', JSON.stringify(this.graphics)); } catch {}
      this.handleResize();
    };
    frames.addEventListener('change', save); scale.addEventListener('change', save);
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) panel.addEventListener(event, e => e.stopPropagation());
    panel.addEventListener('keydown', e => e.stopPropagation());
    document.body.appendChild(panel);
  }

  updateShadows(flashlight, force = false) {
    if (force) this.moonLight.shadow.needsUpdate = true;
    flashlight.shadow.autoUpdate = false;
    flashlight.getWorldPosition(this.shadowPosition);
    flashlight.target.getWorldPosition(this.shadowTarget);
    if (force || this.shadowPosition.distanceToSquared(this.lastShadowPosition) > 1e-6
      || this.shadowTarget.distanceToSquared(this.lastShadowTarget) > 1e-6) {
      flashlight.shadow.needsUpdate = true;
      this.lastShadowPosition.copy(this.shadowPosition);
      this.lastShadowTarget.copy(this.shadowTarget);
    }
  }

  setZoom(val) {
    this.zoomLevel = THREE.MathUtils.clamp(val, 0.65, 4.0);
    this.camera.zoom = this.zoomLevel;
    this.camera.updateProjectionMatrix();
  }

  updateCameraTracking(targetPos, dt) {
    this.desiredTarget.set(targetPos.x, 0, targetPos.z);
    this.cameraTarget.lerp(this.desiredTarget, 1 - Math.exp(-4.5 * dt));

    // Плавное следование за целевым углом вращения
    const angleDiff = this.targetCameraAngle - this.cameraAngle;
    this.cameraAngle += angleDiff * (1 - Math.exp(-18 * dt));

    const r = this.cameraDistance;
    this.cameraOffset.set(
      Math.sin(this.cameraAngle) * r,
      this.cameraElevation,
      Math.cos(this.cameraAngle) * r
    );

    this.camera.position.copy(this.cameraOffset).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  render() {
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  finishFrame(now) {
    const { calls, triangles } = this.renderer.info.render;
    this.metricsFrames++; this.metricsPeak = Math.max(this.metricsPeak, calls);
    const elapsed = now - this.metricsTime;
    if (elapsed < 500) return;
    const fps = this.metricsFrames * 1000 / elapsed;
    this.frameMetrics = { calls, peak: this.metricsPeak, triangles, fps };
    if (this.graphicsPanel.open) this.graphicsStats.textContent = `${Math.round(fps)} FPS · вызовы: ${calls}, пик: ${this.metricsPeak} · треугольники: ${(triangles / 1e6).toFixed(2)} млн`;
    this.metricsTime = now; this.metricsFrames = 0; this.metricsPeak = 0;
  }
}
