import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const noiseGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+8.)*.28+noise(p*4.07+17.)*.15;}`;
// Ground decals and liquids render before airborne transparent effects. Depth testing stays enabled.
const FX_ORDER={stain:-20,liquid:-10};
const bloodColorGLSL='float bloodShade=clamp(diffuseColor.r,0.,1.);diffuseColor.rgb=vec3(0.20+0.24*bloodShade,0.008+0.018*bloodShade,0.012+0.014*bloodShade);';
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export class TrapEffects {
  constructor(scene){
    this.scene=scene;this.time=0;this.particles=[];this.bloodDrops=[];this.stains=[];this.rings=[];this.limit=192;this.bloodLimit=192;this.stainLimit=48;this.dummy=new THREE.Object3D();this.fragments=[];this.fragmentLimit=48;this.fragmentCache=new WeakMap();this.splashes=[];
    const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.6,'#fffe');g.addColorStop(1,'#fff0');c.fillStyle=g;c.fillRect(0,0,64,64);this.dotTexture=new THREE.CanvasTexture(cv);
    const loader=new THREE.TextureLoader();this.bloodTexture=loader.load('./assets/effects/blood-splat.png');this.bloodTexture.colorSpace=THREE.SRGBColorSpace;this.decalTexture=loader.load('./assets/effects/blood-decal.png');this.decalTexture.colorSpace=THREE.SRGBColorSpace;
    this.batch=this.makeParticleBatch(this.limit,true);this.bloodBatch=this.makeParticleBatch(this.bloodLimit,false,this.bloodTexture);this.splashBatch=this.makeParticleBatch(24,false,this.decalTexture,true);scene.add(this.batch,this.bloodBatch,this.splashBatch);
    this.stainTexture=this.decalTexture;const sg=new THREE.PlaneGeometry(1,1);this.stainOpacity=new THREE.InstancedBufferAttribute(new Float32Array(this.stainLimit),1);sg.setAttribute('stainOpacity',this.stainOpacity);this.stainVariant=new THREE.InstancedBufferAttribute(new Float32Array(this.stainLimit),1);sg.setAttribute('stainVariant',this.stainVariant);
    const sm=new THREE.MeshBasicMaterial({map:this.stainTexture,color:0xffd3d3,toneMapped:false,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});sm.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float stainOpacity;attribute float stainVariant;varying float vStainOpacity;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStainOpacity=stainOpacity;').replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=(vMapUv+vec2(mod(stainVariant,2.),floor(stainVariant/2.)))*.5;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vStainOpacity;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vStainOpacity;'+bloodColorGLSL);};
    this.stainBatch=new THREE.InstancedMesh(sg,sm,this.stainLimit);this.stainBatch.renderOrder=FX_ORDER.stain;this.stainBatch.frustumCulled=false;this.stainBatch.count=0;scene.add(this.stainBatch);
    this.flameMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform float time;${noiseGLSL}
      void main(){float t=vUv.y;vec2 flow=vec2(vUv.x*4.,t*5.-time*5.5);float n=fbm(flow),detail=noise(flow*2.5+time*.3);float bend=(n-.5)*.28*t;float x=abs(vUv.x-.5+bend);float width=(.13+.24*sin(t*2.8))*pow(1.-t,.48);float body=1.-smoothstep(width-.055,width+.03,x+(detail-.5)*.14);float tip=1.-smoothstep(.73+n*.16,1.,t);float core=1.-smoothstep(.015,.15*(1.-t)+.025,x);vec3 color=mix(vec3(1.,.12,.008),vec3(1.,.64,.06),core);color=mix(color,vec3(1.,.95,.65),core*pow(1.-t,3.)*.6);color=mix(vec3(.18,.40,1.),color,smoothstep(.0,.13,t));float alpha=body*tip*smoothstep(0.,.035,t)*(.42+n*.4);color*=.75+n*.25;gl_FragColor=vec4(color,alpha);}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  }
  makeParticleBatch(count,additive,texture=this.dotTexture,atlas=false){
    const geometry=new THREE.PlaneGeometry(.18,.18);
    for(const name of ['particleAlpha','particleVariant','particleRotation'])geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(count),1));
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
    const isBlood=texture===this.bloodTexture||texture===this.decalTexture;if(isBlood)material.toneMapped=false;
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float particleAlpha;attribute float particleVariant;attribute float particleRotation;varying float vParticleAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvParticleAlpha=particleAlpha;').replace('#include <project_vertex>',`vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);float cs=cos(particleRotation),sn=sin(particleRotation);vec2 q=mat2(cs,-sn,sn,cs)*position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));mvPosition.xy+=q;gl_Position=projectionMatrix*mvPosition;`);
      if(atlas)shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=(vMapUv+vec2(mod(particleVariant,2.),floor(particleVariant/2.)))*.5;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vParticleAlpha;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vParticleAlpha;'+(isBlood?bloodColorGLSL:'' ));
    };
    const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;return mesh;
  }
  burst(position,color,count=20,force=3){
    for(let i=0;i<count&&this.particles.length<this.limit;i++){const a=Math.random()*Math.PI*2,s=force*(.3+Math.random()*.7);this.particles.push({p:position.clone(),v:new THREE.Vector3(Math.cos(a)*s,1+Math.random()*force,Math.sin(a)*s),life:.4+Math.random()*.65,color:new THREE.Color(color),size:.6+Math.random()*.8});}
  }
  blood(position,amount=8){
    if(this.splashes.length<24)this.splashes.push({p:position.clone(),v:new THREE.Vector3((Math.random()-.5)*.7,.2,(Math.random()-.5)*.7),life:.34,max:.34,variant:Math.floor(Math.random()*4),rotation:Math.random()*6.28,color:new THREE.Color(0xffffff),size:4.2});
    for(let i=0;i<amount&&this.bloodDrops.length<this.bloodLimit;i++){const a=Math.random()*Math.PI*2,s=.7+Math.random()*2;this.bloodDrops.push({p:position.clone(),v:new THREE.Vector3(Math.cos(a)*s,Math.random()*2,Math.sin(a)*s),life:.7+Math.random()*.4,color:new THREE.Color().setScalar(.75+Math.random()*.25),rotation:Math.random()*6.28,size:.85+Math.random()*.95});}
  }
  stain(position,size=.35){if(this.stains.length>=this.stainLimit)this.stains.shift();this.stains.push({p:position.clone(),size,rotation:Math.random()*Math.PI*2,variant:Math.floor(Math.random()*4),life:18});}
  explode(position,radius){
    this.burst(position.clone().add(new THREE.Vector3(0,.3,0)),0xffaa37,40,4.5);
    for(const smoke of [false,true]){const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshBasicMaterial({color:smoke?0x51483f:0xffb33d,transparent:true,opacity:smoke?.3:.8,depthWrite:false,blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending}));cloud.position.copy(position);cloud.position.y=.35;this.scene.add(cloud);this.rings.push({mesh:cloud,life:smoke?1.1:.35,max:smoke?1.1:.35,radius:smoke?radius*.7:radius*.45,smoke,sphere:true});}
    const mesh=new THREE.Mesh(new THREE.RingGeometry(.82,1,64),new THREE.MeshBasicMaterial({color:0xffc06a,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;mesh.position.copy(position);mesh.position.y=.1;this.scene.add(mesh);this.rings.push({mesh,life:.55,max:.55,radius});
  }
  puddle(position,radius){
    const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},fade:{value:1}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform float time;uniform float fade;${noiseGLSL}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float edge=.84+.035*sin(a*5.)+.025*cos(a*9.)+.03*(noise(p*4.)-.5);float mask=1.-smoothstep(edge-.015,edge+.012,r);float depth=1.-smoothstep(.12,edge,r);float n=fbm(p*3.5+vec2(time*.018,-time*.012));float wave=sin(r*35.-time*2.2+n*3.);vec2 slope=vec2(sin(p.x*15.+time*.6+n),cos(p.y*17.-time*.45+n))*.07+p*wave*.06;vec3 normal=normalize(vec3(slope,1.));float spec=pow(max(0.,dot(normal,normalize(vec3(.12,-.1,1.)))),48.);float meniscus=exp(-abs(r-edge+.025)*80.);vec2 cell=floor((p+1.)*7.);vec2 bp=fract((p+1.)*7.)-.5;float bubbleRadius=.10+.035*sin(time*1.4+hash(cell)*8.);float bubble=(1.-smoothstep(.015,.04,abs(length(bp)-bubbleRadius)))*step(.78,hash(cell))*depth;vec3 liquid=mix(vec3(.09,.20,.025),vec3(.20,.38,.055),n*.7+depth*.25);liquid+=vec3(.35,.46,.21)*(spec*.35+meniscus*.28+bubble*.23);float alpha=mix(.60,.88,depth)*mask*fade;gl_FragColor=vec4(liquid,alpha);}`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius*2.35,radius*2.35),material);mesh.rotation.x=-Math.PI/2;mesh.position.copy(position);mesh.position.y=.045;mesh.renderOrder=FX_ORDER.liquid;this.scene.add(mesh);this.burst(position.clone().add(new THREE.Vector3(0,.25,0)),0x6d9f32,20,1.8);return mesh;
  }
  flame(position,direction,length){
    if(this.particles.length>=this.limit)return;
    this.particles.push({p:position.clone().addScaledVector(direction,Math.random()*length),v:direction.clone().multiplyScalar(1.5).add(new THREE.Vector3(0,.7,0)),life:.2+Math.random()*.2,color:new THREE.Color(Math.random()>.5?0xffc342:0xff6b1d),size:.35+Math.random()*.35});
  }
  fractureGeometry(source){
    if(this.fragmentCache.has(source))return this.fragmentCache.get(source);
    source.computeBoundingBox();const center=new THREE.Vector3();source.boundingBox.getCenter(center);
    const pos=source.attributes.position,uv=source.attributes.uv,index=source.index,buckets=Array.from({length:8},()=>({p:[],uv:[]}));
    const count=index?index.count:pos.count;
    for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);let x=0,y=0,z=0;for(const id of ids){x+=pos.getX(id)/3;y+=pos.getY(id)/3;z+=pos.getZ(id)/3;}const bucket=buckets[(x>center.x?1:0)+(y>center.y?2:0)+(z>center.z?4:0)];for(const id of ids){bucket.p.push(pos.getX(id),pos.getY(id),pos.getZ(id));bucket.uv.push(uv?.getX(id)||0,uv?.getY(id)||0);}}
    const pieces=buckets.filter(b=>b.p.length).map(b=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geometry.computeVertexNormals();geometry.computeBoundingBox();const origin=new THREE.Vector3();geometry.boundingBox.getCenter(origin);geometry.translate(-origin.x,-origin.y,-origin.z);return {geometry,origin};});this.fragmentCache.set(source,pieces);return pieces;
  }
  destroy(object,kind=object.userData.key){
    object.updateWorldMatrix(true,true);
    let emitted=0;
    object.traverseVisible(source=>{
      if(!source.isMesh||!source.material.isMeshStandardMaterial||emitted>=12)return;
      for(const piece of this.fractureGeometry(source.geometry)){
        if(emitted++>=12)break;
        while(this.fragments.length>=this.fragmentLimit){const old=this.fragments.shift();this.scene.remove(old.mesh);old.mesh.material.dispose();}
        const material=source.material.clone();material.transparent=true;material.depthWrite=false;const mesh=new THREE.Mesh(piece.geometry,material);source.getWorldQuaternion(mesh.quaternion);source.getWorldScale(mesh.scale);mesh.position.copy(piece.origin).applyMatrix4(source.matrixWorld);
        const dx=mesh.position.x-object.position.x,dz=mesh.position.z-object.position.z;const strength=kind==='mine'?3.4:kind==='packet'?.6:1.7;
        const velocity=new THREE.Vector3(dx*strength+(Math.random()-.5)*strength,kind==='packet'?.6:1.2+Math.random()*strength,dz*strength+(Math.random()-.5)*strength);
        this.scene.add(mesh);this.fragments.push({mesh,v:velocity,spin:new THREE.Vector3(Math.random()*5,Math.random()*5,Math.random()*5),life:kind==='packet'?.55:1.1+Math.random()*.5,baseScale:mesh.scale.clone()});
      }
    });
    if(kind!=='packet')this.burst(object.position.clone().add(new THREE.Vector3(0,.2,0)),kind==='log'?0xb18a55:0xe6b36d,8,.9);
  }
  updateFragments(dt){
    for(let i=this.fragments.length-1;i>=0;i--){const f=this.fragments[i];f.life-=dt;if(f.life<=0){this.scene.remove(f.mesh);f.mesh.material.dispose();this.fragments.splice(i,1);continue;}f.v.y-=7*dt;f.mesh.position.addScaledVector(f.v,dt);f.mesh.rotation.x+=f.spin.x*dt;f.mesh.rotation.y+=f.spin.y*dt;f.mesh.rotation.z+=f.spin.z*dt;if(f.mesh.position.y<.05){f.mesh.position.y=.05;f.v.y=Math.abs(f.v.y)*.22;f.v.x*=.86;f.v.z*=.86;f.spin.multiplyScalar(.8);}f.mesh.material.opacity=Math.min(1,f.life/.35);f.mesh.scale.copy(f.baseScale).multiplyScalar(Math.min(1,f.life/.2));}
  }
  updateBatch(particles,mesh,dt,blood=false){
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.v.y-=6*dt;p.p.addScaledVector(p.v,dt);if(p.p.y<.035&&blood){if(i%3===0)this.stain(p.p,.28+Math.random()*.25);particles.splice(i,1);continue;}if(p.life<=0){particles.splice(i,1);continue;}if(p.p.y<.05){p.p.y=.05;p.v.multiplyScalar(.55);p.v.y=Math.abs(p.v.y)*.2;}}
    mesh.count=particles.length;particles.forEach((p,i)=>{this.dummy.position.copy(p.p);const scale=p.size*(p.max===.34?(.65+(1-p.life/p.max)*.65):Math.min(1,p.life*4));this.dummy.rotation.set(0,0,0);this.dummy.scale.set(scale,blood?scale*1.6:scale,scale);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);mesh.setColorAt(i,p.color);mesh.geometry.attributes.particleAlpha.setX(i,p.max?Math.min(1,p.life/p.max*1.8):1);mesh.geometry.attributes.particleRotation.setX(i,p.rotation||0);mesh.geometry.attributes.particleVariant.setX(i,p.variant||0);});for(const name of ['particleAlpha','particleRotation','particleVariant'])mesh.geometry.attributes[name].needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
  update(dt){
    this.time+=dt;this.flameMaterial.uniforms.time.value=this.time;this.updateBatch(this.particles,this.batch,dt);this.updateBatch(this.bloodDrops,this.bloodBatch,dt,true);this.updateBatch(this.splashes,this.splashBatch,dt);this.updateFragments(dt);
    for(let i=this.stains.length-1;i>=0;i--)if((this.stains[i].life-=dt)<=0)this.stains.splice(i,1);
    this.stainBatch.count=this.stains.length;this.stains.forEach((s,i)=>{this.dummy.position.set(s.p.x,.022+i*.0001,s.p.z);this.dummy.rotation.set(-Math.PI/2,0,s.rotation);this.dummy.scale.setScalar(s.size);this.dummy.updateMatrix();this.stainBatch.setMatrixAt(i,this.dummy.matrix);this.stainOpacity.setX(i,Math.min(1,s.life/4)*.95);this.stainVariant.setX(i,s.variant);});this.stainBatch.instanceMatrix.needsUpdate=true;this.stainOpacity.needsUpdate=true;this.stainVariant.needsUpdate=true;
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.life-=dt;if(r.life<=0){this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();this.rings.splice(i,1);continue;}const t=1-r.life/r.max;r.mesh.scale.setScalar(.15+r.radius*t);r.mesh.material.opacity=(1-t)*(r.smoke?.32:.8);if(r.sphere)r.mesh.position.y=.35+t*(r.smoke?1.4:.2);}
  }
  clear(){for(const f of this.fragments){this.scene.remove(f.mesh);f.mesh.material.dispose();}this.fragments.length=0;this.splashes.length=0;this.splashBatch.count=0;this.particles.length=0;this.bloodDrops.length=0;this.stains.length=0;this.batch.count=this.bloodBatch.count=this.stainBatch.count=0;for(const r of this.rings){this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();}this.rings.length=0;}
}
