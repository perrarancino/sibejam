"""Prepare normalized web audio: -20 LUFS voices, -23 dBFS active RMS transients."""
import concurrent.futures,json,math,re,subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[1];audio=root/'assets/audio';output=audio/'normalized';output.mkdir(exist_ok=True)
files=sorted(p for p in audio.rglob('*.mp3') if 'normalized' not in p.parts)
def run(args):return subprocess.run(['ffmpeg','-hide_banner','-nostdin','-threads','1',*args],capture_output=True,check=True)
def measure(path):
 result=run(['-i',str(path),'-af','loudnorm=I=-20:TP=-2:LRA=7:print_format=json','-f','null','-'])
 return json.loads(re.findall(r'\{[^{}]+\}',result.stderr.decode('utf8','replace'))[-1])
def decode(path):return np.frombuffer(run(['-i',str(path),'-ac','1','-ar','24000','-f','f32le','-']).stdout,dtype='<f4')
def active_rms(samples):
 samples=np.pad(samples,(480,480));windows=np.lib.stride_tricks.sliding_window_view(samples,480)[::120]
 rms=np.sqrt(np.mean(windows**2,axis=1));active=rms[rms>max(1e-6,rms.max()*.1)]
 return float(20*np.log10(max(1e-6,np.sqrt(np.mean(active**2)))))
def encode(source,destination,filters):
 run(['-y','-i',str(source),'-af',filters+',alimiter=limit=0.7943:level=false:attack=5:release=50','-ar','48000','-ac','1','-c:a','libvorbis','-q:a','5',str(destination)])
def process(path):
 relative=path.relative_to(audio);destination=output/relative.with_suffix('.ogg');destination.parent.mkdir(parents=True,exist_ok=True)
 measurement=measure(path);loudness=float(measurement['input_i']);samples=decode(path);duration=len(samples)/24000
 transient=duration<1.2 or not math.isfinite(loudness) or any(token in relative.as_posix() for token in ['mechanics/','player/hits/','player/condition/','player/run_','player/walk_','environment/creaks/'])
 if transient:filters=f'volume={np.clip(-23-active_rms(samples),-30,30)}dB'
 else:filters=f"loudnorm=I=-20:TP=-2:LRA=7:measured_I={measurement['input_i']}:measured_TP={measurement['input_tp']}:measured_LRA={measurement['input_lra']}:measured_thresh={measurement['input_thresh']}:offset={measurement['target_offset']}:linear=true"
 encode(path,destination,filters)
 for attempt in range(4):
  actual=measure(destination);verified_rms=active_rms(decode(destination));level=verified_rms if transient else float(actual['input_i']);target=-23 if transient else -20
  if not math.isfinite(level) or abs(level-target)<=.5 or attempt==3:break
  temp=destination.with_suffix('.calibrated.ogg');encode(destination,temp,f'volume={target-level}dB');temp.replace(destination)
 output_i=float(actual['input_i'])
 return 'assets/audio/'+relative.as_posix(),{'url':'assets/audio/normalized/'+relative.with_suffix('.ogg').as_posix(),'inputLUFS':loudness if math.isfinite(loudness) else None,'outputLUFS':output_i if math.isfinite(output_i) else None,'activeRMS':round(verified_rms,2),'duration':round(duration,3),'targetLUFS':-20,'truePeakLimitDB':-2,'verifiedTruePeakDB':float(actual['input_tp']),'peakLimited':abs(level-target)>.8 and float(actual['input_tp'])>-3,'method':'active-RMS' if transient else 'LUFS'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=dict(pool.map(process,files))
(audio/'normalization.json').write_text(json.dumps({'targetLUFS':-20,'sounds':results},ensure_ascii=False,indent=2),encoding='utf8')
print('NORMALIZED',len(results),'SOUNDS',flush=True)
