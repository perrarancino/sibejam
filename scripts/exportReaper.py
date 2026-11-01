"""Bake the supplied procedural Reaper materials into portable glTF textures."""
import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'assets/characters/textures';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath='E:/Загрузки/pumpkin_reaper_watercolor.blend')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.device='CPU'
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=8
rig=bpy.data.objects['Reaper Rig'];rig.hide_set(False);rig.data.pose_position='REST'
objects=[o for o in rig.children_recursive if o.type=='MESH'];results=[]
for index,obj in enumerate(objects):
 bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15192,island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 images=[]
 for kind,bake_type in [('albedo','DIFFUSE'),('normal','NORMAL')]:
  image=bpy.data.images.new(f'reaper-{index}-{kind}',width=1024,height=1024,alpha=False)
  image.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
  for material in obj.data.materials:
   node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;material.node_tree.nodes.active=node
  bpy.ops.object.bake(type=bake_type)
  image.filepath_raw=str(out/f'reaper-{index}-{kind}.png');image.file_format='PNG';image.save();images.append(image)
 glow=[]
 for material in obj.data.materials:
  group=next((n for n in material.node_tree.nodes if n.type=='GROUP'),None)
  glow.append(float(group.inputs['Glow'].default_value) if group and 'Glow' in group.inputs else 0)
 results.append((obj,images,glow));print('BAKED',obj.name,flush=True)
for obj,images,glows in results:
 old=list(obj.data.materials)
 for slot,original in enumerate(old):
  material=bpy.data.materials.new(original.name+' | baked '+obj.name);material.use_nodes=True
  tree=material.node_tree;shader=tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.9
  texture=tree.nodes.new('ShaderNodeTexImage');texture.image=images[0];tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
  normal_image=tree.nodes.new('ShaderNodeTexImage');normal_image.image=images[1];normal=tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45;tree.links.new(normal_image.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
  if glows[slot]>.1:
   tree.links.new(texture.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=glows[slot]
  obj.data.materials[slot]=material
rig.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(root/'assets/characters/reaper.glb'),export_format='GLB',use_selection=True,export_animation_mode='ACTIVE_ACTIONS')
print('REAPER EXPORT COMPLETE',flush=True)
