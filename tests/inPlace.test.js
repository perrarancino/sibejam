import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { makeInPlace } from '../src/entities/inPlace.js';

test('removes forward root drift while retaining the gait and closing the loop', () => {
  const track = {name:'mixamorig_Hips.position',times:new Float32Array([0,.5,1]),values:new Float32Array([2,10,4, 3,16,6, 2,20,4])};
  makeInPlace({tracks:[track]});
  assert.deepEqual([...track.values], [2,10,4, 3,11,6, 2,10,4]);
});
import {readFileSync} from 'node:fs';

test('exported walk and run clips keep the hips in place across the loop boundary',()=>{
  const file=readFileSync(new URL('../assets/characters/hero.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12),json=JSON.parse(file.toString('utf8',20,20+jsonLength));
  const binary=file.subarray(28+jsonLength);
  const read=(index,width)=>{
    const accessor=json.accessors[index],view=json.bufferViews[accessor.bufferView];
    const offset=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||width*4;
    return Float32Array.from({length:accessor.count*width},(_,i)=>binary.readFloatLE(offset+Math.floor(i/width)*stride+(i%width)*4));
  };
  for(const name of ['walking','running']){
    const animation=json.animations.find(a=>a.name===name);
    assert.ok(animation,`missing ${name}`);
    const channel=animation.channels.find(c=>c.target.path==='translation'&&/Hips$/.test(json.nodes[c.target.node].name));
    const sampler=animation.samplers[channel.sampler],track={name:'Hips.position',times:read(sampler.input,1),values:read(sampler.output,3)};
    makeInPlace({tracks:[track]});
    assert.ok(Math.abs(track.values[1]-track.values.at(-2))<.001,`${name} forward snap`);
  }
});
