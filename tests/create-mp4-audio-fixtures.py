"""Add independent L/R 48kHz stereo AAC to the existing 36s synthetic source. Local only."""
from pathlib import Path
import subprocess
p=Path(__file__).resolve().parent.parent/'work'/'mp4-fixtures'
audio=r'aevalsrc=sin(2*PI*660*t)*if(lt(mod(t\,1)\,0.1)\,0.6\,0.02)|sin(2*PI*880*t)*if(lt(mod(t\,1)\,0.1)\,0.3\,0.01):s=48000'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(p/'product-36.mp4'),'-f','lavfi','-i',audio,'-map','0:v','-map','1:a','-t','36','-c:v','copy','-c:a','aac','-b:a','192k',str(p/'stereo-36.mp4')],check=True)
print('Created 48kHz independent stereo fixture')
