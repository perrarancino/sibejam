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
    // Shadow is drawn separately on the ground from the sprite alpha.
    this.group.add(this.bodyCube);
    this.shadowUniforms = {uSprite:{value:this.characterTexture}, uFrame:{value:0}};
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms:this.shadowUniforms,
      vertexShader:`varying vec2 vShadowUv; void main(){vShadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform sampler2D uSprite;uniform float uFrame;varying vec2 vShadowUv;void main(){vec2 uv=vec2((vShadowUv.x+uFrame)/6.0,vShadowUv.y);float silhouette=texture2D(uSprite,uv).a;gl_FragColor=vec4(0.015,0.01,0.025,silhouette*0.38);}`,
      transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1
    });
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9,1.55),shadowMaterial);
    this.groundShadow.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), 0.37)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI / 2));
    this.groundShadow.position.set(-0.19,0.015,-0.49);
    this.group.add(this.groundShadow);
    const light = new THREE.PointLight(0xffc578, 18, 16, 1.3);
    // The lantern follows the character's hand in the billboard's local space.
    light.position.set(0.19, -0.06, 0.12);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.025;
    light.shadow.camera.near = 0.15;
    light.shadow.camera.far = 16;
    this.bodyCube.add(light);
  }

  update(inputData, boundLimit, dt) {
    const { screenX, screenY, isMoving, isRunning } = inputData;
    if (!isMoving) {
      this.animationTime = 0;
      this.characterTexture.offset.x = 0;
      this.shadowUniforms.uFrame.value = 0;
      return;
    }
    this.animationTime += dt;
    const frame = Math.floor(this.animationTime / 0.1) % 6;
    this.characterTexture.offset.x = frame / 6;
    this.shadowUniforms.uFrame.value = frame;
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
