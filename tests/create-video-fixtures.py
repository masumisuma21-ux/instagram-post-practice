"""Create small, synthetic H.264/AAC fixtures locally (requires free native FFmpeg)."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent.parent / 'work' / 'video-fixtures'
root.mkdir(parents=True, exist_ok=True)
for duration, size, tone in [(16, '180x320', 440), (36, '320x180', 660)]:
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=15', '-f', 'lavfi', '-i', f'sine=frequency={tone}:sample_rate=44100', '-t', str(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', str(root / f'product-{duration}.mp4')], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(root / 'product-16.mp4'), '-c', 'copy', '-f', 'mov', str(root / 'playable.mov')], check=True)
print('Created 16s / 36s synthetic videos and a real MOV container; nothing uploaded.')
