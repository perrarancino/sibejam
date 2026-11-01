import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const file=readFileSync(new URL('../assets/characters/hero.glb',import.meta.url));
const document=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));

test('solid heroine surfaces write depth and cannot disappear through alpha sorting',()=>{
  for(const material of document.materials){
    assert.notEqual(material.alphaMode,'BLEND',`${material.name} must not use sorted transparency`);
  }
  for(const name of ['Skin_final','Boots_Final','Hair_Final']){
    const material=document.materials.find(m=>m.name===name);
    assert.ok(material,`missing ${name}`);
    assert.equal(material.alphaMode,'OPAQUE');
  }
});

test('face and boots retain separate embedded albedo textures',()=>{
  for(const [name,image] of [['Skin_final','Skin_Albedo'],['Boots_Final','Boots_Albedo']]){
    const material=document.materials.find(m=>m.name===name);
    const texture=document.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    assert.equal(document.images[texture.source].name,image);
    assert.ok(Number.isInteger(document.images[texture.source].bufferView));
  }
});
