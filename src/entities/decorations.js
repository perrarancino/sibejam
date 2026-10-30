import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const loader = new THREE.TextureLoader();
const foliageWind = {value:0};
const foliagePlayer = {value:new THREE.Vector3(1000, 0, 1000)};
// Recent footsteps make nearby tufts shake briefly, then come to rest.
const grassSteps = {value:Array.from({length:12}, () => new THREE.Vector4(0, 0, -100, 0))};
const beaconCanvas=document.createElement('canvas');beaconCanvas.width=64;beaconCanvas.height=64;
const beaconCtx=beaconCanvas.getContext('2d');const beaconGradient=beaconCtx.createRadialGradient(32,32,1,32,32,32);
beaconGradient.addColorStop(0,'rgba(225,255,215,0.5)');beaconGradient.addColorStop(0.2,'rgba(151,222,145,0.22)');beaconGradient.addColorStop(1,'rgba(100,180,115,0)');beaconCtx.fillStyle=beaconGradient;beaconCtx.fillRect(0,0,64,64);
const beaconTexture=new THREE.CanvasTexture(beaconCanvas);

async function loadModel(name) {
  const response = await fetch(`./assets/models/${name}.json${name === 'church' ? '?v=church-4' : ''}`);
  if (!response.ok) throw new Error(`Не удалось загрузить модель ${name}`);
  const data = await response.json();
  const materials = data.textures.map((url, textureIndex) => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const material = new THREE.MeshStandardMaterial({map:texture, transparent:true, alphaTest:0.1, side:THREE.DoubleSide, roughness:1, emissive:0xffffff, emissiveMap:texture, emissiveIntensity:0.13});
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
            float sway = sin(foliageWind * 1.1 + modelMatrix[3].x * 0.35 + modelMatrix[3].z * 0.25);
            transformed.x += sway * 0.085 * clamp((position.y - 0.4) / 1.5, 0.0, 1.0);
            transformed.z += cos(foliageWind * 0.85 + modelMatrix[3].z * 0.3) * 0.04 * clamp((position.y - 0.4) / 1.5, 0.0, 1.0);`);
      };
      material.customProgramCacheKey = () => 'foliage-wind-v1';
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
              float nearStep = 1.0 - smoothstep(0.2, 1.15, distance(grassBase.xz, grassSteps[i].xy));
              float fade = (1.0 - smoothstep(0.0, 1.15, age)) * step(0.0, age);
              shake += sin(age * 17.0 + grassBase.x * 3.0 + grassBase.z * 2.0) * nearStep * fade;
            }
            float angle = clamp(shake * 0.12, -0.24, 0.24);
            float c = cos(angle), sn = sin(angle);
            // Rotate the entire tuft about its base: the blades keep their shape.
            transformed = vec3(position.x * c + position.y * sn, -position.x * sn + position.y * c, position.z);
          `);
      };
      material.customProgramCacheKey = () => 'vegetation-footsteps-v1';
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
  return root;
}

