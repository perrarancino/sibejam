import base64, io, json, math, shutil
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent
names={'spikes':'Floor Spike Trap','mine':'Simple Mine','cannon':'Circus Cannon','crossbow':'Crossbow Turret','packet':'Chips Bag','rope':'Rope Between Posts','log':'Spiked Log','flamethrower':'Four-way Flamethrower'}
for key,name in names.items():
    source=root/'assets/traps/source'/f'{name}.bbmodel'
    data=json.loads(source.read_text(encoding='utf-8-sig'))
    textures=[]; paths=[]
    for i,tex in enumerate(data['textures']):
        blob=base64.b64decode(tex['source'].split(',',1)[1]); p=root/'assets/traps/models'/f'{key}-{i}.png';p.write_bytes(blob)
        textures.append(Image.open(io.BytesIO(blob)).convert('RGBA'));paths.append(f'./assets/traps/models/{key}-{i}.png')
    verts=[[(v[i]+e['origin'][i])/16 for i in range(3)] for e in data['elements'] for v in e['vertices'].values()]
    min_y=min(v[1] for v in verts); offset=-min_y
    meshes=[]; polygons=[]
    for e in data['elements']:
        groups={}
        for f in e['faces'].values():
            tex=f.get('texture'); ids=f.get('vertices',[])
            if tex is None or len(ids)<3: continue
            if tex not in groups: groups[tex]={'position':[],'uv':[],'texture':tex,'origin':[0,0,0],'rotation':[0,0,0]}
            for k in range(1,len(ids)-1):
                tri=[ids[0],ids[k],ids[k+1]]; pts=[];uvs=[]
                for vid in tri:
                    v=e['vertices'][vid]; o=e['origin'];point=[(v[0]+o[0])/16,(v[1]+o[1])/16+offset,(v[2]+o[2])/16]
                    uv=f['uv'][vid];u=uv[0]/data['resolution']['width'];vv=uv[1]/data['resolution']['height']
                    groups[tex]['position'].extend(point);groups[tex]['uv'].extend([u,1-vv]);pts.append(point);uvs.append((u,vv))
                polygons.append((pts,uvs,tex))
        meshes.extend(groups.values())
    (root/'assets/traps/models'/f'{key}.json').write_text(json.dumps({'textures':paths,'meshes':meshes},separators=(',',':')),encoding='utf-8')
    # Static isometric previews, rendered once from the same model and embedded textures.
    def project(p): x,y,z=p;return ((x-z)*.707,(x+z)*.35-y*.9)
    allpts=[project(v) for v in verts];xs=[p[0] for p in allpts];ys=[p[1] for p in allpts]
    factor=190/max(max(xs)-min(xs),max(ys)-min(ys),.01);cx=(max(xs)+min(xs))/2;cy=(max(ys)+min(ys))/2
    def xy(p): a,b=project(p);return (128+(a-cx)*factor,128+(b-cy)*factor)
    image=Image.new('RGBA',(256,256),(0,0,0,0));draw=ImageDraw.Draw(image,'RGBA')
    for pts,uvs,tex in sorted(polygons,key=lambda t:sum(v[0]+v[2]+v[1]*.7 for v in t[0])/3):
        texture=textures[tex];u=sum(p[0] for p in uvs)/3;v=sum(p[1] for p in uvs)/3
        color=texture.getpixel((max(0,min(texture.width-1,int(u*texture.width))),max(0,min(texture.height-1,int(v*texture.height)))))
        if color[3]<32: continue
        a,b,c=pts;ux,uy,uz=[b[i]-a[i] for i in range(3)];vx,vy,vz=[c[i]-a[i] for i in range(3)]
        nx,ny,nz=uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx;n=max(math.sqrt(nx*nx+ny*ny+nz*nz),1e-9)
        shade=.62+.38*abs((nx*.3+ny*.85+nz*.4)/n)
        color=tuple(int(x*shade) for x in color[:3])+(color[3],)
        draw.polygon([xy(p) for p in pts],fill=color)
    image.save(root/'assets/traps/previews'/f'{key}.png')
    print(key,len(polygons),'triangles')
