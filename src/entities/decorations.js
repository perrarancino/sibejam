import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { StaticLightField } from '../core/staticLightField.js?v=2';

const loader = new THREE.TextureLoader();
// Fully opaque textures need no transparent double-sided render pass.
const opaqueTextures=new Set(['grass-0.png','bush-0.png','camera-0.png','camera-1.png','candles-0.png','candles-1.png','cave-0.png','church-0.png','church-4.png','fence-0.png','jack-0.png','jack-1.png','lamppost-0.png','lamppost-1.png','new-tree-0.png','new-tree-2.png','pillar-0.png','pumpkin-0.png','pumpkin-1.png','stone-fence-0.png']);
const foliageWind = {value:0};
const foliagePlayer = {value:new THREE.Vector3(1000, 0, 1000)};
// Recent footsteps make nearby tufts shake briefly, then come to rest.
const grassSteps = {value:Array.from({length:12}, () => new THREE.Vector4(0, 0, -100, 0))};
const beaconCanvas=document.createElement('canvas');beaconCanvas.width=64;beaconCanvas.height=64;
const beaconCtx=beaconCanvas.getContext('2d');const beaconGradient=beaconCtx.createRadialGradient(32,32,1,32,32,32);
beaconGradient.addColorStop(0,'rgba(225,255,215,0.5)');beaconGradient.addColorStop(0.2,'rgba(151,222,145,0.22)');beaconGradient.addColorStop(1,'rgba(100,180,115,0)');beaconCtx.fillStyle=beaconGradient;beaconCtx.fillRect(0,0,64,64);
const beaconTexture=new THREE.CanvasTexture(beaconCanvas);

async function loadModel(name) {
  const response = await fetch(`./assets/models/${name}.json${name === 'church' ? '?v=church-4' : name === 'grass' ? '?v=grass-lod-2' : ''}`);
  if (!response.ok) throw new Error(`Не удалось загрузить модель ${name}`);
  const data = await response.json();
  const materials = data.textures.map((url, textureIndex) => {
    const texture = loader.load(url);
    texture.userData.assetUrl = url;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const textureName=url.split('/').pop().split('?')[0];
    const opaque = opaqueTextures.has(textureName);
    const material = new THREE.MeshStandardMaterial({map:texture, transparent:!opaque, alphaTest:opaque ? 0 : 0.1, side:THREE.DoubleSide, roughness:1, emissive:0xffffff, emissiveMap:texture, emissiveIntensity:0.13});
    material.userData.vertexAnimated = name === 'grass' || name === 'bush' || (name.startsWith('new-tree-') && textureIndex > 0);
    // Grass should be lit by the scene instead of glowing in the dark.
    if (name === 'grass') {
      material.emissive.setHex(0x000000);
      material.emissiveMap = null;
      material.emissiveIntensity = 0;
    }
    if (name.startsWith('new-tree-') && textureIndex > 0) {
      material.onBeforeCompile = shader => {
        shader.uniforms.foliageWind = foliageWind;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float foliageWind;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 treeOrigin = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef USE_INSTANCING
              treeOrigin = instanceMatrix * treeOrigin;
            #endif
            vec3 treeWorld = (modelMatrix * treeOrigin).xyz;
            float sway = sin(foliageWind * 1.1 + treeWorld.x * 0.35 + treeWorld.z * 0.25);
            transformed.x += sway * 0.085 * clamp((position.y - 0.4) / 1.5, 0.0, 1.0);
            transformed.z += cos(foliageWind * 0.85 + treeWorld.z * 0.3) * 0.04 * clamp((position.y - 0.4) / 1.5, 0.0, 1.0);`);
      };
      material.customProgramCacheKey = () => 'foliage-wind-instanced-v2';
    }
    if (name === 'grass' || name === 'bush') {
      material.onBeforeCompile = shader => {
        shader.uniforms.foliageWind = foliageWind;
        shader.uniforms.grassSteps = grassSteps;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float foliageWind;\nuniform vec4 grassSteps[12];')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 grassOrigin = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef USE_INSTANCING
              grassOrigin = instanceMatrix * grassOrigin;
            #endif
            vec3 grassBase = (modelMatrix * grassOrigin).xyz;
            float shake = 0.0;
            for (int i = 0; i < 12; i++) {
              float age = foliageWind - grassSteps[i].z;
              // Uniform early-out: resting vegetation does not evaluate twelve
              // distance fields and sine waves for every vertex every frame.
              if (age < 0.0 || age >= 1.15) continue;
              float nearStep = 1.0 - smoothstep(0.2, 1.15, distance(grassBase.xz, grassSteps[i].xy));
              if (nearStep <= 0.0) continue;
              float fade = (1.0 - smoothstep(0.0, 1.15, age)) * step(0.0, age);
              shake += sin(age * 17.0 + grassBase.x * 3.0 + grassBase.z * 2.0) * nearStep * fade;
            }
            float angle = clamp(shake * 0.12, -0.24, 0.24);
            float c = cos(angle), sn = sin(angle);
            // Rotate the entire tuft about its base: the blades keep their shape.
            transformed = vec3(position.x * c + position.y * sn, -position.x * sn + position.y * c, position.z);
          `);
      };
      material.customProgramCacheKey = () => 'vegetation-footsteps-active-v2';
    }
    return material;
  });
  const root = new THREE.Group();
  for (const part of data.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.position,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uv,2));
    geometry.computeVertexNormals();
    // Imported faces have duplicate vertices; blend normals at shared positions
    // to soften faceted lighting without changing the model geometry or textures.
    if (name !== 'grass') {
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const shared = new Map();
      const keyAt = i => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => Math.round(v * 10000)).join(',');
      for (let i = 0; i < positions.count; i++) {
        const key = keyAt(i);
        if (!shared.has(key)) shared.set(key, new THREE.Vector3());
        shared.get(key).add(new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i)));
      }
      for (let i = 0; i < positions.count; i++) {
        const averaged = shared.get(keyAt(i)).clone();
        if (averaged.lengthSq() < 1e-8) continue;
        const normal = new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i));
        normal.lerp(averaged.normalize(), 0.7).normalize();
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      normals.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geometry,materials[part.texture]);
    mesh.name = part.name || '';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.fromArray(part.origin);
    mesh.rotation.set(...part.rotation.map(THREE.MathUtils.degToRad));
    root.add(mesh);
  }
  if(name==='grass') {
    for (const [key, property] of [['lod', 'grassLodGeometry'], ['lodMedium', 'grassMediumGeometry']]) {
      if (!data[key]) continue;
      const lod=new THREE.BufferGeometry();
      lod.setAttribute('position',new THREE.Float32BufferAttribute(data[key].position,3));
      lod.setAttribute('uv',new THREE.Float32BufferAttribute(data[key].uv,2));
      lod.computeVertexNormals();root[property]=lod;
    }
  }
  return root;
}

