/**
 * Персонаж: Сестра Агата («Квадратик» с фонарем).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { HEROINE_CONFIG } from '../config/index.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.cubeSize = 0.85;
    // The collision circle represents her feet, not the full sprite.
    this.radius = 0.22;

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
    // Only the heroine ignores her own spotlight; camera lights still affect her.
    this.flashlightViewPosition = {value:new THREE.Vector3(10000, 10000, 10000)};
    this.spriteMaterial.onBeforeCompile = shader => {
      shader.uniforms.heroFlashlightPosition = this.flashlightViewPosition;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 heroFlashlightPosition;')
        .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
          'getSpotLightInfo( spotLight, geometryPosition, directLight );',
          'getSpotLightInfo( spotLight, geometryPosition, directLight );\nif (distance(spotLight.position, heroFlashlightPosition) < 0.01) directLight.color = vec3(0.0);'
        ));
    };
    this.spriteMaterial.customProgramCacheKey = () => 'hero-ignore-own-flashlight-v1';
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
    const light = new THREE.SpotLight(0xffc578, 30, 12, Math.PI / 4, 1, 1.3);
    this.flashlight = light;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    light.target = this.flashlightTarget;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerRay = new THREE.Raycaster();
    // Aim on the horizontal plane through the centre of the sprite.
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.775);
    this.aimPoint = new THREE.Vector3();
    this.aimDirection = new THREE.Vector3(-1, 0, -1).normalize();
    window.addEventListener('pointermove', event => {
      this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
      this.pointerActive = true;
    });
    // Raise the light so its beam falls onto the scene from above.
    light.position.set(0, 1.15, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.025;
    light.shadow.radius = 3;
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = 16;
    this.group.add(light);
  }

  update(inputData, boundLimit, dt, obstacles) {
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
    // Small steps prevent fast movement from tunnelling through narrow fences.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < steps; i++) {
      const nextX = THREE.MathUtils.clamp(this.group.position.x + dx / steps, -boundLimit, boundLimit);
      const nextZ = THREE.MathUtils.clamp(this.group.position.z + dz / steps, -boundLimit, boundLimit);
      if (!obstacles || !obstacles.isBlocked(nextX, this.group.position.z, this.radius)) this.group.position.x = nextX;
      if (!obstacles || !obstacles.isBlocked(this.group.position.x, nextZ, this.radius)) this.group.position.z = nextZ;
    }
  }

  updateFlashlight(camera) {
    // Keep the raised light aligned with the sprite centre in screen space.
    const viewDirection = camera.getWorldDirection(new THREE.Vector3());
    const projectionDistance = (0.775 - 1.15) / -viewDirection.y;
    this.flashlight.position.set(viewDirection.x * projectionDistance, 1.15, viewDirection.z * projectionDistance);
    this.flashlight.updateWorldMatrix(true, false);
    this.flashlight.getWorldPosition(this.flashlightViewPosition.value).applyMatrix4(camera.matrixWorldInverse);
    if (this.pointerActive) {
      this.pointerRay.setFromCamera(this.pointer, camera);
      if (this.pointerRay.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
        const dx = this.aimPoint.x - this.group.position.x;
        const dz = this.aimPoint.z - this.group.position.z;
        if (Math.hypot(dx, dz) > 0.1) this.aimDirection.set(dx, 0, dz).normalize();
      }
    }
    this.flashlightTarget.position.set(
      this.group.position.x + this.flashlight.position.x + this.aimDirection.x * 3,
      0.03,
      this.group.position.z + this.flashlight.position.z + this.aimDirection.z * 3
    );
    this.flashlightTarget.updateMatrixWorld();
  }

  getPosition() {
    return this.group.position;
  }
}
