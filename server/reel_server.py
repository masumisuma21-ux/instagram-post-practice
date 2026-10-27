#!/usr/bin/env python3
"""Local, same-origin reel renderer. Standard-library Python + system FFmpeg only.
No paid APIs, no AI providers, no credentials. Bind is loopback by default.
"""
import argparse
import base64
import binascii
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {'index.html', 'app.js', 'style.css', 'reels.js', 'reels.css', 'sans.woff', 'serif.woff', 'FONT-LICENSE.txt', '.nojekyll'}
MIMES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8'}
RENDER_LOCK = threading.Lock()

class Invalid(ValueError):
    pass

def number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise Invalid('秒数・音量の指定が範囲外です。')
    return float(value)

def unpack(data, destination, kind, max_bytes):
    if not isinstance(data, str) or len(data) > max_bytes * 1.4 + 100:
        raise Invalid('素材ファイルが大きすぎます。')
    match = re.fullmatch(r'data:([^;,]+);base64,([A-Za-z0-9+/=]+)', data)
    if not match:
        raise Invalid('素材の形式が違います。')
    mime, encoded = match.groups()
    allowed = {'image/jpeg', 'image/png'} if kind == 'image' else {'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac'}
    if mime not in allowed:
        raise Invalid('対応していない素材形式です。')
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise Invalid('素材を読み込めません。') from exc
    if not raw or len(raw) > max_bytes:
        raise Invalid('素材のサイズを確認してください。')
    if kind == 'image' and not (raw.startswith(b'\xff\xd8\xff') or raw.startswith(b'\x89PNG\r\n\x1a\n')):
        raise Invalid('画像データが壊れています。')
    destination.write_bytes(raw)
    if kind == 'image':
        result = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', str(destination)], capture_output=True, timeout=10)
        try:
            stream = json.loads(result.stdout)['streams'][0]
            if (stream['width'], stream['height']) != (1080, 1920):
                raise Invalid('画像は1080×1920pxで送信してください。')
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise Invalid('画像を解析できませんでした。') from exc

    else:
        result = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,ogg,matroska,webm,aac,flac', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'json', str(destination)], capture_output=True, timeout=10)
        try:
            if json.loads(result.stdout).get('streams', [{}])[0].get('codec_type') != 'audio':
                raise Invalid('音声ファイルを解析できませんでした。')
        except (IndexError, json.JSONDecodeError) as exc:
            raise Invalid('音声ファイルを解析できませんでした。') from exc

def ffmpeg(args):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', *args], capture_output=True, timeout=600)
    if result.returncode:
        # Never echo untrusted media metadata or host internals to the browser.
        raise Invalid('動画または音声を変換できませんでした。素材の形式を確認してください。')

