import * as THREE from 'three';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x34323a);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.01,50);
scene.add(new THREE.HemisphereLight(0xe6edff,0x5c4845,1.4));
for(const [position,intensity] of [[[3,5,4],3],[[-3,3,-2],2]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);scene.add(light);}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x484349,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
const gltf=await new GLTFLoader().loadAsync('./assets/characters/reaper.glb?v=baked-reaper-12');const model=gltf.scene,box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());const scale=2.4/size.y;model.scale.setScalar(scale);model.position.set(-(box.min.x+box.max.x)*scale/2,-box.min.y*scale,-(box.min.z+box.max.z)*scale/2);scene.add(model);
const mixer=new THREE.AnimationMixer(model);mixer.clipAction(gltf.animations[0]).play();mixer.update(0);
let head;model.traverse(o=>{if(o.isMesh&&/pumpkin.*head|pumpkin_head/i.test(o.name))head=o;});head??=model;
let mode='full',angle=.22;function view(){const box=new THREE.Box3().setFromObject(mode==='head'?head:model,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const distance=Math.max(size.y,size.x)*2.0;camera.position.set(center.x+Math.sin(angle)*distance,center.y+distance*.08,center.z+Math.cos(angle)*distance);camera.lookAt(center);}
view();document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;view();});document.querySelector('#turn').onclick=()=>{angle+=Math.PI/2;view();};
const materials=new Set();model.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])materials.add(material);});document.querySelector('#info').textContent=`Запечены цвет и рельеф\nМатериалов с текстурами: ${[...materials].filter(m=>m.map&&m.normalMap).length} / ${materials.size}\nАнимация: ${gltf.animations.length}`;
let previous=performance.now();function frame(now){requestAnimationFrame(frame);mixer.update(Math.min(.04,(now-previous)/1000));previous=now;renderer.render(scene,camera);}requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
