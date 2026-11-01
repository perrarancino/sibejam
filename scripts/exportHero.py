"""Blender: --background --python scripts/exportHero.py -- --source-dir DIR.
DIR contains Agata.fbx, locomotion FBXs and textures/ from textures.7z.
Bakes evaluated source bone matrices into the heroine's different rest skeleton.
"""
import argparse
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
parser=argparse.ArgumentParser()
parser.add_argument('--source-dir',type=Path,required=True)
parser.add_argument('--repair-normals',action='store_true',help='Repair legacy models; preserve supplied normals by default')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=Path(__file__).resolve().parents[1]
source_dir=args.source_dir.resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
model_file=source_dir/'Agata.fbx'
if not model_file.exists():model_file=source_dir/'test2.fbx'
bpy.ops.import_scene.fbx(filepath=str(model_file))
target=next(o for o in bpy.data.objects if o.type=='ARMATURE')
# The corrected model's authored normals are preserved.
if args.repair_normals:
    # Recalculate winding per connected surface, then discard imported custom normals.
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        mesh=obj.data
        bm=bmesh.new();bm.from_mesh(mesh)
        before=[face.normal.copy() for face in bm.faces]
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.normal_update()
        # Open garments have no unambiguous signed volume about the scene origin.
        # Orient each connected shell about its own centre instead.
        pending=set(bm.faces)
        while pending:
            stack=[pending.pop()];faces=[]
            while stack:
                face=stack.pop();faces.append(face)
                for edge in face.edges:
                    for neighbor in edge.link_faces:
                        if neighbor in pending:
                            pending.remove(neighbor);stack.append(neighbor)
            vertices={v for face in faces for v in face.verts}
            center=sum((v.co for v in vertices),Vector())/len(vertices)
            orientation=sum(face.calc_area()*face.normal.dot(face.calc_center_median()-center) for face in faces)
            if orientation < -1e-5:
                bmesh.ops.reverse_faces(bm,faces=faces)
        bm.normal_update()
        changed=sum(a.dot(face.normal)<0 for a,face in zip(before,bm.faces))
        bm.to_mesh(mesh);bm.free()
        mesh.normals_split_custom_set([(0,0,0)]*len(mesh.loops))
        mesh.update()
        print('NORMALS',obj.name,'reoriented faces',changed,flush=True)
for image in bpy.data.images:
    name=Path(image.filepath.replace('\\','/')).name.replace('Black_Cloth_AlbedoSkirt1.png','Black_Cloth_AlbedoSkirt.png')
    texture=source_dir/'textures'/name
    if texture.exists():
        image.filepath=str(texture)
        image.reload()
clips=['idle','walking','running','left strafe','right strafe','left strafe walk','right strafe walk','left turn','right turn','jump']
clips += [name for name in ['left turn (2)','right turn (2)'] if (source_dir/(name+'.fbx')).exists()]
for name in clips:
    before=set(bpy.data.objects)
    clip_file=source_dir/(name+'.fbx')
    if name=='walking' and model_file.name=='test2.fbx' and (source_dir/'Female Walk.fbx').exists():clip_file=source_dir/'Female Walk.fbx'
    bpy.ops.import_scene.fbx(filepath=str(clip_file))
    imported=set(bpy.data.objects)-before
    source=next(o for o in imported if o.type=='ARMATURE')
    frame_range=source.animation_data.action.frame_range[:]
    action=bpy.data.actions.new(name)
    target.animation_data_create().action=action
    for frame in range(int(frame_range[0]),int(frame_range[1])+1):
        bpy.context.scene.frame_set(frame)
        matrices={b.name:b.matrix.copy() for b in source.pose.bones}
        for bone in target.pose.bones:
            if bone.name not in matrices:
                continue
            bone.rotation_mode='QUATERNION'
            parent={}
            if bone.parent:
                parent={'parent_matrix':matrices[bone.parent.name],'parent_matrix_local':bone.parent.bone.matrix_local}
            basis=bone.bone.convert_local_to_pose(matrices[bone.name],bone.bone.matrix_local,invert=True,**parent)
            bone.location,bone.rotation_quaternion,bone.scale=basis.decompose()
            for channel in ['location','rotation_quaternion','scale']:
                bone.keyframe_insert(channel,frame=frame,group=bone.name)
    target.animation_data.action=None
    track=target.animation_data.nla_tracks.new()
    track.name=name
    track.strips.new(name,1,action)
    for obj in imported:
        bpy.data.objects.remove(obj,do_unlink=True)
target['source_model']=model_file.name
bpy.ops.export_scene.gltf(export_extras=True,filepath=str(root/'assets/characters/hero.glb'),export_format='GLB',export_animation_mode='NLA_TRACKS')

# FBX alpha links represent brush coverage on solid surfaces.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from heroMaterials import fix_hero_materials
fix_hero_materials(root/"assets/characters/hero.glb")
