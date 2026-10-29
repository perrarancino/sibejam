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
    this.lanternGroup.position.set(this.cubeSize / 2 + 0.2, this.cubeSize * 0.55, this.cubeSize / 4);

    const lanternMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.28, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x3d3127, metalness: 0.6, roughness: 0.3 })
    );
    // Фонарь не должен отбрасывать тень сам на себя и на землю под собой
    lanternMesh.castShadow = false;
    this.lanternGroup.add(lanternMesh);

    // Ярко светящееся ядро фонаря
    const bulbMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff0aa })
    );
    bulbMesh.position.y = -0.02;
    this.lanternGroup.add(bulbMesh);

    // Мягкий ореол свечения вокруг лампы (Sprite Halo)
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 64;
    haloCanvas.height = 64;
    const hctx = haloCanvas.getContext('2d');
    const hgrad = hctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    hgrad.addColorStop(0, 'rgba(255, 235, 170, 0.95)');
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

    // Основной яркий точечный свет фонаря (без самозатенения, освещает всё вокруг)
    this.lanternLight = new THREE.PointLight(0xffdf88, 7.5, 9.5, 1.1);
    this.lanternLight.position.set(0.05, 0, 0.08);
    this.lanternLight.castShadow = false;
    this.lanternGroup.add(this.lanternLight);

    // Вторичный теплый купол янтарного света
    this.auraLight = new THREE.PointLight(0xff9933, 4.0, 12.5, 1.5);
    this.auraLight.position.set(0, 0, 0);
    this.auraLight.castShadow = false;
    this.lanternGroup.add(this.auraLight);

    // Подсветка непосредственно под ногами героини (исключает любые темные провалы у ног)
    this.feetLight = new THREE.PointLight(0xffbe66, 3.5, 5.0, 1.3);
    this.feetLight.position.set(0, 0.35, 0);
    this.feetLight.castShadow = false;
    this.group.add(this.feetLight);

    this.group.add(this.lanternGroup);
  }

  update(inputData, boundLimit, dt, now) {
    const { screenX, screenY, isMoving, isRunning } = inputData;

    if (isMoving) {
      // Преобразование экранного ввода в мировые изометрические координаты
      const screenLen = Math.hypot(screenX, screenY);
      const normX = screenX / screenLen;
      const normY = screenY / screenLen;

      const speed = isRunning ? HEROINE_CONFIG.runSpeed : HEROINE_CONFIG.walkSpeed;
      const worldDx = (normX - normY) * 0.70710678 * speed * dt;
      const worldDz = (-normX - normY) * 0.70710678 * speed * dt;

      // Перемещение с ограничением границ карты
      this.group.position.x = THREE.MathUtils.clamp(this.group.position.x + worldDx, -boundLimit, boundLimit);
      this.group.position.z = THREE.MathUtils.clamp(this.group.position.z + worldDz, -boundLimit, boundLimit);

      // Плавный поворот в сторону движения
      this.targetRotation = Math.atan2(worldDx, worldDz);
      const diff = Math.atan2(
        Math.sin(this.targetRotation - this.currentRotation),
        Math.cos(this.targetRotation - this.currentRotation)
      );
      this.currentRotation += diff * Math.min(1.0, 14 * dt);
      this.group.rotation.y = this.currentRotation;

      // Анимация покачивания фонаря и куба
      const bobFreq = isRunning ? 16 : 10;
      const bob = Math.sin(now * 0.001 * bobFreq) * (isRunning ? 0.06 : 0.03);
      this.lanternGroup.position.y = (this.cubeSize * 0.55) + bob;
      this.bodyCube.position.y = (this.cubeSize * 1.1) / 2 + Math.abs(bob) * 0.5;
    } else {
      // Плавный возврат в исходное положение покоя
      this.lanternGroup.position.y = THREE.MathUtils.lerp(this.lanternGroup.position.y, this.cubeSize * 0.55, 10 * dt);
      this.bodyCube.position.y = THREE.MathUtils.lerp(this.bodyCube.position.y, (this.cubeSize * 1.1) / 2, 10 * dt);
    }

    // Живое мерцание пламени фонаря
    const flicker = Math.sin(now * 0.007) * 0.45 + Math.cos(now * 0.013) * 0.22;
    this.lanternLight.intensity = 7.5 + flicker;
    this.auraLight.intensity = 4.0 + flicker * 0.4;
    this.feetLight.intensity = 3.5 + flicker * 0.3;
  }

  getPosition() {
    return this.group.position;
  }
}
