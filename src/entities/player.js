/**
 * Персонаж: Сестра Агата («Квадратик» с фонарем).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { HEROINE_CONFIG } from '../config/index.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.cubeSize = 0.85;
    this.radius = this.cubeSize / 2 + 0.1;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.currentRotation = 0;
    this.targetRotation = 0;

    this.createModel();
    this.group.position.set(0, 0, 4);
  }

  createModel() {
    // Тело Сестры Агаты (стилизованный монашеский куб)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2e2438,
      roughness: 0.5,
      metalness: 0.15
    });
    this.bodyCube = new THREE.Mesh(
      new THREE.BoxGeometry(this.cubeSize, this.cubeSize * 1.1, this.cubeSize),
      bodyMat
    );
    this.bodyCube.position.y = (this.cubeSize * 1.1) / 2;
    this.bodyCube.castShadow = true;
    this.bodyCube.receiveShadow = true;
    this.group.add(this.bodyCube);

    // Белый воротничок сестры
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xded8e6, roughness: 0.4 });
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(this.cubeSize * 1.02, 0.18, this.cubeSize * 1.02),
      collarMat
    );
    collar.position.y = this.cubeSize * 0.95;
    collar.castShadow = true;
    this.group.add(collar);

    // Золотистый визор / маркер направления взгляда
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xffd152,
      emissive: 0xffa01a,
      emissiveIntensity: 0.5,
      roughness: 0.3
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), visorMat);
    visor.position.set(0, this.cubeSize * 0.72, this.cubeSize / 2 + 0.04);
    this.group.add(visor);

    // Освященный фонарь
    this.lanternGroup = new THREE.Group();
    this.baseLanternPos = new THREE.Vector3(this.cubeSize / 2 + 0.2, this.cubeSize * 0.55, this.cubeSize / 4);
    this.lanternGroup.position.copy(this.baseLanternPos);

    const lanternMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.28, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x3d3127, metalness: 0.6, roughness: 0.3 })
    );
    lanternMesh.castShadow = false;
    this.lanternGroup.add(lanternMesh);

    // Ярко светящееся ядро фонаря
    const bulbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff6cc })
    );
    bulbMesh.position.y = -0.02;
    this.lanternGroup.add(bulbMesh);

    // Мягкий ореол свечения вокруг лампы (Sprite Halo)
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 64;
    haloCanvas.height = 64;
    const hctx = haloCanvas.getContext('2d');
    const hgrad = hctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    hgrad.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
    hgrad.addColorStop(0.35, 'rgba(255, 185, 75, 0.5)');
    hgrad.addColorStop(0.7, 'rgba(255, 125, 35, 0.15)');
    hgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    hctx.fillStyle = hgrad;
    hctx.fillRect(0, 0, 64, 64);
    const haloTex = new THREE.CanvasTexture(haloCanvas);

    const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    }));
    haloSprite.scale.set(1.0, 1.0, 1);
    this.lanternGroup.add(haloSprite);

    // 1. Горячее белое ядро пламени (Hot White-Gold Core)
    this.coreLight = new THREE.PointLight(0xfff6dd, 5.5, 4.2, 1.1);
    this.coreLight.position.set(0.05, 0, 0.08);
    this.coreLight.castShadow = false;
    this.lanternGroup.add(this.coreLight);

    // 2. Основной янтарно-золотой луч фонаря (Warm Amber Body)
    this.lanternLight = new THREE.PointLight(0xffae42, 6.8, 9.2, 1.15);
    this.lanternLight.position.set(0.05, 0, 0.08);
    this.lanternLight.castShadow = false;
    this.lanternGroup.add(this.lanternLight);

    // 3. Глубокий багряно-янтарный периметр (Deep Crimson-Amber Penumbra)
    this.auraLight = new THREE.PointLight(0xd46016, 3.6, 13.5, 1.45);
    this.auraLight.position.set(0, 0, 0);
    this.auraLight.castShadow = false;
    this.lanternGroup.add(this.auraLight);

    this.haloSprite = haloSprite;
    this.windLag = new THREE.Vector3(0, 0, 0);

    // 4. Подсветка непосредственно под ногами героини (равномерное основание)
    this.feetLight = new THREE.PointLight(0xffbf66, 3.2, 5.5, 1.25);
    this.feetLight.position.set(0, 0.35, 0);
    this.feetLight.castShadow = false;
    this.group.add(this.feetLight);

    this.group.add(this.lanternGroup);
  }

  update(inputData, boundLimit, dt, now) {
    const { screenX, screenY, isMoving, isRunning } = inputData;
    let worldDx = 0;
    let worldDz = 0;

    if (isMoving) {
      // Преобразование экранного ввода в мировые изометрические координаты
      const screenLen = Math.hypot(screenX, screenY);
      const normX = screenX / screenLen;
      const normY = screenY / screenLen;

      const speed = isRunning ? HEROINE_CONFIG.runSpeed : HEROINE_CONFIG.walkSpeed;
      worldDx = (normX - normY) * 0.70710678 * speed * dt;
      worldDz = (-normX - normY) * 0.70710678 * speed * dt;

      // Перемещение с ограничением границ карты
      this.group.position.x = THREE.MathUtils.clamp(this.group.position.x + worldDx, -boundLimit, boundLimit);
      this.group.position.z = THREE.MathUtils.clamp(this.group.position.z + worldDz, -boundLimit, boundLimit);

      // Плавный поворот куба в сторону движения
      this.targetRotation = Math.atan2(worldDx, worldDz);
      const diff = Math.atan2(
        Math.sin(this.targetRotation - this.currentRotation),
        Math.cos(this.targetRotation - this.currentRotation)
      );
      this.currentRotation += diff * Math.min(1.0, 14 * dt);
      this.group.rotation.y = this.currentRotation;

      // Анимация шага Агаты и вертикального покачивания
      const bobFreq = isRunning ? 16 : 10;
      const bobAmp = isRunning ? 0.055 : 0.028;
      const bob = Math.sin(now * 0.001 * bobFreq) * bobAmp;
      this.bodyCube.position.y = (this.cubeSize * 1.1) / 2 + Math.abs(bob) * 0.6;

      // Инерционное отставание фонаря от ветра при движении
      const dragFactor = isRunning ? 0.024 : 0.012;
      const targetLagX = -worldDx / (dt || 0.016) * dragFactor;
      const targetLagZ = -worldDz / (dt || 0.016) * dragFactor;
      this.windLag.x = THREE.MathUtils.lerp(this.windLag.x, targetLagX, 12 * dt);
      this.windLag.z = THREE.MathUtils.lerp(this.windLag.z, targetLagZ, 12 * dt);

      this.lanternGroup.position.set(
        this.baseLanternPos.x + this.windLag.x,
        this.baseLanternPos.y + bob,
        this.baseLanternPos.z + this.windLag.z
      );

      // Наклон фонаря от сопротивления воздуха
      if (isRunning) {
        this.lanternGroup.rotation.x = THREE.MathUtils.lerp(this.lanternGroup.rotation.x, -0.22, 12 * dt);
        this.lanternGroup.rotation.z = THREE.MathUtils.lerp(this.lanternGroup.rotation.z, Math.sin(now * 0.015) * 0.12, 12 * dt);
      } else {
        const pendulum = Math.sin(now * 0.001 * 10) * 0.08;
        this.lanternGroup.rotation.x = THREE.MathUtils.lerp(this.lanternGroup.rotation.x, -0.06, 8 * dt);
        this.lanternGroup.rotation.z = THREE.MathUtils.lerp(this.lanternGroup.rotation.z, pendulum, 8 * dt);
      }
    } else {
      // Плавный возврат в исходное положение покоя
      this.bodyCube.position.y = THREE.MathUtils.lerp(this.bodyCube.position.y, (this.cubeSize * 1.1) / 2, 10 * dt);
      this.windLag.lerp(new THREE.Vector3(0, 0, 0), 10 * dt);
      this.lanternGroup.position.set(
        THREE.MathUtils.lerp(this.lanternGroup.position.x, this.baseLanternPos.x, 10 * dt),
        THREE.MathUtils.lerp(this.lanternGroup.position.y, this.baseLanternPos.y, 10 * dt),
        THREE.MathUtils.lerp(this.lanternGroup.position.z, this.baseLanternPos.z, 10 * dt)
      );
      this.lanternGroup.rotation.x = THREE.MathUtils.lerp(this.lanternGroup.rotation.x, 0, 10 * dt);
      this.lanternGroup.rotation.z = THREE.MathUtils.lerp(this.lanternGroup.rotation.z, 0, 10 * dt);
    }

    // =========================================================================
    // ФИЗИКА ДРОЖАНИЯ ПЛАМЕНИ (FLAME FLICKER & WIND DRAFT)
    // Покой: мягкое размеренное дыхание огня.
    // Ходьба: легкое дрожание от встречного воздуха.
    // Бег: резкие, неистовые порывы ветра, метание пламени и скачки яркости.
    // =========================================================================
    let flameFlicker = 0;
    let haloScale = 1.0;

    if (isRunning) {
      // Бег: сильное турбулентное дрожание и порывы ветра
      const gust1 = Math.sin(now * 0.034) * 1.35;
      const gust2 = Math.cos(now * 0.058) * 0.85;
      const microWind = (Math.sin(now * 0.092) * 0.45 + (Math.random() - 0.5) * 0.65);
      flameFlicker = gust1 + gust2 + microWind;

      // Динамический сдвиг цветовой температуры (при задувании — глубокий янтарь, при вспышке — яркое золото)
      const colorT = THREE.MathUtils.clamp((flameFlicker + 1.8) / 3.6, 0.0, 1.0);
      this.lanternLight.color.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.68, 0.94, colorT),
        THREE.MathUtils.lerp(0.24, 0.65, colorT)
      );

      haloScale = THREE.MathUtils.clamp(1.0 + flameFlicker * 0.16, 0.65, 1.45);
    } else if (isMoving) {
      // Ходьба: умеренное, более слабое дрожание пламени
      const walkDraft1 = Math.sin(now * 0.015) * 0.55;
      const walkDraft2 = Math.cos(now * 0.026) * 0.35;
      const microDraft = (Math.sin(now * 0.048) * 0.18);
      flameFlicker = walkDraft1 + walkDraft2 + microDraft;

      this.lanternLight.color.setRGB(1.0, 0.87, 0.53);
      haloScale = THREE.MathUtils.clamp(1.0 + flameFlicker * 0.08, 0.85, 1.2);
    } else {
      // Покой: плавное, мягкое дыхание фитиля
      const calm1 = Math.sin(now * 0.0035) * 0.28;
      const calm2 = Math.sin(now * 0.008) * 0.16;
      flameFlicker = calm1 + calm2;

      this.lanternLight.color.setRGB(1.0, 0.87, 0.53);
      haloScale = 1.0 + calm1 * 0.05;
    }

    // Применение яркости ко всем уровням хроматического света
    if (this.coreLight) {
      this.coreLight.intensity = THREE.MathUtils.clamp(5.5 + flameFlicker * 0.6, 2.5, 8.5);
    }
    this.lanternLight.intensity = THREE.MathUtils.clamp(6.8 + flameFlicker * 0.85, 3.2, 10.5);
    this.auraLight.intensity = THREE.MathUtils.clamp(3.6 + flameFlicker * 0.45, 1.8, 5.8);
    this.feetLight.intensity = THREE.MathUtils.clamp(3.2 + flameFlicker * 0.3, 1.8, 4.8);

    // Анимация ореола пламени
    if (this.haloSprite) {
      this.haloSprite.scale.set(haloScale, haloScale, 1);
    }
  }

  getPosition() {
    return this.group.position;
  }
}