export class Decorations {
  constructor(scene, fog) {
    this.scene=scene;
    this.fog=fog;
    this.cameras=[];
    this.candleFlames=[];
    this.candleLights=[];
    this.candleTime={value:0};
    this.colliders=[];
    this.lastGrassStep=null;
    this.grassStepIndex=0;
    this.group=new THREE.Group();
    scene.add(this.group);
    this.load().catch(error=>console.error('Ошибка загрузки декораций:',error));
  }
  async load() {
    const [broadleaf,pine,tall,bare,pillar,camera,church,fence,grass,bush,pumpkin,candles]=await Promise.all(['new-tree-broadleaf','new-tree-pine','new-tree-tall','new-tree-bare','pillar','camera','church','fence','grass','bush','pumpkin','candles'].map(loadModel));
    const trees=[broadleaf,pine,tall,bare];
    const place=(model,x,z,scale,rotation=0)=>{const item=model.clone();item.position.set(x,0,z);item.scale.setScalar(scale);item.rotation.y=rotation;this.group.add(item);return item;};
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
        flame.renderOrder=2;set.add(flame);this.candleFlames.push(flame);
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
        this.colliders.push({type:'box',x,z,halfX:rotation ? 0.09 : count+0.03,halfZ:rotation ? count+0.03 : 0.09});
      };
      addFence(-5,-11,3);addFence(5,11,3);addFence(-11,2,3,Math.PI/2);addFence(11,-3,2,Math.PI/2);
    }
    [[-10,-9],[-5,-10],[1,-10],[8,-9],[-10,-3],[10,-3],[-10,4],[10,4],[-10,10],[-4,10],[3,10],[9,10],[-5,1],[6,2]].forEach(([x,z],i)=>{place(trees[i%trees.length],x,z,2.1, (i%4)*Math.PI/2);circle(x,z,[0.18,0.16,0.16,0.20][i%4]);});
    const pillars=[[-8,-1],[8,-1],[-3,8],[4,-8]];
    pillars.forEach(([x,z])=>this.colliders.push({type:'box',x,z,halfX:0.5,halfZ:0.5}));
    // Stable seeded layout: geometry is instanced once; wind and proximity run on the GPU.
    let seed=74321;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const clear=(x,z,pad=0)=> !this.colliders.some(c => c.type==='circle' ? Math.hypot(x-c.x,z-c.z)<c.r+pad : Math.abs(x-c.x)<c.halfX+pad && Math.abs(z-c.z)<c.halfZ+pad) && Math.hypot(x,z-6)>0.9+pad;
    const bushes=[[-8,-7],[-6,-3],[7,-5],[9,1],[-8,7],[-2,9],[6,8],[8,5],[-9,1],[3,-10],[5,4],[-5,3]];
    bushes.forEach(([x,z],i)=>{if(clear(x,z,0.5)){place(bush,x,z,1.3,(i%4)*Math.PI/2);}});
    [[-6,7],[6,-4],[-3,-8],[8,8],[2,8],[-9,-5]].forEach(([x,z],i)=>{if(clear(x,z,0.45)){place(pumpkin,x,z,0.65,(i%4)*Math.PI/2);circle(x,z,0.35);}});
    const grassPart=grass.children[0];
    if(grassPart) {
      const matrices=[];
      // Clumps leave open ground between them; a fixed seed keeps the layout stable.
      for(let patch=0;patch<145;patch++) {
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
      const tufts=new THREE.InstancedMesh(grassPart.geometry,grassPart.material,matrices.length);
      matrices.forEach((matrix,i)=>tufts.setMatrixAt(i,matrix));
      tufts.instanceMatrix.needsUpdate=true; tufts.receiveShadow=true;
      this.group.add(tufts);
    }
    pillars.forEach(([x,z],i)=>{
      const post=place(pillar,x,z,1.0);
      if(i===2)return;
      const pivot=new THREE.Group();pivot.position.set(0,2.05,0);post.add(pivot);
      const lamp=camera.clone();lamp.scale.setScalar(0.5);pivot.add(lamp);
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
      const fogIndex=this.fog.addCameraLight(x,z,x+2,z+2);
      this.cameras.push({pivot,lamp,light,beam,pool,beacon,fogIndex,baseAngle:i*Math.PI*.7,phase:i*1.7});
    });
  }

  isBlocked(x,z,radius) {
    return this.colliders.some(c => {
      if(c.type==='circle') return Math.hypot(x-c.x,z-c.z)<radius+c.r;
      const dx=Math.max(Math.abs(x-c.x)-c.halfX,0), dz=Math.max(Math.abs(z-c.z)-c.halfZ,0);
      return dx*dx+dz*dz<radius*radius;
    });
  }

  update(now, playerPosition, camera) {
    foliageWind.value=now*0.001;
    this.candleTime.value=now*0.001;
    for(const flame of this.candleFlames) {
      if(camera) {
        // Flames are inside rotated sets, so convert the camera orientation to local space.
        flame.parent.getWorldQuaternion(flame.quaternion).invert().multiply(camera.quaternion);
      }
    }
    for(const item of this.candleLights) item.light.intensity=1.25+0.17*Math.sin(now*0.008+item.phase)+0.08*Math.sin(now*0.017+item.phase);
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
      const angle=item.baseAngle + Math.sin(now * 0.00045 + item.phase) * 0.7;
      item.pivot.rotation.y=angle;
      item.lamp.updateWorldMatrix(true,false);
      // Centre of the lens face in the imported model, just outside its surface.
      const origin=item.lamp.localToWorld(new THREE.Vector3(0,24.3125/16,11.45/16));
      item.beacon.position.copy(origin).add(new THREE.Vector3(-Math.sin(angle)*0.28,0,-Math.cos(angle)*0.28));
      this.fog.cameraHeads[item.fogIndex]=origin;
      const target=new THREE.Vector3(origin.x + Math.sin(angle)*3.2,0,origin.z + Math.cos(angle)*3.2);
      item.light.position.copy(origin);item.light.target.position.copy(target);
      item.pool.position.set(target.x,0.075,target.z);
      const offset=new THREE.Vector3().subVectors(target,origin),length=offset.length();
      item.beam.position.copy(origin).add(target).multiplyScalar(0.5);
      item.beam.scale.y=length;
      item.beam.quaternion.setFromUnitVectors(down,offset.normalize());
      this.fog.groundMistUniforms.uCameraLights.value[item.fogIndex].set(origin.x,origin.z,target.x,target.z);
    }
  }
}
