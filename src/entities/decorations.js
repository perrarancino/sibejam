import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const loader = new THREE.TextureLoader();
const beaconCanvas=document.createElement('canvas');beaconCanvas.width=64;beaconCanvas.height=64;
const beaconCtx=beaconCanvas.getContext('2d');const beaconGradient=beaconCtx.createRadialGradient(32,32,1,32,32,32);
beaconGradient.addColorStop(0,'rgba(225,255,215,0.5)');beaconGradient.addColorStop(0.2,'rgba(151,222,145,0.22)');beaconGradient.addColorStop(1,'rgba(100,180,115,0)');beaconCtx.fillStyle=beaconGradient;beaconCtx.fillRect(0,0,64,64);
const beaconTexture=new THREE.CanvasTexture(beaconCanvas);

async function loadModel(name) {
  const response = await fetch(`./assets/models/${name}.json`);
  if (!response.ok) throw new Error(`Не удалось загрузить модель ${name}`);
  const data = await response.json();
  const materials = data.textures.map(url => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const material = new THREE.MeshStandardMaterial({map:texture, transparent:true, alphaTest:0.1, side:THREE.DoubleSide, roughness:1, emissive:0xffffff, emissiveMap:texture, emissiveIntensity:0.22});
    if (name === 'church') {
      material.normalMap = loader.load('./assets/models/church-normal.png');
      material.normalScale.set(1.1, 1.1);
      // Dark vertical openings stay dark; sloping roof surfaces keep normal lighting.
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vChurchNormalY;')
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvChurchNormalY = abs(objectNormal.y);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vChurchNormalY;')
          .replace('#include <opaque_fragment>', `
            float churchLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float darkOpening = 1.0 - smoothstep(0.025, 0.12, churchLuminance);
            float wallSurface = 1.0 - smoothstep(0.18, 0.5, vChurchNormalY);
            outgoingLight *= 1.0 - darkOpening * wallSurface * 0.72;
            #include <opaque_fragment>`);
      };
    }
    return material;
  });
  const root = new THREE.Group();
  for (const part of data.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.position,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(part.uv,2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry,materials[part.texture]);
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
    this.group=new THREE.Group();
    scene.add(this.group);
    this.load().catch(error=>console.error('Ошибка загрузки декораций:',error));
  }
  async load() {
    const [tree,pillar,grave,camera,church]=await Promise.all(['tree','pillar','grave','camera','church'].map(loadModel));
    const place=(model,x,z,scale,rotation=0)=>{const item=model.clone();item.position.set(x,0,z);item.scale.setScalar(scale);item.rotation.y=rotation;this.group.add(item);return item;};
    place(church,0,0,1.65,Math.PI);
    [[-10,-9],[-5,-10],[1,-10],[8,-9],[-10,-3],[10,-3],[-10,4],[10,4],[-10,10],[-4,10],[3,10],[9,10],[-5,1],[6,2]].forEach(([x,z],i)=>place(tree,x,z,0.52, (i%4)*Math.PI/2));
    [[-7,-6],[-4,-6],[3,-7],[6,-7],[-7,5],[-4,5],[4,6],[7,6],[0,-5]].forEach(([x,z],i)=>place(grave,x,z,1.15,(i%2)*Math.PI));
    const pillars=[[-8,-1],[8,-1],[-3,8],[4,-8]];
    pillars.forEach(([x,z],i)=>{
      const post=place(pillar,x,z,1.0);
      if(i===2)return;
      const pivot=new THREE.Group();pivot.position.set(0,2.05,0);post.add(pivot);
      const lamp=camera.clone();lamp.scale.setScalar(0.5);pivot.add(lamp);
      const light=new THREE.SpotLight(0xc9eab8,45,12,0.48,0.8,1.5);
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

  update(now) {
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
