import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {steer} from '../src/entities/locomotion.js';

test('reversing direction brakes before turning and respects angular speed',()=>{
  const state={x:0,z:1.5,yaw:0};const dt=1/60;
  steer(state,0,-1,1.5,dt);
  assert.ok(Math.abs(state.yaw)<=7*dt+1e-9);
  assert.ok(state.z>=0&&state.z<1.5);
  for(let i=0;i<120;i++)steer(state,0,-1,1.5,dt);
  assert.ok(state.z<-1.49);
  assert.ok(Math.hypot(state.x,state.z)<=1.5+1e-8);
});

test('diagonal commands preserve speed and releasing input comes to a full stop',()=>{
  const state={x:0,z:0,yaw:0};
  for(let i=0;i<120;i++)steer(state,1,1,3.4,1/60);
  assert.ok(Math.abs(Math.hypot(state.x,state.z)-3.4)<1e-5);
  for(let i=0;i<60;i++)steer(state,0,0,3.4,1/60);
  assert.equal(state.x,0);assert.equal(state.z,0);
});
