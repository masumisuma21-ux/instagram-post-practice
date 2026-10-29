"""Independent ffprobe/FFmpeg: PCM boundary/level/silence/stereo and encoded video checks."""
from pathlib import Path
import json,subprocess,numpy as np
from PIL import Image
root=Path(__file__).resolve().parent.parent
out=root/'work'/'mp4-audio-results'
def ff(*args):return subprocess.check_output(['ffmpeg','-v','error',*map(str,args)])
def probe(file):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(file)]))
results=[]
for seconds in [16,36]:
 file=out/f'{seconds}.mp4';info=probe(file);v=next(s for s in info['streams'] if s['codec_type']=='video');a=next(s for s in info['streams'] if s['codec_type']=='audio')
 assert v['codec_name']=='h264' and (v['width'],v['height'])==(1080,1920) and v['avg_frame_rate']=='30/1' and int(v['nb_frames'])==seconds*30
 assert a['codec_name']=='aac' and a['channels']==2 and a['sample_rate']=='48000'
 assert abs(float(info['format']['duration'])-seconds)<=1024/48000+.001
 fixture=json.loads((out/f'{seconds}-fixture.json').read_text());assets={a['id']:a for a in fixture['assets']};pcm=np.frombuffer(ff('-i',file,'-map','0:a:0','-acodec','pcm_f32le','-f','f32le','pipe:1'),dtype='<f4').reshape(-1,2);reference=[];parts=[];offset=0
 for cut in fixture['project']['cuts']:
  asset=assets[cut['assetId']];n=round((cut['end']-cut['start'])*48000)
  if cut['assetId']=='asset-silent':ref=np.zeros((n,2),dtype=np.float32)
  else:
   channels=1 if cut['assetId']=='asset-mono' else 2
   raw=ff('-i',root/'work'/'mp4-fixtures'/asset['name'],'-map','0:a:0','-af',f"atrim=start={cut['start']}:end={cut['end']},asetpts=PTS-STARTPTS,aresample=48000",'-f','f32le','pipe:1')
   ref=np.frombuffer(raw,dtype='<f4').reshape(-1,channels)
   if channels==1:ref=np.repeat(ref,2,axis=1)
   if len(ref)<n:ref=np.pad(ref,((0,n-len(ref)),(0,0)))
   ref=ref[:n]
  actual=pcm[offset:offset+n];margin=4800;interior=slice(margin,n-margin);rms=np.sqrt(np.mean(actual[interior]**2,axis=0));ref_rms=np.sqrt(np.mean(ref[interior]**2,axis=0));silent=cut['assetId']=='asset-silent'
  if silent:assert max(rms)<1e-6,(seconds,cut['id'],rms)
  else:
   delta=20*np.log10(rms/ref_rms);assert max(abs(delta))<.35,(seconds,cut['id'],delta)
  parts.append({'cut':cut['id'],'startSample':offset,'endSample':offset+n,'silent':silent,'rms':rms.tolist(),'referenceRms':ref_rms.tolist(),'gainDifferenceDb':None if silent else delta.tolist()});offset+=n;reference.append(ref)
 ref=np.concatenate(reference)
 # Compare pulse envelope (1ms bins); avoids ambiguous sine-wave phase correlations.
 block=48;length=min(len(ref),len(pcm))//block*block
 env=lambda x:np.sqrt(np.mean(x[:length,0].reshape(-1,block)**2,axis=1))
 re,ae=env(ref),env(pcm);ro=np.flatnonzero((re>.15)&~np.r_[False,re[:-1]>.15]);ao=np.flatnonzero((ae>.15)&~np.r_[False,ae[:-1]>.15]);lags=[]
 for t in ro:
  if t<30 or t>length/block-30:continue
  near=int(ao[np.argmin(abs(ao-t))]);lags.append(near-int(t))
 assert lags and max(abs(x) for x in lags)<=3,(seconds,lags)
 # Video white flashes are independently compared to audio pulses, with 1/30s video sampling tolerance.
 pixels=np.frombuffer(ff('-i',file,'-vf','scale=64:114','-f','rawvideo','-pix_fmt','rgb24','pipe:1'),dtype=np.uint8).reshape(-1,114,64,3)
 white=pixels[:,50:60,28:36,:].mean(axis=(1,2,3))>220;flashes=np.flatnonzero(white&~np.r_[False,white[:-1]])/30;av=[]
 for t in flashes:
  # Skip intentional silent segments and transitions.
  if any(p['silent'] and p['startSample']/48000-.15<=t<=p['endSample']/48000+.15 for p in parts):continue
  if t<.15 or t>seconds-.15:continue
  near=float(ao[np.argmin(abs(ao/1000-t))])/1000;av.append((near-t)*1000)
 assert av and max(abs(x) for x in av)<40,(seconds,av)
 images=[]
 for image in sorted(out.glob(f'{seconds}-expected-*.png')):
  t=float(image.stem.split('-expected-')[1]);frame=round(t*30);data=ff('-i',file,'-vf',f'select=eq(n\\,{frame})','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1');actual=np.frombuffer(data,dtype=np.uint8).reshape(1920,1080,3).astype(float);expected=np.asarray(Image.open(image).convert('RGB')).astype(float);error=float(np.sqrt(np.mean((actual-expected)**2)));psnr=100 if error==0 else float(20*np.log10(255/error));assert psnr>27,(seconds,t,psnr);images.append({'time':t,'psnr':psnr})
 result={'seconds':seconds,'formatDuration':float(info['format']['duration']),'videoDuration':float(v['duration']),'audioDuration':float(a['duration']),'parts':parts,'maximumPulseEnvelopeLagMs':max(abs(x) for x in lags),'maximumAvFlashOffsetMs':max(abs(x) for x in av),'imageChecks':images};results.append(result);print('PASS',seconds,'PCM pulse lag ms',result['maximumPulseEnvelopeLagMs'],'AV flash ms',round(result['maximumAvFlashOffsetMs'],2),'gain dB',[x['gainDifferenceDb'] for x in parts])
(out/'analysis.json').write_text(json.dumps(results,indent=2))
