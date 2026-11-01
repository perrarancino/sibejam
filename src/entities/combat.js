import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { TRAPS_CONFIG as C, BESTIARY_CONFIG } from '../config/index.js';
import { gameState } from '../state/gameState.js';
import { Navigation, rayDistance } from './navigation.js?v=log-padding-1';
import { TrapEffects } from './trapEffects.js?v=dark-blood-18';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js';
import {ENEMY_TYPES,ENEMY_SOUNDS,ENEMY_SPEED_MULTIPLIER,wavePlan,caveForWave,cavesForWave,spectral,canAffect,canConvert,inLightCone,overlaps,trapJumpLanding} from './enemyMechanics.js';
import {onSpikePlate,stepSpikes,logTravel} from './trapMechanics.js';

// Combat prototype with shared models and a bounded pool of visual particles.
export class CombatManager {
  constructor(game) {
    this.game=game; this.enemies=[]; this.effects=[]; this.active=false; this.spawnTimer=0; this.remaining=0;
    this.models = {};
    this.enemyTypes = ENEMY_TYPES;
    this.voiceCooldown=0;this.nextLifeId=0;
    this.cameraOrigin=new THREE.Vector3();this.cameraTarget=new THREE.Vector3();this.ghostPoint=new THREE.Vector3();
    this.game.audio.preloadEffects(Object.values(ENEMY_SOUNDS).flat().map(path=>'./assets/audio/enemies/'+path));
    this.bossBar=document.createElement('div');this.bossBar.style.cssText='position:fixed;top:24px;left:50%;transform:translateX(-50%);width:min(420px,50vw);z-index:80;background:#20151eee;border:1px solid #cdab70;padding:8px 14px;color:#ffe8be;text-align:center;pointer-events:none';
    this.bossBar.innerHTML='<div>Джек — Тыквенный жнец</div><progress style="width:100%;accent-color:#c24b27" max="500" value="500"></progress>';this.bossBar.hidden=true;document.body.append(this.bossBar);
    this.pool = new Map(this.enemyTypes.map(type=>[type.id,[]]));
    this.modelsReady = false;
    this.ready = this.prepareEnemies().catch(error=>console.error('Подготовка врагов:',error));
    this.spawnIndex = 0;
    this.bodyGeometry=new THREE.CapsuleGeometry(.32,.65,4,6);
    this.hostileMaterial=new THREE.MeshStandardMaterial({color:0x9b6747,roughness:1});
    this.allyMaterial=new THREE.MeshStandardMaterial({color:0x6cb884,roughness:1});
    this.flameGeometry=new THREE.PlaneGeometry(.9,1);
    this.flameMaterial=new THREE.MeshBasicMaterial({color:0xff761c,transparent:true,opacity:.7,depthWrite:false});
    this.tmp=new THREE.Vector3();this.fx=new TrapEffects(game.sceneManager.scene);this.flameMaterial.dispose();this.flameMaterial=this.fx.flameMaterial;
    const style=document.createElement('style');style.textContent='.trap-timer{position:fixed;z-index:70;pointer-events:none;transform:translate(-50%,-100%);padding:3px 9px;border:1px solid #d6a866;border-radius:4px;background:#211a20e8;color:#ffe4a5;font:20px RumRaisin,serif}';document.head.appendChild(style);
  }
  async prepareEnemies(){
    const loader=new GLTFLoader();
    await Promise.all(this.enemyTypes.map(async type=>{
      const gltf=await loader.loadAsync(`./assets/characters/${type.model}.glb?v=baked-reaper-12`);
      // Normalize and create shared materials once, before any enemy can spawn.
      const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
      gltf.scene.scale.setScalar(type.height/size.y);
      gltf.scene.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-type.height/size.y);
      gltf.scene.position.y=-box.min.y*type.height/size.y;
      gltf.scene.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;if(type.id==='ghost'){
        obj.material=Array.isArray(obj.material)?obj.material.map(m=>m.clone()):obj.material.clone();
        for(const material of (Array.isArray(obj.material)?obj.material:[obj.material])){material.transparent=true;material.opacity=.3;material.depthWrite=false;}
      }}});
      this.models[type.model]=gltf;
    }));
    for(const type of this.enemyTypes)for(let i=0;i<(type.isBoss?1:12);i++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const enemy={mesh:new THREE.Group(),type};this.attachModel(enemy);this.pool.get(type.id).push(enemy);
    }
    const scene=this.game.sceneManager.scene,renderer=this.game.sceneManager.renderer,camera=this.game.sceneManager.camera;
    const prepared=[...this.pool.values()].flat();
    for(const enemy of prepared){enemy.mesh.position.y=-100;enemy.mesh.traverse(obj=>{if(obj.isMesh)obj.frustumCulled=false;});scene.add(enemy.mesh);}
    try{
      await renderer.compileAsync(scene,camera);
      // Upload vertex buffers, textures and bone textures before the first wave.
      const target=new THREE.WebGLRenderTarget(4,4),previous=renderer.getRenderTarget();
      try{renderer.setRenderTarget(target);renderer.render(scene,camera);}finally{renderer.setRenderTarget(previous);target.dispose();}
    }finally{
      for(const enemy of prepared){scene.remove(enemy.mesh);enemy.mesh.position.y=0;enemy.mesh.traverse(obj=>{if(obj.isMesh)obj.frustumCulled=true;});}
    }
    this.modelsReady=true;
  }
  recycleEnemy(enemy){
    this.game.sceneManager.scene.remove(enemy.mesh);
    enemy.mesh.traverse(obj=>{if(obj.isMesh&&obj.userData.hostileMaterial)obj.material=obj.userData.hostileMaterial;});
    this.pool.get(enemy.type.id).push(enemy);
  }
  start(){
    this.active=true;this.spawnIndex=0;this.spawnQueue=wavePlan(gameState.get().wave);this.remaining=this.spawnQueue.length;this.spawnTimer=1;this.bossDefeated=false;this.bossEscaped=false;
    this.spawnCaves=cavesForWave(this.game.decorations.editable,gameState.get().wave);this.spawnCave=this.spawnCaves[0]||null;
    this.routeChurch=this.game.decorations.editable.find(e=>e.type==='church'&&e.object.visible)?.object;
    this.caveRoutes=new Map();
    for(const cave of this.spawnCaves){const nav=this.game.story.previewNavigation(cave,this.routeChurch);if(nav)this.caveRoutes.set(cave,nav);}
    this.navigation=this.caveRoutes.get(this.spawnCave)||null;
    if(!this.spawnCaves.length){this.remaining=0;this.navigation=null;}

  }
  stop(){
    this.active=false;this.bossBar.hidden=true;this.game.audio.stopEffects('enemies');for(const e of this.enemies)this.recycleEnemy(e);this.enemies.length=0;
    for(const effect of this.effects)this.removeEffect(effect);this.effects.length=0;this.fx.clear();
    for(const trap of this.game.build.placed){this.game.audio.stopEntry(trap.userData.audioLoop);trap.userData.audioLoop=null;if(trap.userData.timerEl)trap.userData.timerEl.remove();trap.userData.timerEl=null;if(trap.userData.flames){trap.remove(trap.userData.flames);trap.userData.flames=null;}trap.userData.burning=0;trap.userData.rolling=false;trap.userData.cool=0;if(trap.userData.key==='spikes'){trap.scale.y=1;const spikes=trap.getObjectByName('spike-heads');if(spikes)spikes.scale.y=1;trap.userData.spikeState={};}}
  }
  spawn(forcedType=null){
    if(!this.navigation||this.navigation.start<0)return;
    const cave=this.spawnCaves?.[this.spawnIndex%this.spawnCaves.length];
    const navigation=cave?this.caveRoutes.get(cave):this.navigation;
    if(!navigation||navigation.start<0)return false;
    const pos=navigation.point(navigation.start);
    const id=forcedType||this.spawnQueue?.[this.spawnIndex % this.spawnQueue.length]||['pumpkinhead','ghost','scarecrow'][this.spawnIndex%3];
    const type=this.enemyTypes.find(type=>type.id===id);
    if(!type)return false;
    const enemy=this.pool.get(type.id).pop();
    if(!enemy)return false;
    this.spawnIndex++;
    Object.assign(enemy,{hp:BESTIARY_CONFIG[type.id].hp,ally:false,attack:0,slow:1,waypoint:null,route:null,repath:0,escaped:false,bloodCooldown:0,revealed:false,ghostOpacity:.3,jump:null,jumpCooldown:0,vocalTimer:4+Math.random()*5,lifeId:++this.nextLifeId,fallback:0,stunTimer:0,navigation});
    enemy.mesh.position.set(pos.x,0,pos.z);enemy.mesh.rotation.y=0;
    enemy.mixer?.setTime(0);
    this.game.sceneManager.scene.add(enemy.mesh);this.enemies.push(enemy);
    if(type.isBoss)this.game.audio.cue('roar',enemy.mesh.position);
    this.setGhostAppearance(enemy,.3);this.playEnemySound(enemy,type.isBoss?1:.6);return true;
  }

  attachModel(enemy){
    const gltf=this.models[enemy.type.model];
    if(!gltf || enemy.visual)return;
    const visual=cloneSkeleton(gltf.scene);
    enemy.ghostMaterials=[];
    visual.traverse(obj=>{if(obj.isMesh){
      if(enemy.type.id==='ghost'){obj.material=Array.isArray(obj.material)?obj.material.map(m=>m.clone()):obj.material.clone();enemy.ghostMaterials.push(...(Array.isArray(obj.material)?obj.material:[obj.material]));}
      obj.userData.hostileMaterial=obj.material;
    }});
    enemy.mesh.add(visual);enemy.visual=visual;
    if(gltf.animations.length){enemy.mixer=new THREE.AnimationMixer(visual);enemy.mixer.clipAction(gltf.animations[0]).play();}

  }
  setGhostAppearance(enemy,opacity){for(const material of enemy.ghostMaterials||[]){material.opacity=opacity;material.depthWrite=opacity>.98;}}
  playEnemySound(enemy){
    if(this.voiceCooldown>0&&!enemy.type.isBoss)return;
    const clips=ENEMY_SOUNDS[enemy.type.id];this.game.audio.playEffect('./assets/audio/enemies/'+clips[Math.floor(Math.random()*clips.length)],1,'enemies',enemy.mesh.position);this.voiceCooldown=.65;
  }
  cameraFlash(){
    if((this.flashCooldown||0)>0||!this.active)return;
    const item=this.game.story.getCameras()[gameState.get().activeCameraIndex];if(!item)return;
    const light=item.light;light.getWorldPosition(this.cameraOrigin);light.target.getWorldPosition(this.cameraTarget);
    this.game.audio.cue('flash',this.cameraOrigin.clone());this.fx.burst(this.cameraTarget.clone().add(new THREE.Vector3(0,.7,0)),0xe9ffc9,16,1.3);
    for(const enemy of this.enemies){this.ghostPoint.copy(enemy.mesh.position);this.ghostPoint.y+=.7;if(inLightCone(this.cameraOrigin,this.cameraTarget,this.ghostPoint,light.angle,light.distance))enemy.stunTimer=3;}
    this.flashCooldown=15;
  }
  updateGhost(enemy,dt){
    if(enemy.type.id!=='ghost')return;
    enemy.revealed=this.game.story.getCameras().some(item=>{
      const light=item.light;if(item.disabled||!light.visible||light.intensity<=0)return false;
      light.getWorldPosition(this.cameraOrigin);light.target.getWorldPosition(this.cameraTarget);
      for(const height of [.2,enemy.type.height*.5]){
        this.ghostPoint.copy(enemy.mesh.position);this.ghostPoint.y+=height;
        if(inLightCone(this.cameraOrigin,this.cameraTarget,this.ghostPoint,light.angle,light.distance||12))return true;
      }
      return false;
    });
    const target=enemy.revealed?1:.3;enemy.ghostOpacity+=(target-enemy.ghostOpacity)*(1-Math.exp(-12*dt));
    this.setGhostAppearance(enemy,enemy.ghostOpacity);
  }
  beginJump(enemy,dx,dz){
    if(enemy.jumpCooldown>0)return false;
    const landing=trapJumpLanding(this.game.decorations.colliders,this.game.build.placed,enemy.mesh.position,dx,dz,this.game.boundLimit);
    if(!landing)return false;
    enemy.jumpCooldown=10;
    enemy.jump={start:enemy.mesh.position.clone(),end:new THREE.Vector3(landing.x,0,landing.z),time:0,duration:Math.max(.5,landing.distance/(enemy.type.speed*1.7))};
    enemy.waypoint=null;this.playEnemySound(enemy,.4);return true;
  }
  updateJump(enemy,dt){
    const jump=enemy.jump;jump.time=Math.min(jump.duration,jump.time+dt);const t=jump.time/jump.duration;
    enemy.mesh.position.lerpVectors(jump.start,jump.end,t);enemy.mesh.position.y=Math.sin(Math.PI*t)*1.5;
    if(t>=1){enemy.mesh.position.y=0;enemy.jump=null;enemy.waypoint=null;}
  }
  damage(enemy,amount,mode='manual'){
    if(!canAffect(enemy,mode))return false;enemy.hp-=amount;
    if((enemy.bloodCooldown||0)<=0||enemy.hp<=0){const impact=enemy.mesh.position.clone();impact.y+=enemy.type.height*.55;this.fx.blood(impact,enemy.hp<=0?30:18);enemy.bloodCooldown=.12;if(enemy.hp<=0)this.fx.stain(enemy.mesh.position,.95);}
    if(enemy.hp<=0)this.playEnemySound(enemy,.7);
    return true;
  }
  nearest(position,range,filter=()=>true){let best=null,bestD=range*range;for(const e of this.enemies){if(e.hp<=0||!filter(e))continue;const dx=e.mesh.position.x-position.x,dz=e.mesh.position.z-position.z,d=dx*dx+dz*dz;if(d<bestD){best=e;bestD=d;}}return best;}
  activate(trap){
    if(!this.active)return;const d=trap.userData,p=trap.position;this.game.audio.action(this.game.player.getPosition());
    if(d.key==='mine'){this.detonate(trap,'manual');return;}
    if(d.key==='packet'){
      const mesh=this.fx.puddle(p,C.slowLiquidPacket.range);this.effects.push({kind:'puddle',mesh,time:C.slowLiquidPacket.durationSec,age:0});this.game.audio.cue('liquid',p);this.game.build.consume(trap);
    }else if(d.key==='log'&&!d.rolling&&!d.spent){
      if(!d.roller){const roller=new THREE.Group();roller.position.y=.4;for(const mesh of [...trap.children]){mesh.position.y-=.4;roller.add(mesh);}trap.add(roller);d.roller=roller;}
      d.triggered=true;d.rolling=true;d.distance=0;d.hit=new Set();d.rollYaw=trap.rotation.y;this.game.audio.cue('log',p);}
    else if(d.key==='flamethrower'&&!d.burning){
      d.triggered=true;d.burning=C.flamethrower.durationSec;d.cool=0;d.audioLoop=this.game.audio.loopCue('flame',p);d.flames=new THREE.Group();
      for(let i=0;i<4;i++){const flame=new THREE.Group();flame.rotation.z=-Math.PI/2;for(let j=0;j<2;j++){const ribbon=new THREE.Mesh(this.flameGeometry,this.flameMaterial);ribbon.rotation.y=j*Math.PI/2;flame.add(ribbon);}const arm=new THREE.Group();arm.rotation.y=i*Math.PI/2;arm.add(flame);d.flames.add(arm);}d.flames.position.y=.5;trap.add(d.flames);
      d.timerEl=document.createElement('div');d.timerEl.className='trap-timer';document.body.appendChild(d.timerEl);
    }else if(d.key==='cannon'){
      const targets=this.enemies.filter(e=>!e.ally&&e.hp>0&&canConvert(e)&&e.mesh.position.distanceToSquared(p)<=C.cannon.range**2).sort((a,b)=>a.mesh.position.distanceToSquared(p)-b.mesh.position.distanceToSquared(p)).slice(0,C.cannon.targets);
      if(!targets.length)return;this.fx.burst(p.clone().add(new THREE.Vector3(0,.6,0)),0xffd091,18,2);this.game.audio.cue('cannon',p);for(const e of targets)this.shot(p,e.mesh.position,0x9bdf68,e);this.game.build.consume(trap);
    }
  }
  detonate(trap,mode='auto'){
    if(trap.userData.detonated||!this.game.build.placed.includes(trap))return;
    trap.userData.detonated=true;const p=trap.position;
    this.fx.explode(p,C.mine.range);this.game.audio.cue('explosion',p);
    for(const enemy of this.enemies)if(enemy.hp>0&&!enemy.ally&&Math.hypot(enemy.mesh.position.x-p.x,enemy.mesh.position.z-p.z)<C.mine.range)this.damage(enemy,C.mine.damage,mode);
    this.game.build.consume(trap);
  }
  removeEffect(e){this.game.sceneManager.scene.remove(e.mesh);if(e.kind==='bolt'){e.mesh.material.dispose();}else{e.mesh.geometry.dispose();e.mesh.material.dispose();}}
  shot(from,to,color,target){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.14,16,10),new THREE.MeshBasicMaterial({color}));const start=from.clone();start.y=.65;const end=to.clone();end.y=.65;mesh.position.copy(start);this.game.sceneManager.scene.add(mesh);const duration=Math.max(.2,start.distanceTo(end)/10);this.effects.push({kind:'orb',mesh,time:duration,duration,start,end,target,targetLife:target.lifeId});
  }
  fireBolt(trap,target){
    const dart=trap.getObjectByName('loaded-dart');
    if(!dart)return;
    if(!this.dartGeometry){this.dartGeometry=dart.geometry.clone();this.dartGeometry.computeBoundingBox();const center=new THREE.Vector3();this.dartGeometry.boundingBox.getCenter(center);this.dartGeometry.translate(-center.x,-center.y,-center.z);}
    const mesh=new THREE.Mesh(this.dartGeometry,dart.material.clone()),direction=new THREE.Vector3(Math.sin(trap.rotation.y),0,Math.cos(trap.rotation.y));
    mesh.position.copy(trap.position).addScaledVector(direction,.5);mesh.position.y=.5;const end=target.mesh.position.clone();end.y=.5;direction.subVectors(end,mesh.position).normalize();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
    const duration=Math.max(.06,mesh.position.distanceTo(end)/18);this.effects.push({kind:'bolt',mesh,time:duration,duration,start:mesh.position.clone(),end,target,targetLife:target.lifeId});this.game.sceneManager.scene.add(mesh);dart.visible=false;
    this.game.audio.cue('dart',trap.position);
  }
  update(dt){
    if(!this.modelsReady)return;
    const battle=gameState.get().phase==='WAVE_ACTIVE'&&!this.game.editor.active&&!this.game.story.dialog;
    if(!battle){if(this.active)this.stop();this.fx.update(dt);return;}if(!this.active)this.start();
    for(const cave of this.spawnCaves||[]){if(!this.caveRoutes.has(cave)){const nav=this.game.story.previewNavigation(cave,this.routeChurch);if(nav)this.caveRoutes.set(cave,nav);}}
    this.navigation=this.caveRoutes?.get(this.spawnCave)||this.navigation;
    if((this.spawnCaves?.length||0)>0&&this.caveRoutes.size<this.spawnCaves.length){this.fx.update(dt);return;}
    this.voiceCooldown=Math.max(0,this.voiceCooldown-dt);this.flashCooldown=Math.max(0,(this.flashCooldown||0)-dt);
    this.spawnTimer-=dt;if(this.remaining>0&&this.spawnTimer<=0){if(this.spawn()){this.remaining--;this.spawnTimer=Math.max(.85,2.05-(gameState.get().wave-1)*.23);}else this.spawnTimer=.25;}
    for(const e of this.enemies){this.updateGhost(e,dt);e.jumpCooldown=Math.max(0,(e.jumpCooldown||0)-dt);if(e.hp>0&&e.type.id==='scarecrow'&&!e.jump&&e.jumpCooldown<=0&&!(e.stunTimer>0)){const point=(e.navigation||this.navigation)?.waypoint(e.mesh.position);if(point)this.beginJump(e,point.x-e.mesh.position.x,point.z-e.mesh.position.z);}e.vocalTimer-=dt;if(e.hp>0&&e.vocalTimer<=0){this.playEnemySound(e);e.vocalTimer=6+Math.random()*7;}e.slow=1;e.bloodCooldown=Math.max(0,(e.bloodCooldown||0)-dt);}
    this.fx.update(dt);
    for(let i=this.effects.length-1;i>=0;i--){
      const effect=this.effects[i];effect.time-=dt;
      if(effect.kind==='puddle'){
        effect.age+=dt;effect.mesh.material.uniforms.time.value=this.fx.time;effect.mesh.material.uniforms.fade.value=Math.min(1,effect.time);effect.mesh.scale.setScalar(Math.min(1,.15+effect.age*2.5));
        for(const e of this.enemies)if(!e.ally&&canAffect(e,'manual',true)&&Math.hypot(e.mesh.position.x-effect.mesh.position.x,e.mesh.position.z-effect.mesh.position.z)<C.slowLiquidPacket.range)e.slow=Math.min(e.slow,.5);
      }else if(effect.kind==='bolt'||effect.kind==='orb'){
        const t=Math.min(1,1-effect.time/effect.duration);effect.mesh.position.lerpVectors(effect.start,effect.end,t);if(effect.kind==='orb')effect.mesh.position.y+=Math.sin(t*Math.PI)*.8;
        if(effect.time<=0&&effect.target?.hp>0&&effect.target.lifeId===effect.targetLife){
          if(effect.kind==='orb'&&canConvert(effect.target)){effect.target.ally=true;effect.target.mesh.traverse(obj=>{if(obj.isMesh){obj.material=this.allyMaterial;}});this.fx.burst(effect.mesh.position,0x9bdf68,12,1.5);}
          else if(effect.kind==='bolt'&&effect.target.mesh.position.distanceTo(effect.end)<1){this.damage(effect.target,C.dartDevice.damage,'auto');}
        }
      }
      if(effect.time<=0){this.removeEffect(effect);this.effects.splice(i,1);}
    }
    for(const trap of [...this.game.build.placed])this.updateTrap(trap,dt);
    for(const e of this.enemies){
      if(e.hp<=0)continue;e.stunTimer=Math.max(0,(e.stunTimer||0)-dt);if(e.stunTimer>0&&!e.jump)continue;e.mixer?.update(dt * e.slow * ENEMY_SPEED_MULTIPLIER);e.attack-=dt;
      if(e.jump){this.updateJump(e,dt);continue;}
      const target=this.nearest(e.mesh.position,e.ally?30:1.1,x=>x.ally!==e.ally);
      if(target){const dx=target.mesh.position.x-e.mesh.position.x,dz=target.mesh.position.z-e.mesh.position.z,dist=Math.hypot(dx,dz);
        if(dist<.9&&(dist<.001||rayDistance(this.game.decorations.colliders,e.mesh.position.x,e.mesh.position.z,dx/dist,dz/dist,dist)>=dist-.01)){if(e.attack<=0){this.damage(target,10);this.game.audio.cue('swing',e.mesh.position);this.game.audio.cue('punch',target.mesh.position);e.attack=1;}continue;}
      }
      let nav=e.navigation||this.navigation;
      if(e.ally){
        if(!target)continue;e.repath=(e.repath||0)-dt;
        if(e.repath<=0){e.route=(e.navigation||this.navigation)?.routeTo(target.mesh.position);e.waypoint=null;e.repath=1.5;}
        nav=e.route;
      }
      if(!nav)continue;
      if(!e.waypoint)e.waypoint=nav.waypoint(e.mesh.position);
      if(!e.waypoint){if(!e.ally){e.hp=0;e.escaped=true;}continue;}
      const dx=e.waypoint.x-e.mesh.position.x,dz=e.waypoint.z-e.mesh.position.z,dist=Math.hypot(dx,dz),step=Math.min(dist,e.type.speed*e.slow*dt);
      if(dist>1e-6){const targetYaw=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(targetYaw-e.mesh.rotation.y),Math.cos(targetYaw-e.mesh.rotation.y));e.mesh.rotation.y+=delta*(1-Math.exp(-8*dt));const x=e.mesh.position.x+dx/dist*step,z=e.mesh.position.z+dz/dist*step;if(!this.game.decorations.isBlocked(x,z,.34)){e.mesh.position.x=x;e.mesh.position.z=z;}else e.waypoint=null;}
      if(dist<=step+.001)e.waypoint=null;
    }
    for(let i=this.enemies.length-1;i>=0;i--){const e=this.enemies[i];if(e.hp>0)continue;if(e.type.isBoss){this.bossDefeated=!e.escaped;this.bossEscaped=!!e.escaped;}this.recycleEnemy(e);this.enemies.splice(i,1);if(!e.ally&&!e.escaped)gameState.update({seeds:gameState.get().seeds+BESTIARY_CONFIG[e.type.id].dropsSeeds});}
    const boss=this.enemies.find(e=>e.type.isBoss&&e.hp>0);this.bossBar.hidden=!boss;
    if(boss){const bar=this.bossBar.querySelector('progress');bar.value=boss.hp;bar.max=BESTIARY_CONFIG.jackPumpkin.hp;}
    if(this.remaining===0&&this.enemies.length===0){this.stop();this.game.build.clearAfterWave();gameState.update({phase:'WAVE_CLEAR',isViewingCamera:false});this.game.story.openWaveResult(this.bossDefeated,this.bossEscaped);}
  }
  updateTrap(trap,dt){
    const d=trap.userData,p=trap.position;d.cool=(d.cool||0)-dt;d.soundCool=Math.max(0,(d.soundCool||0)-dt);
    const hostile=e=>!e.ally&&canAffect(e,'auto');
    if(d.key==='mine'&&d.soundCool<=0&&this.nearest(p,4,e=>!e.ally&&canAffect(e,'auto',true))){this.game.audio.cue('mineBeep',p);d.soundCool=2;}
    if(d.key==='spikes'){
      const contact=this.enemies.some(e=>e.hp>0&&!e.ally&&canAffect(e,'auto',true)&&onSpikePlate(trap,e.mesh.position));
      const state=d.spikeState||(d.spikeState={}),cycle=stepSpikes(state,contact,dt);
      const heads=trap.getObjectByName('spike-heads');trap.scale.y=1;if(heads)heads.scale.y=.035+.965*cycle.height;
      if(cycle.triggered)this.game.audio.cue('spikes',p);
      if(cycle.hit)for(const e of this.enemies)if(e.hp>0&&!e.ally&&canAffect(e,'auto',true)&&onSpikePlate(trap,e.mesh.position))this.damage(e,C.floorSpikes.damage,'auto');
    }
    if(d.key==='crossbow'){
      const target=this.nearest(p,C.dartDevice.range,hostile);
      if(target){const desired=Math.atan2(target.mesh.position.x-p.x,target.mesh.position.z-p.z);const diff=Math.atan2(Math.sin(desired-trap.rotation.y),Math.cos(desired-trap.rotation.y));trap.rotation.y+=diff*(1-Math.exp(-9*dt));}
      const dart=trap.getObjectByName('loaded-dart');if(dart&&d.cool<.25)dart.visible=true;
    }
    if(d.key==='rope'){
      const c=Math.cos(trap.rotation.y),s=Math.sin(trap.rotation.y);for(const e of this.enemies){if(e.ally||!canAffect(e,'auto',true))continue;const x=e.mesh.position.x-p.x,z=e.mesh.position.z-p.z;if(Math.abs(x*c-z*s)<1.25&&Math.abs(x*s+z*c)<.6){e.slow=Math.min(e.slow,.75);if(d.soundCool<=0){this.game.audio.cue('electric',p);d.soundCool=2;}if(d.cool<=0){this.fx.burst(e.mesh.position,0xaed5ff,8,1.2);d.cool=.45;}}}
    }else if(d.key==='crossbow'&&d.cool<=0){const e=this.nearest(p,C.dartDevice.range,hostile);if(e){const dx=e.mesh.position.x-p.x,dz=e.mesh.position.z-p.z,dist=Math.hypot(dx,dz),desired=Math.atan2(dx,dz),diff=Math.atan2(Math.sin(desired-trap.rotation.y),Math.cos(desired-trap.rotation.y));if(Math.abs(diff)<.16&&rayDistance(this.game.decorations.colliders,p.x,p.z,dx/dist,dz/dist,dist)>=dist-.05){this.fireBolt(trap,e);d.cool=C.dartDevice.intervalSec;}}
    }else if(d.key==='mine'&&this.nearest(p,.8,e=>hostile(e)&&canAffect(e,'auto',true))){this.detonate(trap);
    }else if(d.key==='log'&&d.rolling){
      const requested=Math.min(5*dt,C.log.range-d.distance),yaw=d.rollYaw,step=logTravel(this.game.decorations.colliders,p,yaw,requested,this.game.boundLimit);
      p.x+=Math.sin(yaw)*step;p.z+=Math.cos(yaw)*step;d.distance+=step;d.roller.rotation.x+=step/.4;p.y=Math.abs(Math.sin(d.distance*8))*.018;
      if(d.cool<=0&&step>0){this.fx.burst(p.clone().add(new THREE.Vector3(0,.08,0)),0x9c8260,3,.45);d.cool=.1;}
      for(const e of this.enemies){if(e.ally||d.hit.has(e)||!canAffect(e,'manual',true))continue;const dx=e.mesh.position.x-p.x,dz=e.mesh.position.z-p.z,dist=Math.hypot(dx,dz);if(dist<1&&(dist<.001||rayDistance(this.game.decorations.colliders,p.x,p.z,dx/dist,dz/dist,dist)>=dist-.01)){d.hit.add(e);this.damage(e,C.log.damage);}}
      if(step<requested-.0001||d.distance>=C.log.range){d.rolling=false;d.spent=true;d.settle=2;p.y=0;this.fx.burst(p.clone().add(new THREE.Vector3(0,.15,0)),0x9c8260,10,1);}
    }else if(d.key==='log'&&d.spent){d.settle-=dt;if(d.settle<=0)this.game.build.consume(trap);
    }else if(d.key==='flamethrower'&&d.burning>0){
      d.burning=Math.max(0,d.burning-dt);trap.rotation.y+=dt*2;
      const lengths=[];d.emberTime=(d.emberTime||0)-dt;const emitEmbers=d.emberTime<=0;if(emitEmbers)d.emberTime=.06;
      for(let i=0;i<4;i++){
        const angle=trap.rotation.y+i*Math.PI/2,dx=Math.cos(angle),dz=-Math.sin(angle);
        let length=C.flamethrower.range-.506;
        for(const offset of [-.16,0,.16])length=Math.min(length,Math.max(0,rayDistance(this.game.decorations.colliders,p.x-dz*offset,p.z+dx*offset,dx,dz,.506+length)-.506));
        if(emitEmbers&&length>.1)this.fx.flame(new THREE.Vector3(p.x+dx*.55,p.y+.5,p.z+dz*.55),new THREE.Vector3(dx,0,dz),length);
        lengths.push(length);const flame=d.flames.children[i].children[0];flame.visible=length>.01;flame.scale.y=length;flame.position.x=.506+length/2;
      }
      if(d.cool<=0){d.cool=C.flamethrower.intervalSec;for(const e of this.enemies){if(e.ally||e.hp<=0)continue;const ex=e.mesh.position.x-p.x,ez=e.mesh.position.z-p.z;
        for(let i=0;i<4;i++){const a=trap.rotation.y+i*Math.PI/2,dx=Math.cos(a),dz=-Math.sin(a),along=ex*dx+ez*dz,side=Math.abs(ex*dz-ez*dx);
          if(along>=.5&&along<=.506+lengths[i]&&side<.35&&rayDistance(this.game.decorations.colliders,p.x+dx*.506,p.z+dz*.506,ex/Math.hypot(ex,ez),ez/Math.hypot(ex,ez),Math.hypot(ex,ez)-.506)>=Math.hypot(ex,ez)-.516){this.damage(e,C.flamethrower.damage);break;}
        }
      }}
      this.tmp.copy(p);this.tmp.y=2;this.tmp.project(this.game.sceneManager.camera);d.timerEl.style.display=this.tmp.z<1?'':'none';d.timerEl.style.left=`${(this.tmp.x*.5+.5)*innerWidth}px`;d.timerEl.style.top=`${(-this.tmp.y*.5+.5)*innerHeight}px`;d.timerEl.textContent=`${Math.ceil(d.burning)} сек`;
      if(d.burning<=0){this.game.audio.stopEntry(d.audioLoop);d.audioLoop=null;d.timerEl.remove();d.timerEl=null;trap.remove(d.flames);d.flames=null;this.game.build.consume(trap);}
    }
  }
}
