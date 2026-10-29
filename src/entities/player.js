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
    const material = new THREE.MeshStandardMaterial({
      color: 0xffe3a3, emissive: 0xffa63a, emissiveIntensity: 1.2, roughness: 0.6
    });
    this.bodyCube = new THREE.Mesh(new THREE.BoxGeometry(this.cubeSize, this.cubeSize, this.cubeSize), material);
    this.bodyCube.position.y = this.cubeSize / 2;
    this.group.add(this.bodyCube);
    const light = new THREE.PointLight(0xffc578, 18, 16, 1.3);
    light.position.y = this.cubeSize / 2;
    this.group.add(light);
  }

  update(inputData, boundLimit, dt) {
    const { screenX, screenY, isMoving, isRunning } = inputData;
    if (!isMoving) return;
    const len = Math.hypot(screenX, screenY);
    if (!len) return;
    const speed = isRunning ? HEROINE_CONFIG.runSpeed : HEROINE_CONFIG.walkSpeed;
    const dx = (screenX - screenY) / len * 0.70710678 * speed * dt;
    const dz = (-screenX - screenY) / len * 0.70710678 * speed * dt;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x + dx, -boundLimit, boundLimit);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z + dz, -boundLimit, boundLimit);
  }

  getPosition() {
    return this.group.position;
  }
}
