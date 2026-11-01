import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {SOUND_GROUPS,spatialMix} from '../src/core/audio.js';
const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('assets/audio/normalization.json',root)));
test('every source sound is assigned to a cue and has a normalized playable asset',()=>{
 const cues=new Set(Object.values(SOUND_GROUPS).flat());const scan=path=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?entry.name==='normalized'?[]:scan(join(path,entry.name)):entry.name.endsWith('.mp3')?[join(path,entry.name)]:[]);
 const audioRoot=new URL('assets/audio/',root);const sources=scan(decodeURIComponent(audioRoot.pathname).replace(/^\/(\w:)/,'$1'));
 assert.equal(Object.keys(manifest.sounds).length,sources.length);
 for(const [source,record] of Object.entries(manifest.sounds)){assert.ok(cues.has(source),`unused ${source}`);assert.ok(existsSync(new URL(record.url,root)),`missing ${record.url}`);if(record.method==='LUFS')assert.ok(Math.abs(record.outputLUFS+20)<=1,`${source}: ${record.outputLUFS} LUFS`);else if(record.peakLimited){assert.ok(record.verifiedTruePeakDB<=-1,`${source}: peak clipping`);assert.ok(Math.abs(record.activeRMS+23)<4);}else assert.ok(Math.abs(record.activeRMS+23)<1,`${source}: ${record.activeRMS} active RMS`);}
 for(const cue of cues)assert.ok(manifest.sounds[cue],`unknown cue ${cue}`);
});
test('spatial volume follows camera focus and stereo rotates with the camera',()=>{
 const source={x:10,z:0},right={x:1,z:0};const far=spatialMix(source,{x:0,z:0},right),near=spatialMix(source,{x:9,z:0},right);
 assert.ok(near.gain>far.gain);assert.equal(far.pan,1);assert.equal(spatialMix(source,{x:0,z:0},{x:-1,z:0}).pan,-1);assert.equal(spatialMix(source,{x:100,z:100}).gain,0);assert.equal(spatialMix(source,source).pan,0);
});
test('baked reaper contains texture coordinates, albedo and normal maps plus its walk animation',()=>{
 const data=readFileSync(new URL('assets/characters/reaper.glb',root));const gltf=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
 assert.ok(gltf.images.length>=8);assert.ok(gltf.animations.length>0);
 for(const material of gltf.materials){assert.ok(material.pbrMetallicRoughness.baseColorTexture,material.name);assert.ok(material.normalTexture,material.name);}
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)assert.ok(primitive.attributes.TEXCOORD_0!=null);
});
