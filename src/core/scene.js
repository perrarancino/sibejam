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
    this.cameraOffset = new THREE.Vector3(45, 60, 45);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.desiredTarget = new THREE.Vector3(0, 0, 0);
    this.zoomLevel = 1.0;

    this.camera.position.copy(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);

    // Рендерер
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    this.initLights();
    this.initListeners();
    this.handleResize();
  }

  initLights() {
    // Мягкий ночной заполняющий свет (подчеркивает детали в тени)
    this.ambientLight = new THREE.AmbientLight(0x282035, 0.45);
    this.scene.add(this.ambientLight);

    // Холодный лунный свет (отбрасывает мягкие тени от персонажа и стен)
    this.moonLight = new THREE.DirectionalLight(0x8faec7, 0.6);
    this.moonLight.position.set(30, 50, 20);
    this.moonLight.castShadow = true;
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
    this.scene.add(this.moonLight);
  }

  initListeners() {
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('wheel', (e) => {
      this.setZoom(this.zoomLevel * Math.exp(-e.deltaY * 0.0012));
    }, { passive: true });
  }

  handleResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 34;
    this.camera.left = -frustumSize * Math.max(aspect, 1) / 2;
    this.camera.right = frustumSize * Math.max(aspect, 1) / 2;
    this.camera.top = frustumSize * Math.max(1, 1 / aspect) / 2;
    this.camera.bottom = -frustumSize * Math.max(1, 1 / aspect) / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setZoom(val) {
    this.zoomLevel = THREE.MathUtils.clamp(val, 0.65, 2.2);
    this.camera.zoom = this.zoomLevel;
    this.camera.updateProjectionMatrix();
  }

  updateCameraTracking(targetPos, dt) {
    this.desiredTarget.set(targetPos.x, 0, targetPos.z);
    this.cameraTarget.lerp(this.desiredTarget, 1 - Math.exp(-4.5 * dt));
    this.camera.position.copy(this.cameraOffset).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
