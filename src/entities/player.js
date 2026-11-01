/**
 * Персонаж: Сестра Агата, скелетная модель и фонарь у кисти.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { HEROINE_CONFIG } from '../config/index.js';
import { steer } from './locomotion.js';
import { makeInPlace } from './inPlace.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.cubeSize = 0.85;
    // Collision follows the feet.
    this.radius = 0.22;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.motion = {x:0,z:0,yaw:0};
    this.blend = {idle:1,walking:0,running:0};
    this.gaitPhase = 0;

    this.createModel();
    this.group.position.set(0, 0, 6);
  }

  createModel() {
    this.visual = new THREE.Group();
    this.group.add(this.visual);
    this.stepTimer = 0;
    this.actions = {};
    this.rootPoint = new THREE.Vector3();
    this.lanternLightView = {value:new THREE.Vector3(10000,10000,10000)};
    this.ignoredLanternShadowDraws = 0;
    new GLTFLoader().load('./assets/characters/hero.glb?v=opaque-materials-9', gltf => {
      const model = gltf.scene;
      this.model = model;
      model.traverse(obj => {
        if (obj.isBone && /Hips$/.test(obj.name)) this.rootBone = obj;
        if (obj.isMesh) {
          obj.castShadow = true; obj.receiveShadow = true;
          this.excludeOwnLantern(obj);
        }
      });
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(makeInPlace(clip));
      this.setAnimation('idle');
      this.mixer.update(0);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      const size = box.getSize(new THREE.Vector3());
      const scale = 1.65 / size.y;
      model.scale.setScalar(scale);
      model.position.set(-(box.min.x + box.max.x) * scale / 2, -box.min.y * scale, -(box.min.z + box.max.z) * scale / 2);
      // Bounds above are measured before attaching to a translated world group.
      this.visual.add(model);
      model.traverse(obj => { if (obj.isBone && /RightHand$/.test(obj.name)) this.lanternHand = obj; });
      this.centerRoot();
      this.prepareGrounding(model);
      this.groundFeet();
    }, undefined, error => console.error('Не удалось загрузить героиню:', error));
    this.lanternPosition = new THREE.Vector3();
    this.lantern = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({color:0x302820,metalness:.65,roughness:.5});
    const glow = new THREE.MeshBasicMaterial({color:0xffd38a});
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.14,8),glow);
    this.lantern.add(glass);
    for (const y of [-.09,.09]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.025,8),metal);
      cap.position.y=y; this.lantern.add(cap);
    }
    for(let i=0;i<4;i++){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.012,.18,.012),metal);
      const angle=i*Math.PI/2;bar.position.set(Math.sin(angle)*.06,0,Math.cos(angle)*.06);this.lantern.add(bar);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.045,.009,5,12),metal);
    handle.position.y=.125;this.lantern.add(handle);
    this.group.add(this.lantern);
    const light = new THREE.SpotLight(0xffc578, 30, 12, Math.PI / 4, 1, 1.3);
    this.flashlight = light;

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    light.target = this.flashlightTarget;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.pointerRay = new THREE.Raycaster();
    // Aim through the world at torso height.
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.775);
    this.aimPoint = new THREE.Vector3();
    this.aimDirection = new THREE.Vector3(-1, 0, -1).normalize();
    window.addEventListener('pointermove', event => {
      this.pointer.set(event.clientX / window.innerWidth * 2 - 1, 1 - event.clientY / window.innerHeight * 2);
      this.pointerActive = true;
    });
    light.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.025;
    light.shadow.radius = 3;
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = 16;
    this.lantern.add(light);
  }

  excludeOwnLantern(mesh) {
    for (const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material])) {
      if (material.userData.ignoreAgataLantern) continue;
      material.userData.ignoreAgataLantern = true;
      material.onBeforeCompile = shader => {
        shader.uniforms.agataLanternViewPosition = this.lanternLightView;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 agataLanternViewPosition;')
          .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
            'getSpotLightInfo( spotLight, geometryPosition, directLight );',
            'getSpotLightInfo( spotLight, geometryPosition, directLight );\nif (distance(spotLight.position, agataLanternViewPosition) < 0.001) directLight.color = vec3(0.0);'
          ));
      };
      material.customProgramCacheKey = () => 'agata-ignore-own-lantern-v1';
      material.needsUpdate = true;
    }
    // Skip only this light's shadow draw. Other lights still see her silhouette.
    let savedRange = null;
    mesh.onBeforeShadow = (renderer,object,camera,shadowCamera,geometry) => {
      if (shadowCamera === this.flashlight.shadow.camera) {
        savedRange = {...geometry.drawRange};
        geometry.setDrawRange(0,0);
        this.ignoredLanternShadowDraws++;
      }
    };
    mesh.onAfterShadow = (renderer,object,camera,shadowCamera,geometry) => {
      if(savedRange){geometry.setDrawRange(savedRange.start,savedRange.count);savedRange=null;}
    };
  }

  centerRoot() {
    if(!this.rootBone)return;
    this.group.updateMatrixWorld(true);
    this.rootBone.getWorldPosition(this.rootPoint);
    this.visual.worldToLocal(this.rootPoint);
    // Animation may translate the hips; world motion and yaw belong to the controller.
    this.model.position.x -= this.rootPoint.x;
    this.model.position.z -= this.rootPoint.z;
    this.visual.updateMatrixWorld(true);
  }

  prepareGrounding(model) {
    this.soleSamples = [];
    this.solePoint = new THREE.Vector3();
    this.group.updateMatrixWorld(true);
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !/boot/i.test(mesh.name)) return;
      const groups = [[], []], joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
        let side = 0, maxWeight = -1;
        for (let j = 0; j < 4; j++) {
          const weight = weights[['getX','getY','getZ','getW'][j]](index);
          if (weight > maxWeight) { maxWeight=weight; side=/Right/.test(mesh.skeleton.bones[joints[['getX','getY','getZ','getW'][j]](index)].name) ? 1 : 0; }
        }
        mesh.getVertexPosition(index,this.solePoint).applyMatrix4(mesh.matrixWorld);
        groups[side].push({index,x:this.solePoint.x,y:this.solePoint.y,z:this.solePoint.z});
      }
      // Sample the whole sole outline, including heels that lift in the idle pose.
      // Directional support points remain valid as a shoe rolls from heel to toe.
      for (const group of groups) {
        if(!group.length)continue;
        const bottom=Math.min(...group.map(point=>point.y));
        const sole=group.filter(point=>point.y<bottom+.22);
        const indices=new Set();
        for(const x of [-3,-2,-1,-.5,0,.5,1,2,3])for(const z of [-3,-2,-1,-.5,0,.5,1,2,3]){
          let best=sole[0],score=Infinity;
          for(const point of sole){const value=point.y+x*point.x+z*point.z;if(value<score){score=value;best=point;}}
          indices.add(best.index);
        }
        for(const index of indices)this.soleSamples.push({mesh,index});
      }
    });
  }

  groundFeet() {
    this.centerRoot();
    if (!this.soleSamples?.length) return;
    this.group.updateMatrixWorld(true);
    let soleHeight=Infinity;
    for (const {mesh,index} of this.soleSamples) {
      mesh.getVertexPosition(index,this.solePoint).applyMatrix4(mesh.matrixWorld);
      soleHeight=Math.min(soleHeight,this.solePoint.y);
    }
    // World floor is y=0. Contact is measured after the current animation and blend.
    this.visual.position.y -= soleHeight;
    this.visual.updateMatrixWorld(true);
  }

  update(inputData, boundLimit, dt, obstacles, cameraAngle = Math.PI / 4) {
    const { screenX, screenY, isMoving, isRunning } = inputData;
    const len = Math.hypot(screenX, screenY) || 1;
    const sinA = Math.sin(cameraAngle), cosA = Math.cos(cameraAngle);
    const nx = isMoving ? screenX / len : 0, ny = isMoving ? screenY / len : 0;
    steer(this.motion,nx*cosA-ny*sinA,-nx*sinA-ny*cosA,isRunning?HEROINE_CONFIG.runSpeed:HEROINE_CONFIG.walkSpeed,dt);
    this.visual.rotation.y = this.motion.yaw;
    const dx = this.motion.x * dt, dz = this.motion.z * dt;
    const beforeX = this.group.position.x, beforeZ = this.group.position.z;
    // Small steps prevent fast movement from tunnelling through narrow fences.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
    for (let i = 0; i < steps; i++) {
      const nextX = THREE.MathUtils.clamp(this.group.position.x + dx / steps, -boundLimit, boundLimit);
      const nextZ = THREE.MathUtils.clamp(this.group.position.z + dz / steps, -boundLimit, boundLimit);
      if (!obstacles || !obstacles.isBlocked(nextX, this.group.position.z, this.radius)) this.group.position.x = nextX;
      if (!obstacles || !obstacles.isBlocked(this.group.position.x, nextZ, this.radius)) this.group.position.z = nextZ;
    }
    const travelled = Math.hypot(this.group.position.x-beforeX,this.group.position.z-beforeZ);
    const actualSpeed = dt > 0 ? travelled / dt : 0;
    if (Math.abs(this.group.position.x-beforeX) < 1e-8) this.motion.x=0;
    if (Math.abs(this.group.position.z-beforeZ) < 1e-8) this.motion.z=0;
    this.updateLocomotion(actualSpeed,dt);
    if(travelled>.00001){
      this.stepTimer-=travelled;
      if(this.stepTimer<=0){
        this.audio?.footstep(this.group.position,actualSpeed>2.3);
        this.stepTimer=actualSpeed>2.3?.95:.57;
      }
    }
  }

  updateLocomotion(speed,dt) {
    if(!this.mixer)return;
    const moving=THREE.MathUtils.smoothstep(speed,0,.3);
    const running=THREE.MathUtils.smoothstep(speed,HEROINE_CONFIG.walkSpeed*1.2,HEROINE_CONFIG.runSpeed*.88);
    const targets={idle:1-moving,walking:moving*(1-running),running:moving*running};
    const smoothing=1-Math.exp(-14*dt);
    // Both gait clips share a normalized phase, so walk/run blends keep matching feet.
    const stride=THREE.MathUtils.lerp(1.13,2.0,running);
    this.gaitPhase=(this.gaitPhase+speed*dt/stride)%1;
    for(const name of ['idle','walking','running']){
      const action=this.actions[name];if(!action)continue;
      this.blend[name]+=(targets[name]-this.blend[name])*smoothing;
      action.enabled=true;action.stopFading().play();action.setEffectiveWeight(this.blend[name]);
      action.setEffectiveTimeScale(name==='idle'?1:0);
      if(name!=='idle')action.time=this.gaitPhase*action.getClip().duration;
    }
    this.mixer.update(dt);
  }

  setAnimation(name) {
    const next=this.actions[name];if(!next)return;
    for(const [key,action] of Object.entries(this.actions)){
      action.stopFading();action.setEffectiveWeight(key===name?1:0);
      if(key===name)action.reset().setEffectiveTimeScale(1).play();
    }
    this.currentAction=next;
  }

  updateFlashlight(camera) {
    this.groundFeet();
    this.group.updateWorldMatrix(true, true);
    if (this.lanternHand) {
      this.lanternHand.getWorldPosition(this.lanternPosition);
      this.group.worldToLocal(this.lanternPosition);
      this.lantern.position.copy(this.lanternPosition);
      this.lantern.position.y -= .13;
    } else this.lantern.position.set(.22,.85,0);
    this.flashlight.getWorldPosition(this.lanternPosition);
    camera.updateMatrixWorld();
    this.lanternLightView.value.copy(this.lanternPosition).applyMatrix4(camera.matrixWorldInverse);
    if (this.pointerActive) {
      this.pointerRay.setFromCamera(this.pointer, camera);
      if (this.pointerRay.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
        const dx = this.aimPoint.x - this.group.position.x;
        const dz = this.aimPoint.z - this.group.position.z;
        if (Math.hypot(dx, dz) > 0.1) this.aimDirection.set(dx, 0, dz).normalize();
      }
    }
    this.flashlightTarget.position.set(
      this.lanternPosition.x + this.aimDirection.x * 4,
      0.03,
      this.lanternPosition.z + this.aimDirection.z * 4
    );
    this.flashlightTarget.updateMatrixWorld();
  }

  getPosition() {
    return this.group.position;
  }
}
