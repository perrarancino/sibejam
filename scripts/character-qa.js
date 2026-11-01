import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
const wait=()=>new Promise(resolve=>requestAnimationFrame(resolve));
while(!window.gameInstance?.player.mixer)await wait();
const game=window.gameInstance;await game.combat.ready;await game.decorations.ready;
game.paused=true;game.story.read=true;game.story.close();
const out=document.createElement('pre');out.id='qa-result';Object.assign(out.style,{position:'fixed',top:'12px',left:'12px',zIndex:500,background:'#fff',color:'#111',padding:'12px',fontSize:'16px'});document.body.append(out);
const rows=[];
const player=game.player,hand=new THREE.Vector3(),light=new THREE.Vector3();
const original=player.group.position.clone();
player.group.position.set(0,0,6);game.sceneManager.setZoom(game.sceneManager.zoomLevel*2.8);
for(const name of ['idle','walking','running']){
 player.mixer.stopAllAction();const action=player.actions[name];action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
 let maxGap=0,maxSpan=0,maxGroundError=0;
 for(let frame=0;frame<120;frame++){
  player.mixer.update(1/30);player.updateFlashlight(game.sceneManager.camera);
  let floor=Infinity;
  for(const {mesh,index} of player.soleSamples){const v=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,v.y);}
  maxGroundError=Math.max(maxGroundError,Math.abs(floor));
  player.lanternHand.getWorldPosition(hand);player.flashlight.getWorldPosition(light);
  maxGap=Math.max(maxGap,hand.distanceTo(light));
  const left=player.visual.getObjectByProperty('name','mixamorigLeftHand')||(()=>{let bone;player.visual.traverse(o=>{if(o.isBone&&/LeftHand$/.test(o.name))bone=o;});return bone;})();
  maxSpan=Math.max(maxSpan,left.getWorldPosition(new THREE.Vector3()).distanceTo(hand));
 }
 rows.push(`${name}: lamp→hand ${maxGap.toFixed(3)} m; hand span ${maxSpan.toFixed(3)} m; ground error ${maxGroundError.toFixed(5)} m`);
}
let hips;player.visual.traverse(o=>{if(o.isBone&&/Hips$/.test(o.name))hips=o;});
let maxOrbit=0;
for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
 player.visual.rotation.y=yaw;player.updateFlashlight(game.sceneManager.camera);
 const root=hips.getWorldPosition(new THREE.Vector3()),origin=player.group.getWorldPosition(new THREE.Vector3());
 maxOrbit=Math.max(maxOrbit,Math.hypot(root.x-origin.x,root.z-origin.z));
}
player.visual.rotation.y=0;
rows.push(`pivot: pelvis distance from rotation axis ${maxOrbit.toFixed(5)} m`);
// Exercise actual controller transitions, including reversals and sprint.
let maxTurn=0,maxGround=0,maxWeightError=0;
const p0=player.group.position.clone();
for(let frame=0;frame<420;frame++){
 const section=Math.floor(frame/60),commands=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[0,0],[1,0]],command=commands[section];
 const previous=player.motion.yaw;
 player.update({screenX:command[0],screenY:command[1],isMoving:!!(command[0]||command[1]),isRunning:section===4},30,1/60,null);
 player.updateFlashlight(game.sceneManager.camera);
 maxTurn=Math.max(maxTurn,Math.abs(player.motion.yaw-previous));
 maxWeightError=Math.max(maxWeightError,Math.abs(Object.values(player.blend).reduce((a,b)=>a+b,0)-1));
 if(frame%10===0){
   let min=Infinity;
   const meshes=[...new Set(player.soleSamples.map(s=>s.mesh))];
   for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++)min=Math.min(min,mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).y);
   maxGround=Math.max(maxGround,Math.abs(min));
 }
}
rows.push(`controller: max turn/frame ${(maxTurn*180/Math.PI).toFixed(2)}°; full shoe error ${maxGround.toFixed(4)} m; weight error ${maxWeightError.toFixed(6)}`);
player.group.position.copy(p0);player.motion={x:0,z:0,yaw:0};player.visual.rotation.y=0;
player.setAnimation('walking');player.mixer.update(.3);player.updateFlashlight(game.sceneManager.camera);
const combat=game.combat;combat.navigation={start:0,point:()=>({x:-4,z:6})};const timings=[];
for(let i=0;i<12;i++){const start=performance.now();combat.spawn();timings.push(performance.now()-start);}
rows.push(`12 prepared enemies; spawn max ${Math.max(...timings).toFixed(2)} ms; total ${timings.reduce((a,b)=>a+b,0).toFixed(2)} ms`);
for(let i=0;i<combat.enemies.length;i++){const e=combat.enemies[i];e.mesh.position.set(-4+(i%4)*2,0,10+Math.floor(i/4)*2);}
rows.push(`pool ready ${combat.modelsReady}; active ${combat.enemies.length}`);
out.textContent=rows.join('\n');
game.sceneManager.updateShadows(player.flashlight,true);game.sceneManager.render();
