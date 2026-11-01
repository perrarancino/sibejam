export const ENEMY_SPEED_MULTIPLIER=1.25;
export const ENEMY_TYPES=[
  {id:'pumpkinhead',model:'zombie',speed:1.1*ENEMY_SPEED_MULTIPLIER,height:1.5},
  {id:'ghost',model:'ghost',speed:1.35*ENEMY_SPEED_MULTIPLIER,height:1.45},
  {id:'scarecrow',model:'scarecrow',speed:.75*ENEMY_SPEED_MULTIPLIER,height:1.8},
  {id:'jackPumpkin',model:'reaper',speed:.62*ENEMY_SPEED_MULTIPLIER,height:2.25,isBoss:true}
];
export function wavePlan(wave){
 const patterns=[['pumpkinhead','ghost'],['pumpkinhead','ghost','scarecrow'],['pumpkinhead','scarecrow','ghost','pumpkinhead'],['scarecrow','ghost','pumpkinhead','scarecrow'],['pumpkinhead','ghost','scarecrow']];
 const night=Math.max(1,Math.min(5,wave)),pattern=patterns[night-1],count=[10,14,18,22,24][night-1];
 const plan=Array.from({length:count},(_,i)=>pattern[i%pattern.length]);if(night===5)plan.push('jackPumpkin');return plan;
}
// The minimap and wave spawner must resolve the same cave, even after map edits.
export function orderedCaves(editable){
 return editable.filter(entry=>entry.type==='cave'&&entry.object.visible).sort((a,b)=>(a.object.position.x-a.object.position.z)-(b.object.position.x-b.object.position.z)).map(entry=>entry.object);
}
export function cavesForWave(editable,wave){const caves=orderedCaves(editable);return wave>=5?caves:(caves.length?[caves[(Math.max(1,wave)-1)%caves.length]]:[]);}
export function caveForWave(editable,wave){return cavesForWave(editable,wave)[0]||null;}

export function spectral(enemy){return enemy.type.id==='ghost'&&!enemy.revealed;}
export function canAffect(enemy,mode='auto',groundOnly=false){return enemy.hp>0&&!(mode==='auto'&&spectral(enemy))&&!(groundOnly&&enemy.jump&&enemy.mesh.position.y>.3);}
export function canConvert(enemy){return !enemy.type.isBoss&&enemy.type.id!=='jackPumpkin';}
export function inLightCone(origin,target,point,angle,range){
 const dx=point.x-origin.x,dy=point.y-origin.y,dz=point.z-origin.z,d=Math.hypot(dx,dy,dz);
 if(d>range||d<1e-6)return false;
 const tx=target.x-origin.x,ty=target.y-origin.y,tz=target.z-origin.z,t=Math.hypot(tx,ty,tz);
 return t>1e-6&&(dx*tx+dy*ty+dz*tz)/(d*t)>=Math.cos(angle);
}
export function overlaps(c,x,z,radius=.34){if(c.disabled)return false;if(c.type==='circle')return Math.hypot(x-c.x,z-c.z)<c.r+radius;const dx=Math.max(0,Math.abs(x-c.x)-c.halfX),dz=Math.max(0,Math.abs(z-c.z)-c.halfZ);return dx*dx+dz*dz<radius*radius;}
export function trapJumpLanding(colliders,traps,start,dx,dz,limit,maxDistance=3.2){
 const length=Math.hypot(dx,dz);if(!length)return null;dx/=length;dz/=length;
 let selected=null,closest=Infinity;
 for(const trap of traps){
  if(trap.userData?.spent||trap.userData?.detonated)continue;
  const p=trap.position,ox=p.x-start.x,oz=p.z-start.z,along=ox*dx+oz*dz,side=Math.abs(ox*dz-oz*dx);
  if(along>.15&&along<1.65&&side<.8&&along<closest){selected=trap;closest=along;}
 }
 if(!selected)return null;
 const distance=Math.min(maxDistance,closest+1.0),x=start.x+dx*distance,z=start.z+dz*distance;
 if(Math.abs(x)>limit||Math.abs(z)>limit)return null;
 for(let d=.1;d<=distance+.001;d+=.1)if(colliders.some(c=>overlaps(c,start.x+dx*d,start.z+dz*d)))return null;
 if(colliders.some(c=>overlaps(c,x,z)))return null;
 return {x,z,distance,trap:selected};
}
export const ENEMY_SOUNDS={
 pumpkinhead:['zombie/zombie1.mp3','zombie/zombie2.mp3','zombie/zombie3.mp3',...Array.from({length:4},(_,i)=>`pumpkinonlegs/pumpkinonlegs${i+1}.mp3`),...Array.from({length:6},(_,i)=>`var2/var2monster${i+1}.mp3`)],
 ghost:['ghost/ghost1.mp3','ghost/ghost2.mp3','ghost/ghost3.mp3'],
 scarecrow:['scarecrow/scarecrow1.mp3','scarecrow/scarecrow2.mp3',...Array.from({length:4},(_,i)=>`var3/var3monster${i+1}.mp3`)],
 jackPumpkin:['bossjackpumpkin/bossjackpumpkin1.mp3','bossjackpumpkin/bossjackpumpkin2.mp3','bossjackpumpkin/bossjackpumpkin3.mp3']
};
