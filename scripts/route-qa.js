import * as THREE from 'three';
import {gameState} from '../src/state/gameState.js';
const wait=()=>new Promise(resolve=>requestAnimationFrame(resolve));while(!window.gameInstance?.player.mixer)await wait();
const game=window.gameInstance;await game.combat.ready;await game.decorations.ready;game.paused=true;game.story.close();gameState.update({phase:'WAVE_ACTIVE',wave:1});
const combat=game.combat;combat.start();const nav=combat.navigation,points=[];
let index=nav.start,steps=0;while(index>=0&&steps++<nav.count){const point=nav.point(index);points.push(new THREE.Vector3(point.x,.08,point.z));if(index===nav.goal)break;index=nav.next[index];}
const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffd36a,depthTest:false}));line.renderOrder=1000;game.sceneManager.scene.add(line);
let frames=0;for(;frames<6000&&gameState.get().phase==='WAVE_ACTIVE';frames++)combat.update(.05);
const completed=gameState.get().phase==='WAVE_CLEAR'&&combat.spawnIndex===10;
const stuck=combat.enemies.map(e=>`${e.type.id}: ${e.mesh.position.x.toFixed(1)},${e.mesh.position.z.toFixed(1)}`).join('; ');
game.story.close();gameState.update({phase:'PREPARATION',wave:0});game.sceneManager.setZoom(1.0);game.sceneManager.updateCameraTracking(new THREE.Vector3(0,0,0),100);game.player.updateFlashlight(game.sceneManager.camera);game.sceneManager.updateShadows(game.player.flashlight,true);game.sceneManager.render();
const result=document.createElement('pre');result.id='route-qa-result';result.textContent=`${completed?'PASS':'FAIL'} полная волна: ${combat.spawnIndex}/10 врагов, ${(frames*.05).toFixed(2)} секунд симуляции\n${completed?'Все враги прошли маршрут без застреваний.':stuck}\nЖёлтая линия — маршрут с предпочтением середины проходов.`;result.style.cssText='position:fixed;left:12px;top:12px;padding:14px;background:#fff;color:#111;z-index:500;font:16px system-ui';document.body.append(result);if(!completed)console.error('Route QA failed',stuck);
