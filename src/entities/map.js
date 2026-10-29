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
    this.createBorders();
    this.createRelicPatch();
  }

  createGroundTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');

    // Кладбищенская земля
    ctx.fillStyle = '#201925';
    ctx.fillRect(0, 0, 512, 512);

    // Тактическая плиточная сетка
    const tileSize = 64;
    ctx.strokeStyle = '#2d2235';
    ctx.lineWidth = 2;
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

    // Текстурный гравий и шумы
    for (let i = 0; i < 2400; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const r = Math.random() * 1.5;
      ctx.fillStyle = Math.random() > 0.5 ? '#17111b' : '#392c43';
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

  createGround() {
    const groundGeo = new THREE.BoxGeometry(this.fieldSize, 0.6, this.fieldSize);
    const groundMat = new THREE.MeshStandardMaterial({
      map: this.createGroundTexture(),
      roughness: 0.88,
      metalness: 0.1
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
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd9822b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.09, 0);
    this.group.add(ring);
  }

  getBoundaryLimit(characterRadius) {
    return this.halfField - this.wallThickness - characterRadius;
  }
}
