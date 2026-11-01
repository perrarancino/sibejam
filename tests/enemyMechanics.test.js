import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {canAffect,canConvert,inLightCone,trapJumpLanding,wavePlan,ENEMY_TYPES} from '../src/entities/enemyMechanics.js';
import {HEROINE_CONFIG} from '../src/config/heroine.js';
const ghost=()=>({type:{id:'ghost'},hp:20,revealed:false,mesh:{position:{y:0}}});

test('spectral ghosts ignore automatic effects but accept manual effects; camera light reveals them',()=>{
 const e=ghost();assert.equal(canAffect(e,'auto'),false);assert.equal(canAffect(e,'manual'),true);
 e.revealed=true;assert.equal(canAffect(e,'auto'),true);e.revealed=false;assert.equal(canAffect(e,'auto'),false);
 assert.equal(canAffect({...e,type:{id:'pumpkinhead'}},'auto'),true);
});
test('camera cone checks direction, body height and actual range',()=>{
 const o={x:0,y:2,z:0},t={x:0,y:0,z:4};
 assert.equal(inLightCone(o,t,{x:0,y:.7,z:3},.48,12),true);
 assert.equal(inLightCone(o,t,{x:0,y:.7,z:-3},.48,12),false);
 assert.equal(inLightCone(o,t,{x:4,y:.7,z:3},.48,12),false);
 assert.equal(inLightCone(o,t,{x:0,y:0,z:14},.48,12),false);
});
test('scarecrow jumps only placed traps and never crosses map obstacles',()=>{
 const start={x:0,z:0},trap={position:{x:1,z:0},userData:{key:'spikes'}};
 const fence={type:'box',x:1,z:0,halfX:.1,halfZ:2,jumpable:true};
 assert.equal(trapJumpLanding([],[],start,1,0,10),null);
 const landing=trapJumpLanding([],[trap],start,1,0,10);assert.ok(landing&&landing.x>1.8);
 assert.equal(trapJumpLanding([fence],[trap],start,1,0,10),null);
 assert.equal(trapJumpLanding([{type:'circle',x:1,z:0,r:.4}],[trap],start,1,0,10),null);
 assert.equal(trapJumpLanding([],[trap],start,1,0,1.2),null);
 assert.equal(trapJumpLanding([],[{...trap,userData:{spent:true}}],start,1,0,10),null);
});
test('airborne scarecrow is safe from ground traps, not from turrets',()=>{
 const e={hp:80,type:{id:'scarecrow'},jump:{},mesh:{position:{y:1}}};
 assert.equal(canAffect(e,'auto',true),false);assert.equal(canAffect(e,'auto'),true);
});
test('the reaper is a single unconvertible final-wave boss',()=>{
 for(let wave=1;wave<5;wave++)assert.equal(wavePlan(wave).includes('jackPumpkin'),false);
 assert.equal(wavePlan(5).filter(id=>id==='jackPumpkin').length,1);assert.equal(wavePlan(5).at(-1),'jackPumpkin');
 assert.equal(canConvert({type:{id:'jackPumpkin',isBoss:true}}),false);
 assert.equal(canConvert({type:{id:'pumpkinhead'}}),true);
});
test('heroine and all four enemy types are exactly 25 percent faster',()=>{
 assert.equal(HEROINE_CONFIG.walkSpeed,1.5*1.25);assert.equal(HEROINE_CONFIG.runSpeed,3.4*1.25);
 for(const [i,base] of [1.1,1.35,.75,.62].entries())assert.equal(ENEMY_TYPES[i].speed,base*1.25);
});
