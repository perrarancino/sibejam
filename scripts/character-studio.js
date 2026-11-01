import * as THREE from 'three';
import {Player} from '../src/entities/player.js?v=studio-centered-10';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x40464f);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.01,50);
scene.add(new THREE.HemisphereLight(0xf3f6ff,0x6c6458,2));
for(const [position,intensity] of [[[3,4,5],2.6],[[-3,2,-3],2]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(...position);scene.add(light);}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0x65676a,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.005;scene.add(floor);
const player=new Player(scene);player.group.position.set(0,0,0);player.flashlight.intensity=0;
let mode='full',angle=.15,speed=0;const status=document.querySelector('#status');
function view(){const views={full:[4.0,1.0,.85],face:[.78,1.48,1.49],boots:[1.05,.24,.23]};const [distance,height,target]=views[mode];camera.position.set(Math.sin(angle)*distance,height,Math.cos(angle)*distance);camera.lookAt(0,target,0);}
view();for(const button of document.querySelectorAll('button'))button.onclick=()=>{if(button.dataset.view)mode=button.dataset.view;if(button.dataset.angle)angle=+button.dataset.angle;if(button.dataset.speed)speed=+button.dataset.speed;view();};
let previous=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min(.04,(now-previous)/1000);previous=now;if(player.mixer){player.updateLocomotion(speed,dt);player.updateFlashlight(camera);const materials=[];player.visual.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!materials.includes(m))materials.push(m);});status.textContent=`${mode} · ${speed?'Движение':'Ожидание'}\nМатериалы с прозрачностью: ${materials.filter(m=>m.transparent).map(m=>m.name).join(', ')||'нет'}`;}renderer.render(scene,camera);}requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});

export {scene,renderer,camera,player};
if(new URLSearchParams(location.search).has("qa"))import("./character-light-qa.js");
