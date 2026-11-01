import test from 'node:test';
import assert from 'node:assert/strict';
import { Navigation, rayDistance } from '../src/entities/navigation.js';
const wall={type:'box',x:0,z:0,halfX:.03,halfZ:2};
const circle={type:'circle',x:2,z:0,r:.5};
const colliders=[wall,circle];
const decorations={colliders,isBlocked(x,z,r){return colliders.some(c=>{if(c.disabled)return false;if(c.type==='circle')return Math.hypot(x-c.x,z-c.z)<r+c.r;const dx=Math.max(Math.abs(x-c.x)-c.halfX,0),dz=Math.max(Math.abs(z-c.z)-c.halfZ,0);return dx*dx+dz*dz<r*r;});}};
test('route goes around a thin wall with clearance',()=>{
 const nav=new Navigation(decorations,5,{x:-3,z:0},{x:3,z:0});let i=nav.start,steps=0,maxZ=0;
 while(i!==nav.goal&&steps++<nav.count){const n=nav.next[i];assert.ok(n>=0);const a=nav.point(i),b=nav.point(n);for(let k=0;k<=10;k++){const t=k/10;assert.equal(decorations.isBlocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,.34),false);}maxZ=Math.max(maxZ,Math.abs(b.z));i=n;}
 assert.equal(i,nav.goal);assert.ok(maxZ>2.3);
});
test('flame ray stops at walls and circular obstacles',()=>{
 assert.ok(Math.abs(rayDistance(colliders,-2,0,1,0,10)-1.97)<1e-8);
 assert.ok(Math.abs(rayDistance(colliders,1,0,1,0,10)-.5)<1e-8);
 assert.equal(rayDistance(colliders,-2,3,1,0,4),4);
 assert.equal(rayDistance([{...wall,disabled:true}],-2,0,1,0,4),4);
 assert.equal(rayDistance(colliders,0,0,1,0,4),0);
});

test('weighted routes leave the wall and use the middle of a corridor',()=>{
 const walls=[{type:'box',x:0,z:-2,halfX:8,halfZ:.1},{type:'box',x:0,z:2,halfX:8,halfZ:.1}];
 const map={isBlocked(x,z,r){return walls.some(c=>{const dx=Math.max(Math.abs(x-c.x)-c.halfX,0),dz=Math.max(Math.abs(z-c.z)-c.halfZ,0);return dx*dx+dz*dz<r*r;});}};
 const nav=new Navigation(map,6,{x:-5,z:1.3},{x:5,z:1.3});let i=nav.start,steps=0,interior=[];
 while(i!==nav.goal&&steps++<nav.count){const p=nav.point(i);if(Math.abs(p.x)<2)interior.push(Math.abs(p.z));i=nav.next[i];assert.ok(i>=0);}
 assert.equal(i,nav.goal);assert.ok(interior.length>0);assert.ok(Math.max(...interior)<.65,`route hugs the wall: ${interior}`);
});
