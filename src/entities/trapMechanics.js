import {rayDistance} from './navigation.js?v=log-padding-1';

export function onSpikePlate(trap,position,radius=.22){
  const dx=position.x-trap.position.x,dz=position.z-trap.position.z,c=Math.cos(trap.rotation.y),s=Math.sin(trap.rotation.y);
  const x=dx*c-dz*s,z=dx*s+dz*c;
  return Math.hypot(Math.max(0,Math.abs(x)-.5),Math.max(0,Math.abs(z)-.5))<=radius;
}
export function stepSpikes(state,contact,dt){
  state.wait=Math.max(0,(state.wait||0)-dt);let triggered=false,hit=false;
  if(contact&&state.wait<1e-7&&state.age==null){state.age=0;state.struck=false;state.wait=1;triggered=true;}
  let height=0;
  if(state.age!=null){state.age+=dt;const t=state.age;if(t>=.12&&!state.struck){state.struck=true;hit=contact;}
    const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    height=t<.12?smooth(t/.12):t<.28?1:1-smooth((t-.28)/.24);
    if(t>=.52)state.age=null;
  }
  return {triggered,hit,height};
}
// Sweep the entire width of a rolling log before moving it, including thin walls.
export function logTravel(colliders,position,yaw,distance,limit=Infinity){
  const dx=Math.sin(yaw),dz=Math.cos(yaw),sx=Math.cos(yaw),sz=-Math.sin(yaw),radius=.32;
  let allowed=distance;
  for(let offset=-.75;offset<=.751;offset+=.25){
    const x=position.x+sx*offset,z=position.z+sz*offset;
    allowed=Math.min(allowed,Math.max(0,rayDistance(colliders,x,z,dx,dz,distance+.02,radius)-.02));
    if(Math.abs(dx)>1e-8)allowed=Math.min(allowed,Math.max(0,((dx>0?limit-radius:-limit+radius)-x)/dx));
    if(Math.abs(dz)>1e-8)allowed=Math.min(allowed,Math.max(0,((dz>0?limit-radius:-limit+radius)-z)/dz));
  }
  return allowed;
}
