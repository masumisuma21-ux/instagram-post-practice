"""Local synthetic 16/36s AAC/H.264 fixtures. White flashes + 440/660Hz pulses mark integer source seconds."""
from pathlib import Path
import subprocess
p=Path(__file__).resolve().parent.parent/'work'/'mp4-fixtures';p.mkdir(parents=True,exist_ok=True)
for duration,size,tone in [(16,'180x320',440),(36,'320x180',660)]:
 subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',f'testsrc2=size={size}:rate=30','-f','lavfi','-i',fr'aevalsrc=sin(2*PI*{tone}*t)*if(lt(mod(t\,1)\,0.1)\,0.7\,0.02):s=44100','-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t,1),0.1)'",'-t',str(duration),'-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off','-c:a','aac','-b:a','96k','-movflags','+faststart',str(p/f'product-{duration}.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(p/'product-36.mp4'),'-c:v','copy','-an',str(p/'no-audio.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-v','error','-i',str(p/'product-36.mp4'),'-c:v','copy','-c:a','aac','-ar','48000','-ac','2',str(p/'different-audio.mp4')],check=True)
print('Created local flash/pulse 16/36 second synthetic sources')
