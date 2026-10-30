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
    this.group.position.set(0, 0, 6);
  }

  createModel() {
    this.characterTexture = new THREE.TextureLoader().load('./assets/character-sheet.png');
    this.characterTexture.colorSpace = THREE.SRGBColorSpace;
    this.characterTexture.magFilter = THREE.NearestFilter;
    this.characterTexture.minFilter = THREE.NearestFilter;
    this.characterTexture.generateMipmaps = false;
    this.characterTexture.repeat.set(1 / 6, 1);
    this.animationTime = 0;
    this.spriteMaterial = new THREE.MeshStandardMaterial({map:this.characterTexture, alphaTest:0.1, side:THREE.DoubleSide, roughness:1, emissive:0xffffff, emissiveMap:this.characterTexture, emissiveIntensity:0.12});
    this.bodyCube = new THREE.Mesh(new THREE.PlaneGeometry(0.78,1.55), this.spriteMaterial);
    this.bodyCube.position.y = 0.775;
    this.group.add(this.bodyCube);
    const light = new THREE.PointLight(0xffc578, 18, 16, 1.3);
    light.position.y = this.cubeSize / 2;
    this.group.add(light);
  }

  update(inputData, boundLimit, dt) {
    const { screenX, screenY, isMoving, isRunning } = inputData;
    if (!isMoving) {
      this.animationTime = 0;
      this.characterTexture.offset.x = 0;
      return;
    }
    this.animationTime += dt;
    this.characterTexture.offset.x = Math.floor(this.animationTime / 0.1) % 6 / 6;
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
