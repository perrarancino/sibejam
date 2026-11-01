"""Normalize painted character materials after Blender's FBX → glTF conversion."""
import json
import struct
from pathlib import Path

def fix_hero_materials(path):
    path=Path(path)
    data=path.read_bytes()
    magic,version,_=struct.unpack_from('<III',data)
    assert magic==0x46546C67 and version==2
    chunks=[];offset=12
    while offset<len(data):
        length,kind=struct.unpack_from('<II',data,offset)
        chunks.append((kind,data[offset+8:offset+8+length]));offset+=8+length
    document=json.loads(chunks[0][1])
    for material in document.get('materials',[]):
        texture=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
        image=''
        if texture:
            image=document['images'][document['textures'][texture['index']]['source']].get('name','').lower()
        # Painted alpha is brush coverage, not physical transparency. Only eyes
        # and the belt decal need holes; cutouts write depth without sorting.
        cutout=image in ('eyes','cloth_white_albedobelts')
        material['alphaMode']='MASK' if cutout else 'OPAQUE'
        if cutout:material['alphaCutoff']=.3
        else:material.pop('alphaCutoff',None)
        color=material.get('pbrMetallicRoughness',{}).get('baseColorFactor')
        if color:color[3]=1
    payload=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode('utf8')
    payload+=b' '*((-len(payload))%4)
    chunks[0]=(chunks[0][0],payload)
    body=b''.join(struct.pack('<II',len(payload),kind)+payload for kind,payload in chunks)
    path.write_bytes(struct.pack('<III',magic,version,len(body)+12)+body)

if __name__=='__main__':
    import sys
    fix_hero_materials(sys.argv[1])