def render(payload, directory):
    scenes = payload.get('scenes')
    if not isinstance(scenes, list) or len(scenes) != 5:
        raise Invalid('5シーンの素材が必要です。')
    style = payload.get('style') or {}
    animation = style.get('animation', 'none')
    if animation not in ('none', 'fade', 'zoom'):
        raise Invalid('アニメーションの指定が違います。')
    color = style.get('bg', '#f8f5ec')
    if not isinstance(color, str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', color):
        raise Invalid('背景色の指定が違います。')
    durations = [number(s.get('seconds'), .5, 3 if i == 0 else 60) for i, s in enumerate(scenes)]
    if any(abs(v * 30 - round(v * 30)) > .0001 for v in durations):
        raise Invalid('秒数は30fpsのフレーム単位で指定してください。')
    total = sum(durations)
    clips = []
    for i, (scene, seconds) in enumerate(zip(scenes, durations)):
        background, caption, clip = directory / f'bg{i}.jpg', directory / f'caption{i}.png', directory / f'clip{i}.mp4'
        unpack(scene.get('background'), background, 'image', 12 * 1024 ** 2)
        unpack(scene.get('caption'), caption, 'image', 12 * 1024 ** 2)
        frames = round(seconds * 30)
        background_filter = 'setsar=1'
        if animation == 'zoom':
            background_filter = f"zoompan=z='1+0.07*on/{max(1, frames - 1)}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,setsar=1"
        filters = f'[0:v]{background_filter}[background];[background][1:v]overlay=0:0:shortest=1,format=yuv420p'
        if animation == 'fade':
            fade = min(.3, seconds / 2)
            filters += f',fade=t=in:st=0:d={fade}:color={color},fade=t=out:st={seconds - fade}:d={fade}:color={color}'
        filters += '[v]'
        ffmpeg(['-loop', '1', '-framerate', '30', '-i', str(background), '-loop', '1', '-framerate', '30', '-i', str(caption), '-filter_complex_threads', '1', '-filter_complex', filters, '-map', '[v]', '-frames:v', str(frames), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-an', str(clip)])
        clips.append(clip)
    listing = directory / 'clips.txt'
    listing.write_text('\n'.join(f"file '{clip.name}'" for clip in clips), encoding='utf-8')
    inputs = ['-f', 'concat', '-safe', '0', '-i', str(listing)]
    audio_filters, audio_labels = [], []
    tracks = []
    if payload.get('narration'):
        tracks.append(('narration', payload['narration'], 1, False))
    if payload.get('bgm') and payload.get('bgmConsent') is True:
        tracks.append(('bgm', payload['bgm'], number(payload.get('volume', .2), 0, .7), True))
    for index, (name, track, volume, loop) in enumerate(tracks, 1):
        if not isinstance(track, dict):
            raise Invalid('音声データを確認してください。')
        path = directory / f'{name}.audio'
        unpack(track.get('data'), path, 'audio', 20 * 1024 ** 2)
        if loop:
            inputs += ['-stream_loop', '-1']
        inputs += ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,ogg,matroska,webm,aac,flac', '-i', str(path)]
        label = f'a{index}'
        audio_filters.append(f'[{index}:a]aresample=48000,aformat=channel_layouts=stereo,volume={volume},apad=whole_dur={total},atrim=duration={total}[{label}]')
        audio_labels.append(f'[{label}]')
    if not tracks:
        inputs += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        audio_map = '1:a'
    else:
        audio_filters.append(''.join(audio_labels) + f'amix=inputs={len(tracks)}:normalize=0:duration=longest,alimiter=limit=0.95[audio]')
        inputs += ['-filter_complex', ';'.join(audio_filters)]
        audio_map = '[audio]'
    output = directory / 'reel.mp4'
    ffmpeg([*inputs, '-map', '0:v:0', '-map', audio_map, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', str(total), '-movflags', '+faststart', str(output)])
    return output

class Handler(BaseHTTPRequestHandler):
    server_version = 'TsumuguLocal/1.0'
    def reply(self, status, data, mime='application/json; charset=utf-8'):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)
    def allowed_host(self):
        port = self.server.server_port
        return self.headers.get('Host') in {f'127.0.0.1:{port}', f'localhost:{port}'}
    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'ローカルのURLから開いてください。'})
        path = urlsplit(self.path).path
        if path == '/api/reels/capabilities':
            ready = bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))
            return self.reply(200, {'protocol': 'tsumugu-reels-v1', 'mp4': ready, 'aiImages': False, 'aiNarration': False})
        name = 'index.html' if path == '/' else path.lstrip('/')
        if name not in PUBLIC_FILES or not (ROOT / name).is_file():
            return self.reply(404, {'error': 'ページがありません。'})
        return self.reply(200, (ROOT / name).read_bytes(), MIMES.get(Path(name).suffix, 'application/octet-stream'))
    def do_POST(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'ローカルのURLから開いてください。'})
        self.connection.settimeout(60)
        if self.path != '/api/reels/render':
            return self.reply(404, {'error': 'ページがありません。'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.reply(403, {'error': '別のサイトからのリクエストは受け付けません。'})
        if self.headers.get('Content-Type') != 'application/json':
            return self.reply(415, {'error': 'JSONで送信してください。'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.reply(400, {'error': '送信サイズが不正です。'})
        if not 0 < length <= 100 * 1024 ** 2:
            return self.reply(413, {'error': '送信できる素材は合計100MBまでです。'})
        if not RENDER_LOCK.acquire(blocking=False):
            return self.reply(429, {'error': '別の動画を生成中です。完了後に再試行してください。'})
        try:
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise Invalid('リクエストの形式が違います。')
            with tempfile.TemporaryDirectory(prefix='tsumugu-reel-') as temporary:
                output = render(payload, Path(temporary))
                self.reply(200, output.read_bytes(), 'video/mp4')
        except (Invalid, json.JSONDecodeError, TypeError, AttributeError) as exc:
            self.reply(400, {'error': str(exc) if isinstance(exc, Invalid) else 'リクエストの形式を確認してください。'})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': '生成に時間がかかりすぎました。秒数や素材を減らして再試行してください。'})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.reply(500, {'error': '動画を生成できませんでした。FFmpegの導入とサーバーの状態を確認してください。'})
        finally:
            RENDER_LOCK.release()
    def log_message(self, message, *args):
        # Do not log request bodies, audio, prompts or other user content.
        if args:
            print(f'{self.command}: {args[1] if len(args) > 1 else ""}', flush=True)

def main():
    parser = argparse.ArgumentParser(description='つむぐ: 無料のローカルMP4生成サーバー')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    print(f'つむぐを開く: http://127.0.0.1:{args.port}', flush=True)
    print('ローカル専用。外部AI・有料APIは接続していません。終了はCtrl+C。', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()

if __name__ == '__main__':
    main()
