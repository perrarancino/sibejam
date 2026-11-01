import test from 'node:test';import assert from 'node:assert/strict';
import {onSpikePlate,stepSpikes,logTravel} from '../src/entities/trapMechanics.js';
test('spikes stay idle without contact and strike once per second while occupied',()=>{
 const s={};for(let i=0;i<120;i++)assert.equal(stepSpikes(s,false,1/60).triggered,false);
 let starts=0,hits=0;for(let i=0;i<180;i++){const r=stepSpikes(s,true,1/60);starts+=Number(r.triggered);hits+=Number(r.hit);}assert.equal(starts,3);assert.equal(hits,3);
 for(let i=0;i<120;i++)assert.equal(stepSpikes(s,false,1/60).triggered,false);
});
test('spikes only damage mobs still on the plate at extension',()=>{const s={};stepSpikes(s,true,.05);assert.equal(stepSpikes(s,false,.1).hit,false);const trap={position:{x:0,z:0},rotation:{y:Math.PI/4}};assert.equal(onSpikePlate(trap,{x:0,z:0}),true);assert.equal(onSpikePlate(trap,{x:2,z:0}),false);});
test('log sweep stops at thin walls, including its outer edge',()=>{
 assert.ok(logTravel([{type:'box',x:0,z:1,halfX:2,halfZ:.025}],{x:0,z:0},0,2)<.7);
 assert.ok(logTravel([{type:'box',x:.75,z:1,halfX:.05,halfZ:.025}],{x:0,z:0},0,2)<.7);
 assert.ok(logTravel([{type:'circle',x:.125,z:1,r:.06}],{x:0,z:0},0,2)<1);
 assert.equal(logTravel([{type:'box',x:0,z:1,halfX:2,halfZ:.025,disabled:true}],{x:0,z:0},0,2),2);
 assert.ok(logTravel([],{x:0,z:4},0,2,5)<.7);
});