export class Decorations {
  constructor(scene, fog) {
    this.scene=scene;
    this.fog=fog;
    this.cameras=[];
    this.candleFlames=[];
    this.candleLights=[];
    this.jackLights=[];
    this.candleTime={value:0};
    this.colliders=[];
    this.editable=[];
    this.typeCounts={};
    this.modelTypes=new Map();
    this.grassMesh=null;
    this.paintedGrass=null;
    this.batchRoot=null;
    this.batchHidden=[];
    this.batchStats={originalDraws:0,batchDraws:0};
    this.optimizedChunks=[];
    this.hiddenStaticLights=[];
    this.lightField = new StaticLightField();
    this.mergedChunks = [];
    this.dynamicBatches = [];
    this.frozenTransforms = [];
    this.lastOptimizationUpdate=-Infinity;
    this.lastGrassStep=null;
    this.grassStepIndex=0;
    this.group=new THREE.Group();
    scene.add(this.group);
    this.ready=this.load().catch(error=>{console.error('Ошибка загрузки декораций:',error);throw error;});
  }
  async load() {
    const [loadedModels,savedMap]=await Promise.all([
      Promise.all(['new-tree-broadleaf','new-tree-pine','new-tree-tall','new-tree-bare','pillar','camera','church','fence','grass','bush','pumpkin','candles','lamppost','jack','stone-fence','cave'].map(loadModel)),
      fetch('./assets/map.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(error=>{console.warn('Не удалось загрузить карту:',error);return null;})
    ]);
    const [broadleaf,pine,tall,bare,pillar,camera,church,fence,grass,bush,pumpkin,candles,lamppost,jack,stoneFence,cave]=loadedModels;
    const hasSavedMap=savedMap?.version===1 && !savedMap.default && Array.isArray(savedMap.objects) && Array.isArray(savedMap.grass);
    const trees=[broadleaf,pine,tall,bare];
    this.cameraTemplate=camera;
    this.grassLodGeometry=grass.grassLodGeometry||grass.children[0].geometry;
    this.grassMediumGeometry=grass.grassMediumGeometry||this.grassLodGeometry;
    const models={broadleaf,pine,tall,bare,pillar,camera,church,fence,grass,bush,pumpkin,candles,lamppost,jack,stoneFence,cave};
    this.modelTypes=new Map(Object.entries(models).map(([type,model])=>[model,type]));
    const place=(model,x,z,scale,rotation=0)=>{const item=model.clone();item.position.set(x,0,z);item.scale.setScalar(scale);item.rotation.y=rotation;this.group.add(item);this.registerEditable(item,this.modelTypes.get(model));return item;};
    place(church,0,0,1.65,Math.PI);
    this.colliders.push({type:'box', x:0, z:0, halfX:1.96, halfZ:3.41});
    const circle = (x,z,r) => this.colliders.push({type:'circle',x,z,r});
    // The four flames sit directly on the wicks in the imported candle set.
    const flameMaterial = new THREE.ShaderMaterial({
      uniforms: {uTime:this.candleTime},
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        void main() {
          float y=vUv.y;
          float sway=(sin(uTime*4.2+y*5.0)*0.032+sin(uTime*7.3)*0.012)*y;
          float x=abs(vUv.x-0.5-sway);
          float width=0.37*pow(max(1.0-y,0.0),0.7)*smoothstep(0.0,0.17,y);
          float flame=(1.0-smoothstep(width*0.35,width+0.08,x))*smoothstep(0.0,0.12,y)*(1.0-smoothstep(0.78,1.0,y));
          float core=(1.0-smoothstep(0.025,0.17,x))*smoothstep(0.04,0.18,y)*(1.0-smoothstep(0.28,0.78,y));
          vec3 color=mix(vec3(1.0,0.28,0.045),vec3(1.0,0.91,0.58),core);
          gl_FragColor=vec4(color,clamp(flame*0.54+core*0.26,0.0,0.78));
        }`,
      transparent:true, depthWrite:false, side:THREE.DoubleSide
    });
    const flameGeometry = new THREE.PlaneGeometry(0.16,0.27);
    const wickTips=[[-4.04,9.9,0],[1.21,13.9,-2.2],[4.05,7.9,2],[-0.94,7.3,3]];
    [[-1.2,4.1],[1.2,4.1],[-2.7,6.4],[2.7,6.4],[-4.5,1.5],[4.5,1.5]].forEach(([x,z],i)=>{
      const set=place(candles,x,z,0.6,(i%4)*Math.PI/2);
      wickTips.forEach(([wx,wy,wz])=>{
        const flame=new THREE.Mesh(flameGeometry,flameMaterial);
        flame.position.set(wx/16,wy/16+0.115,wz/16);
        flame.renderOrder=2;flame.userData.isCandleFlame=true;set.add(flame);this.candleFlames.push(flame);
      });
      const glow=new THREE.PointLight(0xffa045,1.25,3.4,1.7);
      glow.position.set(0,0.85,0);set.add(glow);this.candleLights.push({light:glow,phase:i*2.1});
    });
    // Every span ends at one shared post; only the first needs a left post.
    const fenceSpan=fence.getObjectByName('Fence');
    const leftPost=fence.getObjectByName('Left post');
    const rightPost=fence.getObjectByName('Right post');
    if (fenceSpan && leftPost && rightPost) {
      const addFence=(x,z,count,rotation=0)=>{
        const run=new THREE.Group();run.position.set(x,0,z);run.rotation.y=rotation;
        const firstPost=leftPost.clone();firstPost.position.x-=(count-1);run.add(firstPost);
        for(let i=0;i<count;i++){
          const offset=(i-(count-1)/2)*2;
          const span=fenceSpan.clone();span.position.x+=offset;run.add(span);
          const post=rightPost.clone();post.position.x+=offset;run.add(post);
        }
        this.group.add(run);
        this.registerEditable(run,'fence');
        this.colliders.push({type:'box',x,z,halfX:rotation ? 0.09 : count+0.03,halfZ:rotation ? count+0.03 : 0.09});
      };
      addFence(-5,-11,3);addFence(5,11,3);addFence(-11,2,3,Math.PI/2);addFence(11,-3,2,Math.PI/2);
    }
    // Neighbouring stone spans share one post at every join.
    const stoneWall=stoneFence.getObjectByName('Stone wall');
    const stoneLeft=stoneFence.getObjectByName('Left stone post');
    const stoneRight=stoneFence.getObjectByName('Right stone post');
    if(stoneWall && stoneLeft && stoneRight) {
      const span=26/16;
      const addStoneFence=(x,z,count,rotation=0)=>{
        const run=new THREE.Group();run.position.set(x,0,z);run.rotation.y=rotation;
        const first=stoneLeft.clone();first.position.x-=(count-1)*span/2;run.add(first);
        for(let i=0;i<count;i++) {
          const offset=(i-(count-1)/2)*span;
          const wall=stoneWall.clone();wall.position.x+=offset;run.add(wall);
          const post=stoneRight.clone();post.position.x+=offset;run.add(post);
        }
        this.group.add(run);
        this.registerEditable(run,'stoneFence');
        const halfLength=count*span/2+0.125;
        this.colliders.push({type:'box',x,z,halfX:rotation ? 0.125 : halfLength,halfZ:rotation ? halfLength : 0.125});
      };
      addStoneFence(-7.3,-7.8,2);
      addStoneFence(7.4,4.8,2);
      addStoneFence(-7.5,3,2,Math.PI/2);
    }
    [[-10,-9],[-5,-10],[1,-10],[8,-9],[-10,-3],[10,-3],[-10,4],[10,4],[-10,10],[-4,10],[3,10],[9,10],[-5,1],[6,2]].forEach(([x,z],i)=>{place(trees[i%trees.length],x,z,2.1, (i%4)*Math.PI/2);circle(x,z,[0.18,0.16,0.16,0.20][i%4]);});
    const pillars=[[-8,-1],[8,-1],[-3,8],[4,-8]];
    pillars.forEach(([x,z])=>this.colliders.push({type:'box',x,z,halfX:0.5,halfZ:0.5}));
    // A few warm pools of light mark paths without blocking them.
    const glass = lamppost.getObjectByName('Warm lantern panes');
    if (glass) {
      glass.material = glass.material.clone();
      glass.material.emissive.setHex(0xffc889);
      glass.material.emissiveIntensity = 0.75;
    }
    [[-4.7,6.8],[4.7,6.8],[-6.2,-4],[6.5,-2]].forEach(([x,z],i)=>{
      const lamp = place(lamppost,x,z,1.0,(i%4)*Math.PI/2);
      const glow = new THREE.PointLight(0xffc483,12,7.5,2);
      glow.position.set(0,1.84,0);
      lamp.add(glow);
      circle(x,z,0.18);
    });
    [[-8,-4.5],[8,-5.5]].forEach(([x,z],i)=>{
      const grotto=place(cave,x,z,1.15,i?Math.PI/2:0);
      this.decorateCave(grotto);
      this.colliders.push({type:'box',x,z,halfX:i?0.68:1.08,halfZ:i?1.08:0.68});
    });
    // Stable seeded layout: geometry is instanced once; wind and proximity run on the GPU.
    let seed=74321;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const clear=(x,z,pad=0)=> !this.colliders.some(c => c.type==='circle' ? Math.hypot(x-c.x,z-c.z)<c.r+pad : Math.abs(x-c.x)<c.halfX+pad && Math.abs(z-c.z)<c.halfZ+pad) && Math.hypot(x,z-6)>0.9+pad;
    const bushes=[[-8,-7],[-6,-3],[7,-5],[9,1],[-8,7],[-2,9],[6,8],[8,5],[-9,1],[3,-10],[5,4],[-5,3]];
    bushes.forEach(([x,z],i)=>{if(clear(x,z,0.5)){place(bush,x,z,1.3,(i%4)*Math.PI/2);}});
    [[-6,7],[6,-4],[-3,-8],[8,8],[2,8],[-9,-5]].forEach(([x,z],i)=>{if(clear(x,z,0.45)){place(pumpkin,x,z,0.65,(i%4)*Math.PI/2);circle(x,z,0.35);}});
    // The glowing core is enclosed by the pumpkin mesh and shows through its carving.
    const jackCoreGeometry = new THREE.SphereGeometry(0.24, 12, 8);
    const jackCoreMaterial = new THREE.MeshBasicMaterial({color:0xffae35});
    [[-1.8,7.6],[2.0,5.3],[-6.5,-2.2],[7.6,7.4]].forEach(([x,z],i)=>{
      if(!clear(x,z,0.45)) return;
      const lantern=place(jack,x,z,0.7,(i%2)*Math.PI/2);
      const core=new THREE.Mesh(jackCoreGeometry,jackCoreMaterial);
      core.position.set(0,0.33,0);lantern.add(core);
      const light=new THREE.PointLight(0xff8a27,1.4,2.8,1.7);
      light.position.set(0,0.34,0);lantern.add(light);
      this.jackLights.push({light,phase:i*1.9});
      circle(x,z,0.4);
    });
    const grassPart=grass.children[0];
    if(grassPart) {
      const matrices=[];
      // Clumps leave open ground between them; a fixed seed keeps the layout stable.
      for(let patch=0;!hasSavedMap && patch<145;patch++) {
        const centerX=(random()-0.5)*24.0, centerZ=(random()-0.5)*24.0;
        const spread=0.35+random()*0.65, amount=8+Math.floor(random()*12);
        for(let i=0;i<amount;i++) {
          const angle=random()*Math.PI*2, distance=Math.sqrt(random())*spread;
          const x=centerX+Math.cos(angle)*distance, z=centerZ+Math.sin(angle)*distance;
          if(Math.abs(x)>12.5 || Math.abs(z)>12.5 || !clear(x,z,0.2)) continue;
          const matrix=new THREE.Matrix4(), scale=0.65+random()*0.7;
          matrix.compose(new THREE.Vector3(x,0,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),random()*Math.PI*2),new THREE.Vector3(scale,scale,scale));
          matrices.push(matrix);
        }
      }
      const grassCapacity=10000;
      const tufts=new THREE.InstancedMesh(grassPart.geometry,grassPart.material,grassCapacity);
      tufts.count=hasSavedMap ? Math.min(grassCapacity,savedMap.grass.reduce((max,item)=>Number.isInteger(item.id)?Math.max(max,item.id+1):max,0)) : matrices.length;
      matrices.forEach((matrix,i)=>tufts.setMatrixAt(i,matrix));
      tufts.instanceMatrix.needsUpdate=true; tufts.receiveShadow=true;
      this.group.add(tufts);
      this.grassMesh=tufts;
      // Painted tufts share one draw call and remain individually editable.
      this.paintedGrass=new THREE.InstancedMesh(grassPart.geometry,grassPart.material,4000);
      this.paintedGrass.count=0;this.paintedGrass.frustumCulled=false;this.paintedGrass.receiveShadow=true;
      this.group.add(this.paintedGrass);
    }
    pillars.forEach(([x,z],i)=>{
      const post=place(pillar,x,z,1.0);
      if(i===2)return;
      this.editable.find(entry=>entry.object===post).type='cameraPillar';
      this.attachCamera(post,i);
    });
    // Bind each physical footprint to its scene object so edits update collisions.
    for(const collider of this.colliders) {
      const entry=this.editable.find(e=>Math.abs(e.object.position.x-collider.x)<0.001 && Math.abs(e.object.position.z-collider.z)<0.001);
      if(entry) { entry.collider=collider; entry.colliderBase={...collider,scale:entry.object.scale.x,rotation:entry.object.rotation.y}; }
    }
    if(hasSavedMap) {
      try {this.applyMap(savedMap);} catch(error) {console.error('Не удалось применить сохранённую карту:',error);}
    }
  }

  decorateCave(root) {
    // Trace the inner rim of the entrance from the model, rather than a
    // rectangular plane which can show through the cracks around the cave.
    const rim=[[-4.5,0],[-3.9,1.8],[-3.1,4.2],[-2.4,6.3],[-1.5,9],[-0.7,11.4],[0,13.5],[1,10.5],[2,7.5],[3.2,3.9],[4.5,0]];
    const opening=new THREE.Shape();
    rim.forEach(([x,y],i)=>{if(i===0)opening.moveTo(x/16,y/16);else opening.lineTo(x/16,y/16);});opening.closePath();
    const glowMaterial=new THREE.ShaderMaterial({
      uniforms:{uTime:this.candleTime},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform float uTime;varying vec2 vUv;void main(){float flicker=0.94+0.06*sin(uTime*1.5);float height=clamp(vUv.y/0.85,0.0,1.0);vec3 color=mix(vec3(0.68,0.30,0.98),vec3(0.35,0.10,0.65),height);gl_FragColor=vec4(color*flicker,1.0);}`,
      transparent:true,depthWrite:false,side:THREE.DoubleSide
    });
    const core=new THREE.Mesh(new THREE.ShapeGeometry(opening),glowMaterial);
    core.position.z=0.40;core.scale.set(0.9,0.92,1);core.renderOrder=2;root.add(core);
    // A few soft, tapered light shafts spread out from the entrance.
    const rayMaterial=new THREE.ShaderMaterial({
      uniforms:{uTime:this.candleTime},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        uniform float uTime;varying vec2 vUv;
        void main(){
          float distanceFromDoor=1.0-vUv.y;
          float angle=(vUv.x-0.5)/max(distanceFromDoor,0.035);
          float rays=0.0;
          float sway=sin(uTime*0.35)*0.055;
          float first=smoothstep(-0.7,0.35,sin(uTime*0.65));
          float second=smoothstep(-0.7,0.35,sin(uTime*0.65+2.2));
          float third=smoothstep(-0.6,0.45,sin(uTime*0.48+4.0));
          rays+=(1.0-smoothstep(0.02,0.12,abs(angle+0.25-sway)))*first;
          rays+=(1.0-smoothstep(0.02,0.11,abs(angle-0.24+sway)))*second;
          rays+=(1.0-smoothstep(0.02,0.10,abs(angle-0.02-sway*0.6)))*third;
          float fade=smoothstep(0.01,0.13,distanceFromDoor)*(1.0-smoothstep(0.45,1.0,distanceFromDoor));
          gl_FragColor=vec4(0.62,0.36,0.94,clamp(rays*fade*0.26,0.0,0.32));
        }`,
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1
    });
    const rays=new THREE.Mesh(new THREE.PlaneGeometry(3.4,4.0),rayMaterial);
    rays.rotation.x=-Math.PI/2;rays.position.set(0,0.045,2.56);rays.renderOrder=2;root.add(rays);
    // These spotlights illuminate nearby geometry as the visible shafts move.
    for(let i=0;i<2;i++){
      const light=new THREE.SpotLight(0xaa76f0,3.5,5.5,0.32,0.85,1.7);
      light.name=`caveRayLight${i}`;light.position.set(0,0.55,0.38);
      const target=new THREE.Object3D();target.name=`caveRayTarget${i}`;target.position.set(i?0.8:-0.8,0,2.6);
      root.add(light,target);light.target=target;
      const shaftGeometry=new THREE.PlaneGeometry(0.38,3.0);shaftGeometry.translate(0,1.5,0);
      const shaftMaterial=new THREE.ShaderMaterial({
        uniforms:{uTime:this.candleTime,uPhase:{value:i*2.2}},
        vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`uniform float uTime;uniform float uPhase;varying vec2 vUv;void main(){
          float edge=1.0-smoothstep(0.1,0.5,abs(vUv.x-0.5));
          float fade=smoothstep(0.0,0.13,vUv.y)*(1.0-smoothstep(0.35,1.0,vUv.y));
          float pulse=smoothstep(-0.7,0.35,sin(uTime*0.65+uPhase));
          gl_FragColor=vec4(0.63,0.39,0.95,edge*fade*pulse*0.22);
        }`,
        transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending
      });
      const shaft=new THREE.Mesh(shaftGeometry,shaftMaterial);shaft.name=`caveRayShaft${i}`;
      shaft.rotation.order='YXZ';shaft.position.copy(light.position);shaft.renderOrder=3;root.add(shaft);
    }

  }

  attachCamera(post,i=this.cameras.length) {
      const pivot=new THREE.Group();pivot.position.set(0,2.05,0);post.add(pivot);
      const lamp=this.cameraTemplate.clone();lamp.scale.setScalar(0.5);pivot.add(lamp);
      const light=new THREE.SpotLight(0xc9eab8,34,12,0.48,0.8,1.5);
      this.group.add(light,light.target);
      const geometry=new THREE.ConeGeometry(1.5,1,20,1,true);
      const material=new THREE.ShaderMaterial({
        vertexShader:`varying vec2 vBeamUv; void main(){vBeamUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`varying vec2 vBeamUv; void main(){float fade=smoothstep(0.0,0.35,vBeamUv.y);gl_FragColor=vec4(0.60,0.78,0.60,0.09*fade);}`,
        transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending
      });
      const beam=new THREE.Mesh(geometry,material);this.group.add(beam);
      const poolMat=new THREE.ShaderMaterial({
        vertexShader:`varying vec2 vPoolUv; void main(){vPoolUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader:`varying vec2 vPoolUv; void main(){float d=length((vPoolUv-0.5)*2.0);float glow=1.0-smoothstep(0.15,1.0,d);gl_FragColor=vec4(0.68,0.88,0.65,glow*0.18);}`,
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
      });
      const pool=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6),poolMat);pool.rotation.x=-Math.PI/2;pool.renderOrder=4;this.group.add(pool);
      const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:beaconTexture,color:0xc6ffc1,transparent:true,opacity:0.55,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      beacon.scale.set(1.4,1.4,1);beacon.renderOrder=-1;this.group.add(beacon);
      const fogIndex=this.fog.addCameraLight(post.position.x,post.position.z,post.position.x+2,post.position.z+2);
      this.cameras.push({pivot,lamp,light,beam,pool,beacon,fogIndex,baseAngle:i*Math.PI*.7,phase:i*1.7});
  }

  clearBatches() {
    for (const { object, local, world } of this.frozenTransforms) {
      object.matrixAutoUpdate = local; object.matrixWorldAutoUpdate = world;
      object.matrixWorldNeedsUpdate = true;
    }
    this.frozenTransforms = [];
    this.lightField.enabled.value = 0;
    for (const mesh of this.batchHidden) mesh.visible = true;
    for (const light of this.hiddenStaticLights) light.visible = true;
    this.batchHidden = []; this.hiddenStaticLights = [];
    this.optimizedChunks = []; this.mergedChunks = []; this.dynamicBatches = [];
    if (this.batchRoot) {
      this.scene.remove(this.batchRoot);
      this.batchRoot.traverse(node => {
        if (node.isInstancedMesh) node.dispose();
        if (node.userData.ownsGeometry) node.geometry.dispose();
      });
      this.batchRoot = null;
    }
  }

  buildBatches() {
    this.clearBatches();
    this.group.updateWorldMatrix(true, true);
    const root = new THREE.Group(), groups = new Map(), canonical = new Map();
    this.batchRoot = root; this.scene.add(root);
    const entryTypes = new Map(this.editable.map(entry => [entry.id, entry.type]));
    const primitiveKeys = new WeakMap();
    const geometryKey = geometry => {
      if (!['PlaneGeometry', 'ConeGeometry', 'ShapeGeometry'].includes(geometry.type)) return geometry.uuid;
      if (!primitiveKeys.has(geometry)) primitiveKeys.set(geometry, `${geometry.type}/${Array.from(geometry.attributes.position.array)}/${Array.from(geometry.attributes.uv.array)}/${geometry.index ? Array.from(geometry.index.array) : ''}`);
      return primitiveKeys.get(geometry);
    };
    const movingRoots = new Set(this.cameras.map(item => item.pivot));
    const movingEffects = new Map();
    for (const item of this.cameras) for (const mesh of [item.beam, item.pool]) movingEffects.set(mesh, item.pivot.parent);
    const keyFor = material => {
      if (material.isShaderMaterial) return JSON.stringify(['shader', material.userData.originalBatchVertex || material.vertexShader, material.fragmentShader,
        Object.fromEntries(Object.entries(material.uniforms).map(([key, uniform]) => [key, uniform.value])),
        material.side, material.blending, material.depthWrite, material.depthTest]);
      return JSON.stringify(['standard', material.map?.userData.assetUrl, material.transparent, material.opacity,
        material.side, material.alphaTest, material.roughness, material.metalness,
        material.emissive?.getHex(), material.emissiveIntensity, material.customProgramCacheKey()]);
    };
    this.group.traverseVisible(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || Array.isArray(mesh.material)) return;
      let dynamic = mesh.material.isShaderMaterial, owner = movingEffects.get(mesh), type = 'effects';
      for (let parent = mesh; parent && parent !== this.group; parent = parent.parent) {
        if (movingRoots.has(parent)) dynamic = true;
        if (parent.userData.editorId) {
          owner = parent;
          type = entryTypes.get(parent.userData.editorId) || type;
          break;
        }
      }
      const materialKey = keyFor(mesh.material);
      if (!canonical.has(materialKey)) canonical.set(materialKey, mesh.material);
      const material = canonical.get(materialKey);
      if (material.isShaderMaterial && !material.userData.instanceReady) {
        material.userData.originalBatchVertex = material.vertexShader;
        material.vertexShader = material.vertexShader.replace('gl_Position=', `vec4 batchPosition = vec4(position,1.0);
          #ifdef USE_INSTANCING
            batchPosition = instanceMatrix * batchPosition;
          #endif
          gl_Position=`).replace('modelViewMatrix*vec4(position,1.0)', 'modelViewMatrix*batchPosition');
        material.forceSinglePass = mesh.geometry.type !== 'ConeGeometry';
        material.userData.instanceReady = true; material.needsUpdate = true;
      }
      const animated = material.userData.vertexAnimated;
      const merge = material.isMeshStandardMaterial && !dynamic && !animated;
      const key = `${materialKey}/${merge ? 'merged' : geometryKey(mesh.geometry)}/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.renderOrder}/${dynamic}`;
      if (!groups.has(key)) groups.set(key, { material, merge, dynamic, sources: [], type });
      groups.get(key).sources.push({ mesh, owner });
    });
    let originalDraws = 0, batchDraws = 0;
    for (const { material, merge, dynamic, sources, type } of groups.values()) {
      if (sources.length < 2) continue;
      const first = sources[0].mesh;
      let batch, instances;
      if (merge) {
        const total = sources.reduce((sum, { mesh }) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count), 0);
        const positions = new Float32Array(total * 3), normals = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
        const point = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
        let cursor = 0;
        instances = sources.map(({ mesh }) => {
          const geo = mesh.geometry, start = cursor, count = geo.index?.count || geo.attributes.position.count;
          normalMatrix.getNormalMatrix(mesh.matrixWorld);
          for (let i = 0; i < count; i++, cursor++) {
            const index = geo.index ? geo.index.getX(i) : i;
            point.fromBufferAttribute(geo.attributes.position, index).applyMatrix4(mesh.matrixWorld).toArray(positions, cursor * 3);
            normal.fromBufferAttribute(geo.attributes.normal, index).applyNormalMatrix(normalMatrix).toArray(normals, cursor * 3);
            if (geo.attributes.uv) { uvs[cursor * 2] = geo.attributes.uv.getX(index); uvs[cursor * 2 + 1] = geo.attributes.uv.getY(index); }
          }
          if (!geo.boundingSphere) geo.computeBoundingSphere();
          const sphere = geo.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
          return { start, count, center: sphere.center, radius: sphere.radius };
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        const indices = Uint32Array.from({ length: total }, (_, i) => i);
        geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1).setUsage(THREE.DynamicDrawUsage));
        batch = new THREE.Mesh(geometry, material); batch.userData.ownsGeometry = true;
        this.mergedChunks.push({ high: batch, instances, indices });
      } else {
        batch = new THREE.InstancedMesh(first.geometry, material, sources.length);
        if (!first.geometry.boundingSphere) first.geometry.computeBoundingSphere();
        instances = sources.map(({ mesh, owner }, i) => {
          const matrix = mesh.matrixWorld.clone(), sphere = first.geometry.boundingSphere.clone().applyMatrix4(matrix);
          batch.setMatrixAt(i, matrix);
          return { matrix, center: sphere.center, radius: sphere.radius, mesh, owner };
        });
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.instanceMatrix.needsUpdate = true;
        if (dynamic) this.dynamicBatches.push({ high: batch, instances });
        else this.optimizedChunks.push({ high: batch, low: null, instances });
      }
      batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.renderOrder = first.renderOrder;
      batch.frustumCulled = false; batch.userData.profileType = type; root.add(batch);
      for (const { mesh } of sources) { mesh.visible = false; this.batchHidden.push(mesh); }
      originalDraws += sources.length; batchDraws++;
    }

    const grassInstances = [], matrix = new THREE.Matrix4(), world = new THREE.Matrix4();
    for (const source of [this.grassMesh, this.paintedGrass]) {
      if (!source) continue;
      source.updateWorldMatrix(true, false);
      if (!source.geometry.boundingSphere) source.geometry.computeBoundingSphere();
      for (let i = 0; i < source.count; i++) {
        source.getMatrixAt(i, matrix); const el = matrix.elements;
        if (Math.hypot(el[0], el[1], el[2]) < 0.001) continue;
        world.multiplyMatrices(source.matrixWorld, matrix);
        const sphere = source.geometry.boundingSphere.clone().applyMatrix4(world);
        grassInstances.push({ matrix: world.clone(), center: sphere.center, radius: sphere.radius });
      }
      source.visible = false; this.batchHidden.push(source);
    }
    if (this.grassMesh && grassInstances.length) {
      const high = new THREE.InstancedMesh(this.grassMesh.geometry, this.grassMesh.material, grassInstances.length);
      const medium = new THREE.InstancedMesh(this.grassMediumGeometry, this.grassMesh.material, grassInstances.length);
      const low = new THREE.InstancedMesh(this.grassLodGeometry, this.grassMesh.material, grassInstances.length);
      for (const mesh of [high, medium, low]) {
        mesh.receiveShadow = true; mesh.frustumCulled = false;
        mesh.userData.optimizedGrass = true; mesh.userData.profileType = 'grass';
      }
      grassInstances.forEach((item, i) => high.setMatrixAt(i, item.matrix));
      high.instanceMatrix.needsUpdate = true; medium.count = low.count = 0; medium.visible = low.visible = false; root.add(high, medium, low);
      this.optimizedChunks.push({ high, medium, low, instances: grassInstances });
    }
    const lights = [];
    this.group.traverseVisible(node => { if (node.isPointLight) lights.push(node); });
    this.lightField.bake(lights, this.getSettings?.().mapSize || 41);
    for (const light of lights) { light.visible = false; this.hiddenStaticLights.push(light); }
    this.lightField.bindScene(this.scene);
    this.batchStats = { originalDraws, batchDraws, grassInstances: grassInstances.length, bakedLights: lights.length };
    this.lastOptimizationUpdate = -Infinity;
    this.freezeStaticTransforms();
  }

  freezeStaticTransforms() {
    const animated = new Set(this.candleFlames);
    for (const item of this.cameras) {
      item.pivot.traverse(object => animated.add(object));
      for (const object of [item.light, item.light.target, item.beam, item.pool, item.beacon]) animated.add(object);
    }
    for (const entry of this.editable) if (entry.type === 'cave') entry.object.traverse(object => {
      if (/^caveRay(?:Light|Target|Shaft)/.test(object.name)) animated.add(object);
    });
    for (const root of [this.group, this.batchRoot]) {
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (animated.has(object)) return;
        this.frozenTransforms.push({ object, local: object.matrixAutoUpdate, world: object.matrixWorldAutoUpdate });
        object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
      });
    }
  }

  updateDynamicBatches() {
    if (!this.batchRoot) return;
    for (const { high, instances } of this.dynamicBatches) {
      let count = 0;
      for (const item of instances) {
        if (item.owner && !item.owner.visible) continue;
        item.mesh.updateWorldMatrix(true, false);
        high.setMatrixAt(count++, item.mesh.matrixWorld);
      }
      high.count = count; high.visible = count > 0; high.instanceMatrix.needsUpdate = true;
    }
    // Camera effect updates set their source visibility every frame. Their
    // original meshes stay editable but only their shared batches are rendered.
    for (const mesh of this.batchHidden) mesh.visible = false;
  }

  updateOptimizedVisibility(player, now, camera) {
    if (!this.batchRoot || now - this.lastOptimizationUpdate < 180) return false;
    this.lastOptimizationUpdate = now;
    const beams = this.fog.groundMistUniforms.uCameraLights.value;
    const beamCount = this.fog.groundMistUniforms.uCameraLightCount.value;
    const nearBeam = (center, radius) => {
      for (let i = 0; i < beamCount; i++) {
        const beam = beams[i], dx = beam.z - beam.x, dz = beam.w - beam.y, len = dx * dx + dz * dz;
        const t = len > 0 ? THREE.MathUtils.clamp(((center.x - beam.x) * dx + (center.z - beam.y) * dz) / len, 0, 1) : 0;
        if (Math.hypot(center.x - (beam.x + dx * t), center.z - (beam.y + dz * t)) < radius + 6) return true;
      }
      return false;
    };
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sphere = new THREE.Sphere();
    const visible = (item, margin = 5) => {
      const distance = Math.hypot(item.center.x - player.x, item.center.z - player.z);
      if (distance > 20 + item.radius && !nearBeam(item.center, item.radius)) return false;
      sphere.center.copy(item.center); sphere.radius = item.radius + margin;
      return frustum.intersectsSphere(sphere);
    };
    for (const chunk of this.optimizedChunks) {
      let highCount = 0, mediumCount = 0, lowCount = 0;
      for (const item of chunk.instances) {
        // Non-casters need only a sprint/animation margin until the next
        // 180 ms visibility update, rather than the long-shadow margin.
        if (!visible(item, chunk.high.castShadow ? 5 : 2.5)) continue;
        const distance = Math.hypot(item.center.x - player.x, item.center.z - player.z);
        if (chunk.low && distance > 9 + item.radius) chunk.low.setMatrixAt(lowCount++, item.matrix);
        else if (chunk.medium && distance > 4 + item.radius) chunk.medium.setMatrixAt(mediumCount++, item.matrix);
        else chunk.high.setMatrixAt(highCount++, item.matrix);
      }
      chunk.high.count = highCount; chunk.high.visible = highCount > 0; chunk.high.instanceMatrix.needsUpdate = true;
      if (chunk.medium) { chunk.medium.count = mediumCount; chunk.medium.visible = mediumCount > 0; chunk.medium.instanceMatrix.needsUpdate = true; }
      if (chunk.low) { chunk.low.count = lowCount; chunk.low.visible = lowCount > 0; chunk.low.instanceMatrix.needsUpdate = true; }
    }
    for (const chunk of this.mergedChunks) {
      const indices = chunk.high.geometry.index.array; let count = 0;
      for (const item of chunk.instances) {
        if (!visible(item)) continue;
        indices.set(chunk.indices.subarray(item.start, item.start + item.count), count); count += item.count;
      }
      chunk.high.geometry.setDrawRange(0, count); chunk.high.geometry.index.needsUpdate = true;
      chunk.high.visible = count > 0;
    }
    return true;
  }

  registerEditable(object,type,id) {
    const index=this.typeCounts[type]||0;
    if(!id) this.typeCounts[type]=index+1;
    const entry={id:id||`${type}-${index}`,type,object,base:true};
    object.userData.editorId=entry.id;
    this.editable.push(entry);
    return entry;
  }

  syncCollider(entry) {
    if(!entry.collider) return;
    const c=entry.collider,b=entry.colliderBase,o=entry.object;
    c.disabled=!o.visible;c.x=o.position.x;c.z=o.position.z;
    const scale=o.scale.x/b.scale;
    if(c.type==='circle') c.r=b.r*scale;
    else {
      const swapped=Math.abs(Math.sin(o.rotation.y-b.rotation))>0.707;
      c.halfX=(swapped?b.halfZ:b.halfX)*scale;
      c.halfZ=(swapped?b.halfX:b.halfZ)*scale;
    }
  }

  snapshot() {
    const round=n=>Math.round(n*1000)/1000;
    const objects=this.editable.filter(e=>e.object.visible).map(e=>({id:e.id,type:e.type,x:round(e.object.position.x),z:round(e.object.position.z),rotation:round(e.object.rotation.y),scale:round(e.object.scale.x),...(e.joinStart?{joinStart:true}:{}),...(e.joinEnd?{joinEnd:true}:{})}));
    const grass=[];
    if(this.grassMesh) {
      const matrix=new THREE.Matrix4(), pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),euler=new THREE.Euler();
      for(let i=0;i<this.grassMesh.count;i++) {
        this.grassMesh.getMatrixAt(i,matrix);matrix.decompose(pos,q,scale);euler.setFromQuaternion(q);
        if(scale.x>0.001) grass.push({id:i,x:round(pos.x),z:round(pos.z),rotation:round(euler.y),scale:round(scale.x)});
      }
    }
    const paintedGrass=[];
    if(this.paintedGrass) {
      const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),euler=new THREE.Euler();
      for(let i=0;i<this.paintedGrass.count;i++) {
        this.paintedGrass.getMatrixAt(i,matrix);matrix.decompose(pos,q,scale);euler.setFromQuaternion(q);
        if(scale.x>0.001) paintedGrass.push({id:i,x:round(pos.x),z:round(pos.z),rotation:round(euler.y),scale:round(scale.x)});
      }
    }
    return {version:1,objects,grass,paintedGrass,...(this.getSettings?{settings:this.getSettings()}:{})};
  }

  setGrass(index,data,painted=false) {
    const matrix=new THREE.Matrix4(),scale=Math.max(0,data.scale);
    matrix.compose(new THREE.Vector3(data.x,0,data.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),data.rotation),new THREE.Vector3(scale,scale,scale));
    const mesh=painted ? this.paintedGrass : this.grassMesh;
    mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;
  }

  paintGrass(x,z) {
    const mesh=this.paintedGrass;if(!mesh || mesh.count>=mesh.instanceMatrix.count) return false;
    const index=mesh.count++;
    this.setGrass(index,{x,z,rotation:Math.random()*Math.PI*2,scale:0.65+Math.random()*0.7},true);
    return true;
  }

  addFenceSection(type,id,joinStart=false,joinEnd=false) {
    const modelType=type==='stoneFenceSection'?'stoneFence':'fence';
    const model=[...this.modelTypes.entries()].find(([,name])=>name===modelType)?.[0];
    if(!model) return null;
    const object=model.clone(true);this.group.add(object);
    const entry=this.registerEditable(object,type,id||`extra-${crypto.randomUUID()}`);entry.base=false;
    this.setFenceJoin(entry,joinStart,joinEnd);
    const stone=type==='stoneFenceSection';
    entry.collider={type:'box',x:0,z:0,halfX:stone?0.94:1.03,halfZ:stone?0.125:0.09};
    entry.colliderBase={...entry.collider,scale:1,rotation:0};this.colliders.push(entry.collider);
    this.syncCollider(entry);return entry;
  }

  setFenceJoin(entry,joined,joinedEnd=false) {
    entry.joinStart=!!joined;entry.joinEnd=!!joinedEnd;
    const stone=entry.type==='stoneFenceSection';
    const left=entry.object.getObjectByName(stone?'Left stone post':'Left post');
    const right=entry.object.getObjectByName(stone?'Right stone post':'Right post');
    if(left) left.visible=!entry.joinStart;
    if(right) right.visible=!entry.joinEnd;
  }

  addEditable(type,id,joinStart=false,joinEnd=false) {
    if(type==='fenceSection'||type==='stoneFenceSection') return this.addFenceSection(type,id,joinStart,joinEnd);
    const source=(type==='pillar' ? this.editable.find(e=>e.type==='pillar' && e.base && !this.cameras.some(c=>c.pivot.parent===e.object)) : null) || this.editable.find(e=>e.type===type && e.base);
    const modelType=type==='cameraPillar'?'pillar':type==='grass'?'grass':null;
    const rawModel=modelType ? [...this.modelTypes.entries()].find(([,name])=>name===modelType)?.[0] : null;
    if(!source && !rawModel) return null;
    const object=(rawModel||source.object).clone(true);
    object.visible=true;
    this.group.add(object);
    const entry=this.registerEditable(object,type,id||`extra-${crypto.randomUUID()}`);entry.base=false;
    if(type==='cameraPillar') {
      entry.collider={type:'box',x:0,z:0,halfX:0.5,halfZ:0.5};
      entry.colliderBase={...entry.collider,scale:1,rotation:0};this.colliders.push(entry.collider);
      this.attachCamera(object);
    } else if(source?.colliderBase) {
      entry.colliderBase={...source.colliderBase};entry.collider={...source.collider};this.colliders.push(entry.collider);
    }
    object.traverse(node=>{
      if(node.isMesh && node.userData.isCandleFlame) this.candleFlames.push(node);
    });
    this.syncCollider(entry);return entry;
  }

  applyMap(data) {
    if(data?.version!==1 || !Array.isArray(data.objects) || !Array.isArray(data.grass) || data.objects.length>5000 || data.grass.length>10000) throw new Error('Неверный формат карты');
    const validTransform=e=>e && Number.isFinite(e.x) && Number.isFinite(e.z) && Number.isFinite(e.rotation) && Number.isFinite(e.scale) && e.scale>0 && e.scale<=10 && Math.abs(e.x)<=100 && Math.abs(e.z)<=100;
    const ids=new Set(), grassIds=new Set();
    for(const e of data.objects) {
      if(!validTransform(e) || typeof e.id!=='string' || typeof e.type!=='string' || ids.has(e.id)) throw new Error('Некорректные объекты в карте');
      ids.add(e.id);
    }
    for(const e of data.grass) {
      if(!validTransform(e) || !Number.isInteger(e.id) || e.id<0 || e.id>=this.grassMesh.instanceMatrix.count || grassIds.has(e.id)) throw new Error('Некорректная трава в карте');
      grassIds.add(e.id);
    }
    if(data.settings && this.setSettings) this.setSettings(data.settings);
    const saved=new Map(data.objects.map(e=>[e.id,e]));
    for(const entry of this.editable) {
      const value=saved.get(entry.id);
      entry.object.visible=!!value;
      if(value) {
        if(entry.type==='fenceSection'||entry.type==='stoneFenceSection') this.setFenceJoin(entry,value.joinStart,value.joinEnd);
        entry.object.position.set(value.x,0,value.z);entry.object.rotation.y=value.rotation;entry.object.scale.setScalar(value.scale);
        saved.delete(entry.id);
      }
      this.syncCollider(entry);
    }
    for(const value of saved.values()) {
      const entry=this.addEditable(value.type,value.id,value.joinStart,value.joinEnd);if(!entry) continue;
      entry.object.position.set(value.x,0,value.z);entry.object.rotation.y=value.rotation;entry.object.scale.setScalar(value.scale);this.syncCollider(entry);
    }
    const painted=Array.isArray(data.paintedGrass)?data.paintedGrass:[];
    if(painted.length>this.paintedGrass.instanceMatrix.count) throw new Error('Слишком много нарисованной травы');
    const paintedIds=new Set();
    for(const e of painted) {
      if(!validTransform(e)||!Number.isInteger(e.id)||e.id<0||e.id>=this.paintedGrass.instanceMatrix.count||paintedIds.has(e.id)) throw new Error('Некорректная нарисованная трава');
      paintedIds.add(e.id);
    }
    this.paintedGrass.count=painted.length ? Math.max(...painted.map(e=>e.id))+1 : 0;
    const byId=new Map(painted.map(e=>[e.id,e]));
    for(let i=0;i<this.paintedGrass.count;i++) this.setGrass(i,byId.get(i)||{x:0,z:0,rotation:0,scale:0},true);
    if(this.grassMesh) {
      const grass=new Map(data.grass.map(e=>[e.id,e]));
      this.grassMesh.count=data.grass.reduce((max,e)=>Math.max(max,e.id+1),0);
      for(let i=0;i<this.grassMesh.count;i++) this.setGrass(i,grass.get(i)||{x:0,z:0,rotation:0,scale:0});
    }
  }

  isBlocked(x,z,radius) {
    return this.colliders.some(c => {
      if(c.disabled) return false;
      if(c.type==='circle') return Math.hypot(x-c.x,z-c.z)<radius+c.r;
      const dx=Math.max(Math.abs(x-c.x)-c.halfX,0), dz=Math.max(Math.abs(z-c.z)-c.halfZ,0);
      return dx*dx+dz*dz<radius*radius;
    });
  }

  update(now, playerPosition, camera) {
    foliageWind.value=now*0.001;
    this.candleTime.value=now*0.001;
    const caveTime=now*0.001;
    for(const entry of this.editable){
      if(entry.type!=='cave'||!entry.object.visible)continue;
      for(let i=0;i<2;i++){
        const light=entry.object.getObjectByName(`caveRayLight${i}`);
        const target=entry.object.getObjectByName(`caveRayTarget${i}`);
        if(!light||!target)continue;
        // Rebind the target on cloned caves as well as original ones.
        light.target=target;
        const phase=i*2.2,sine=Math.sin(caveTime*0.65+phase);
        const t=THREE.MathUtils.clamp((sine+0.7)/1.05,0,1);
        light.intensity=3.5*t*t*(3-2*t);
        const yaw=(i?0.25:-0.25)+Math.sin(caveTime*0.35+i*Math.PI)*0.07;
        const pitch=-0.15+Math.sin(caveTime*0.43+phase)*0.20;
        target.position.set(Math.sin(yaw)*2.6,Math.max(0.03,0.55+Math.sin(pitch)*2.6),0.38+Math.cos(yaw)*2.6);
        const shaft=entry.object.getObjectByName(`caveRayShaft${i}`);
        const effectivePitch=Math.atan2(target.position.y-light.position.y,Math.hypot(target.position.x-light.position.x,target.position.z-light.position.z));
        if(shaft){shaft.rotation.y=yaw;shaft.rotation.x=Math.PI/2-effectivePitch;}
      }
    }
    for(const flame of this.candleFlames) {
      if(camera) {
        // Flames are inside rotated sets, so convert the camera orientation to local space.
        flame.parent.getWorldQuaternion(flame.quaternion).invert().multiply(camera.quaternion);
      }
    }
    for(const item of this.candleLights) item.light.intensity=1.25+0.17*Math.sin(now*0.008+item.phase)+0.08*Math.sin(now*0.017+item.phase);
    for(const item of this.jackLights) item.light.intensity=1.4+0.18*Math.sin(now*0.006+item.phase)+0.08*Math.sin(now*0.014+item.phase);
    if(playerPosition) {
      foliagePlayer.value.copy(playerPosition);
      if(!this.lastGrassStep) this.lastGrassStep = playerPosition.clone();
      if(Math.hypot(playerPosition.x-this.lastGrassStep.x, playerPosition.z-this.lastGrassStep.z) >= 0.18) {
        grassSteps.value[this.grassStepIndex].set(playerPosition.x, playerPosition.z, foliageWind.value, 0);
        this.grassStepIndex = (this.grassStepIndex + 1) % grassSteps.value.length;
        this.lastGrassStep.copy(playerPosition);
      }
    }
    const down=new THREE.Vector3(0,-1,0);
    for(const item of this.cameras) {
      const visible=item.pivot.parent.visible;
      item.light.visible=item.beam.visible=item.pool.visible=item.beacon.visible=visible;
      if(!visible) {
        if(item.fogIndex>=0){
          this.fog.groundMistUniforms.uCameraLights.value[item.fogIndex].set(10000,10000,10000,10000);
          this.fog.cameraHeads[item.fogIndex]=new THREE.Vector3(10000,0,10000);
        }
        continue;
      }
      const angle=item.baseAngle + Math.sin(now * 0.00045 + item.phase) * 0.7;
      item.pivot.rotation.y=angle;
      item.lamp.updateWorldMatrix(true,false);
      // Centre of the lens face in the imported model, just outside its surface.
      const origin=item.lamp.localToWorld(new THREE.Vector3(0,24.3125/16,11.45/16));
      // Use the lens's transformed forward axis, including the edited post rotation.
      const forward=item.lamp.localToWorld(new THREE.Vector3(0,24.3125/16,11.45/16+1)).sub(origin);
      forward.y=0;
      if(forward.lengthSq()<1e-8) forward.set(0,0,1);else forward.normalize();
      item.beacon.position.copy(origin).addScaledVector(forward,-0.28);
      if(item.fogIndex>=0) this.fog.cameraHeads[item.fogIndex]=origin;
      const target=new THREE.Vector3(origin.x+forward.x*3.2,0,origin.z+forward.z*3.2);
      item.light.position.copy(origin);item.light.target.position.copy(target);
      item.pool.position.set(target.x,0.075,target.z);
      const offset=new THREE.Vector3().subVectors(target,origin),length=offset.length();
      item.beam.position.copy(origin).add(target).multiplyScalar(0.5);
      item.beam.scale.y=length;
      item.beam.quaternion.setFromUnitVectors(down,offset.normalize());
      if(item.fogIndex>=0) this.fog.groundMistUniforms.uCameraLights.value[item.fogIndex].set(origin.x,origin.z,target.x,target.z);
    }
    this.updateDynamicBatches();
  }
}
