import {Navigation} from './navigation.js?v=centered-route-15';
self.onmessage=event=>{
 const {id,key,colliders,limit,origin,destination}=event.data;
 try{
  const decorations={isBlocked(x,z,radius){return colliders.some(c=>{
   if(c.disabled)return false;
   if(c.type==='circle')return Math.hypot(x-c.x,z-c.z)<radius+c.r;
   const dx=Math.max(Math.abs(x-c.x)-c.halfX,0),dz=Math.max(Math.abs(z-c.z)-c.halfZ,0);return dx*dx+dz*dz<radius*radius;
  });}};
  const nav=new Navigation(decorations,limit,origin,destination);
  const data={width:nav.width,count:nav.count,step:nav.step,limit:nav.limit,start:nav.start,goal:nav.goal,blocked:nav.blocked,edges:nav.edges,clearance:nav.clearance,next:nav.next};
  self.postMessage({id,key,data},[data.blocked.buffer,data.edges.buffer,data.clearance.buffer,data.next.buffer]);
 }catch(error){self.postMessage({id,key,error:String(error)});}
};
