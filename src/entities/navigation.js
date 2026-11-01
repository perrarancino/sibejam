// Clearance-weighted flow field shared by the wave. Diagonal edges and a
// centre-seeking traversal cost keep enemies away from the corridor walls.
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
class MinHeap {
 constructor(){this.items=[];}
 push(index,cost){const node={index,cost};let i=this.items.length;this.items.push(node);while(i>0){const p=(i-1)>>1;if(this.items[p].cost<=cost)break;this.items[i]=this.items[p];i=p;}this.items[i]=node;}
 pop(){const top=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].cost<this.items[c].cost)c++;if(this.items[c].cost>=last.cost)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return top;}
 get length(){return this.items.length;}
}
export class Navigation {
 constructor(decorations,limit,origin,destination,cellSize=.4){
  this.decorations=decorations;this.limit=limit;this.step=cellSize;
  this.width=Math.floor(limit*2/cellSize)+1;this.count=this.width*this.width;
  this.blocked=new Uint8Array(this.count);this.next=new Int32Array(this.count).fill(-1);this.edges=new Uint8Array(this.count);
  for(let i=0;i<this.count;i++){const p=this.point(i);this.blocked[i]=decorations.isBlocked(p.x,p.z,.34)?1:0;}
  for(let i=0;i<this.count;i++){
   if(this.blocked[i])continue;const a=this.point(i),ix=i%this.width,iz=Math.floor(i/this.width);
   for(let d=0;d<8;d++){const [dx,dz]=DIRECTIONS[d],nx=ix+dx,nz=iz+dz;if(nx<0||nz<0||nx>=this.width||nz>=this.width)continue;const n=nz*this.width+nx;if(this.blocked[n])continue;
    const b=this.point(n);if(this.clearSegment(a,b,.34))this.edges[i]|=1<<d;
   }
  }
  this.buildClearance();this.start=this.nearestFree(origin);
  if(this.start<0){this.goal=-1;return;}
  this.goal=this.nearestFree(destination,this.flood(this.start));if(this.goal>=0)this.buildField(this.goal,this.next);
 }
 point(index){return {x:-this.limit+(index%this.width)*this.step,z:-this.limit+Math.floor(index/this.width)*this.step};}
 index(x,z){const ix=Math.round((x+this.limit)/this.step),iz=Math.round((z+this.limit)/this.step);return ix<0||iz<0||ix>=this.width||iz>=this.width?-1:iz*this.width+ix;}
 neighbor(i,d){const [dx,dz]=DIRECTIONS[d],x=i%this.width+dx,z=Math.floor(i/this.width)+dz;return x<0||z<0||x>=this.width||z>=this.width?-1:z*this.width+x;}
 clearSegment(a,b,radius=.34){const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(2,Math.ceil(distance/.1));for(let k=1;k<=steps;k++){const t=k/steps;if(this.decorations.isBlocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius))return false;}return true;}
 nearestFree(p,reachable=null){let best=-1,d=Infinity;for(let i=0;i<this.count;i++){if(this.blocked[i]||(reachable&&!reachable[i]))continue;const q=this.point(i),n=(q.x-p.x)**2+(q.z-p.z)**2;if(n<d){d=n;best=i;}}return best;}
 flood(start){const seen=new Uint8Array(this.count),queue=new Int32Array(this.count);let head=0,tail=0;queue[tail++]=start;seen[start]=1;while(head<tail){const i=queue[head++];for(let d=0;d<8;d++)if(this.edges[i]&(1<<d)){const n=this.neighbor(i,d);if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}}}return seen;}
 buildClearance(){
  this.clearance=new Float32Array(this.count).fill(Infinity);const heap=new MinHeap();
  for(let i=0;i<this.count;i++){const x=i%this.width,z=Math.floor(i/this.width);if(this.blocked[i]||x===0||z===0||x===this.width-1||z===this.width-1){this.clearance[i]=0;heap.push(i,0);}}
  while(heap.length){const {index:i,cost}=heap.pop();if(cost>this.clearance[i]+1e-5)continue;for(let d=0;d<8;d++){const n=this.neighbor(i,d);if(n<0)continue;const value=cost+this.step*(d<4?1:Math.SQRT2);if(value<this.clearance[n]-1e-5){this.clearance[n]=value;heap.push(n,value);}}}
 }
 buildField(goal,next){
  const distance=new Float64Array(this.count).fill(Infinity),heap=new MinHeap();distance[goal]=0;heap.push(goal,0);
  const price=i=>1+5/(.35+this.clearance[i])**2;
  while(heap.length){const {index:i,cost}=heap.pop();if(cost>distance[i]+1e-8)continue;
   for(let d=0;d<8;d++){if(!(this.edges[i]&(1<<d)))continue;const n=this.neighbor(i,d),value=cost+this.step*(d<4?1:Math.SQRT2)*(price(i)+price(n))*.5;
    if(value<distance[n]-1e-8){distance[n]=value;next[n]=i;heap.push(n,value);}
   }
  }
 }
 routeTo(destination){const route=Object.create(this);route.next=new Int32Array(this.count).fill(-1);route.goal=this.nearestFree(destination);if(route.goal>=0)route.buildField(route.goal,route.next);return route;}
 waypoint(position){
  const i=this.index(position.x,position.z);if(i<0)return null;
  if(this.blocked[i]){const free=this.nearestFree(position);if(free<0)return null;const point=this.point(free);return Math.hypot(point.x-position.x,point.z-position.z)<.7?point:null;}
  let n=this.next[i];if(n<0)return null;let best=this.point(n);
  // Straighten stair steps without cutting across the safe corridor centreline.
  for(let k=0;k<4;k++){const candidate=this.next[n];if(candidate<0)break;const point=this.point(candidate);if(Math.hypot(point.x-position.x,point.z-position.z)>1.6||!this.clearSegment(position,point,.42))break;best=point;n=candidate;}
  return best;
 }
}

// Distance from a nozzle to the first enabled collider along a horizontal ray.
export function rayDistance(colliders,x,z,dx,dz,maxDistance,padding=0){
  let nearest=maxDistance;
  for(const c of colliders){
    if(c.disabled)continue;
    let hit=Infinity;
    if(c.type==='circle'){
      const ox=x-c.x,oz=z-c.z,b=ox*dx+oz*dz,disc=b*b-(ox*ox+oz*oz-(c.r+padding)*(c.r+padding));
      if(disc>=0){const t=-b-Math.sqrt(disc),exit=-b+Math.sqrt(disc);if(exit>=0)hit=Math.max(0,t);}
    }else{
      let enter=-Infinity,exit=Infinity;
      for(const [origin,dir,min,max] of [[x,dx,c.x-c.halfX-padding,c.x+c.halfX+padding],[z,dz,c.z-c.halfZ-padding,c.z+c.halfZ+padding]]){
        if(Math.abs(dir)<1e-8){if(origin<min||origin>max){exit=-Infinity;break;}}
        else{let a=(min-origin)/dir,b=(max-origin)/dir;if(a>b)[a,b]=[b,a];enter=Math.max(enter,a);exit=Math.min(exit,b);}
      }
      if(exit>=Math.max(0,enter))hit=Math.max(0,enter);
    }
    nearest=Math.min(nearest,hit);
  }
  return nearest;
}
