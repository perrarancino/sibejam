/**
 * Карта кладбища (Поле, границы, зона Священных Тыкв).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { ENVIRONMENT_CONFIG } from '../config/index.js';

export class GraveyardMap {
  constructor(scene) {
    this.scene = scene;
    this.fieldSize = ENVIRONMENT_CONFIG.fieldSize;
    this.halfField = this.fieldSize / 2;
    this.wallThickness = 0.35;
    this.wallHeight = 0.5;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.createGround();
  }

  createGroundTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');

    // Кладбищенская земля (сырая темная брусчатка)
    ctx.fillStyle = '#1c1622';
    ctx.fillRect(0, 0, 512, 512);

    // Сетка каменных плит
    const tileSize = 64;
    ctx.strokeStyle = '#120e16';
    ctx.lineWidth = 3;
    for (let x = 0; x <= 512; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Текстурный гравий и сколы камня
    for (let i = 0; i < 2600; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const r = Math.random() * 1.5;
      ctx.fillStyle = Math.random() > 0.4 ? '#140f1a' : '#2d2235';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.fieldSize / 4, this.fieldSize / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createGroundBumpTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');

    // Базовый уровень плит (серый рельеф)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Углубления швов между плитами (темные канавки)
    const tileSize = 64;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Выступающие камешки и зернистость камня (светлые точки)
    for (let i = 0; i < 2800; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const r = Math.random() * 1.6;
      ctx.fillStyle = Math.random() > 0.5 ? '#b8b8b8' : '#555555';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.fieldSize / 4, this.fieldSize / 4);
    return tex;
  }

  createGroundRoughnessTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');

    // Сырые каменные плиты (умеренно гладкие, ловят легкие блики света)
    ctx.fillStyle = '#656565';
    ctx.fillRect(0, 0, 512, 512);

    // Матовые сухие швы
    const tileSize = 64;
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 3;
    for (let x = 0; x <= 512; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.fieldSize / 4, this.fieldSize / 4);
    return tex;
  }

  createGround() {
    const groundGeo = new THREE.BoxGeometry(this.fieldSize, 0.6, this.fieldSize);
    const texture = new THREE.TextureLoader().load('./assets/ground-krita.png?v=2');
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(this.fieldSize / 8, this.fieldSize / 8);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const groundMat = new THREE.MeshStandardMaterial({
      map: texture, emissiveMap: texture, emissive: 0xffffff,
      emissiveIntensity: 0.12, roughness: 1, metalness: 0
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.position.y = -0.3;
    this.groundMesh.receiveShadow = true;
    this.group.add(this.groundMesh);
  }

  createBorders() {
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x3e3247, roughness: 0.7 });
    const cornerMat = new THREE.MeshStandardMaterial({ color: 0x5e4b6c, roughness: 0.6 });

    const createWall = (w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), borderMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };

    // 4 стены по периметру
    createWall(this.fieldSize, this.wallHeight, this.wallThickness, 0, this.wallHeight / 2, -this.halfField);
    createWall(this.fieldSize, this.wallHeight, this.wallThickness, 0, this.wallHeight / 2, this.halfField);
    createWall(this.wallThickness, this.wallHeight, this.fieldSize, -this.halfField, this.wallHeight / 2, 0);
    createWall(this.wallThickness, this.wallHeight, this.fieldSize, this.halfField, this.wallHeight / 2, 0);

    // Угловые могильные столбики
    [
      [-this.halfField, -this.halfField],
      [this.halfField, -this.halfField],
      [-this.halfField, this.halfField],
      [this.halfField, this.halfField]
    ].forEach(([cx, cz]) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), cornerMat);
      pillar.position.set(cx, 0.6, cz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);
    });
  }

  createRelicPatch() {
    // Центральная святыня
    const relicGeo = new THREE.CylinderGeometry(2.0, 2.2, 0.08, 24);
    const relicMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.9 });
    const relicPatch = new THREE.Mesh(relicGeo, relicMat);
    relicPatch.position.set(0, 0.04, 0);
    relicPatch.receiveShadow = true;
    this.group.add(relicPatch);

    // Золотистый освященный круг
    const ringGeo = new THREE.RingGeometry(1.6, 1.8, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xd9822b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, 0.09, 0);
    this.group.add(this.ring);

    // Мягкое священное свечение сердца клумбы
    this.relicLight = new THREE.PointLight(0xd9822b, 1.8, 6.5, 1.6);
    this.relicLight.position.set(0, 0.4, 0);
    this.group.add(this.relicLight);
  }

  update(now) {
    // Медленное дыхание святыни (пульсация благодати)
    const pulse = Math.sin(now * 0.002) * 0.35;
    if (this.relicLight) {
      this.relicLight.intensity = 1.8 + pulse;
    }
    if (this.ringMat) {
      this.ringMat.opacity = 0.4 + pulse * 0.15;
    }
  }

  getBoundaryLimit(characterRadius) {
    return this.halfField - this.wallThickness - characterRadius;
  }
}
