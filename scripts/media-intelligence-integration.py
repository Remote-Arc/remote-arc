"""Real pinned yt-dlp + HTTP extractor + FFmpeg, using only owned test fixtures.

Run with Python 3.11+: --engine <verified yt-dlp.pyz> --workspace <scratch>.
No production flag disables the public-source gate: only this in-process test
substitutes URL validation to permit its loopback fixture server.
"""
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
from unittest.mock import patch

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser()
parser.add_argument('--engine', required=True)
parser.add_argument('--workspace', required=True)
args = parser.parse_args()
engine = Path(args.engine).resolve(strict=True)
assert hashlib.sha256(engine.read_bytes()).hexdigest() == 'e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3'
root = Path(args.workspace).resolve()
root.mkdir(parents=True, exist_ok=False)
fixture = root / 'fixture'
fixture.mkdir()
ffmpeg, ffprobe, node = (shutil.which(exe) for exe in ('ffmpeg', 'ffprobe', 'node'))
assert all((ffmpeg, ffprobe, node)), 'FFmpeg, ffprobe and Node are required'
subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'smptebars=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', str(fixture / 'clip.mp4')], check=True, capture_output=True)
(fixture / 'captions.vtt').write_text('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nThis is an owned test fixture.\n\n00:00:01.000 --> 00:00:02.000\nLocal export is available.\n', encoding='utf-8')
(fixture / 'index.html').write_text('<!doctype html><html><head><title>Owned media fixture</title><meta property="og:video:duration" content="3"></head><body><video controls src="clip.mp4"><track kind="subtitles" src="captions.vtt" srclang="en" label="English"></video></body></html>', encoding='utf-8')

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(fixture)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
spec = importlib.util.spec_from_file_location('media_evidence', Path(__file__).resolve().parents[1] / 'skills/media-runtime/media-intelligence.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
url = f'http://127.0.0.1:{server.server_port}/index.html'
def request(action, **fields):
    return {'workspace': str(root), 'action': action, 'output': action, 'engine': str(engine), 'node': node, 'ffmpeg': ffmpeg, 'ffprobe': ffprobe, **fields}

try:
    with patch.object(m, 'public_url', side_effect=lambda value, resolve=True: value):
        transcript = m.execute(request('transcript', url=url, languages=['en']))
        assert transcript['status'] == 'transcript_ready', transcript
        assert transcript['videoDownloaded'] is False
        found = m.execute(request('find', evidence='transcript', query='export', limit=10))
        assert found['matches'][0]['start'] == 1
        video = m.execute(request('download', output='video', url=url, kind='video', start=0.5, end=2.5, maxSeconds=2, maxBytes=8*1024**2, height=720))
        frames = m.execute(request('frames', evidence='video', times=[0.75, 1.5]))
        assert len(frames['frames']) == 2
        audio = m.execute(request('download', output='audio', url=url, kind='audio', start=0.5, end=2.5, maxSeconds=2, maxBytes=8*1024**2, height=720))
        streams = m.probe(request('inspect'), Path(audio['media']))['streams']
        assert any(stream['codec_type'] == 'audio' for stream in streams)
        assert not any(stream['codec_type'] == 'video' for stream in streams)
        source_id = json.loads(Path(transcript['source']).read_text(encoding='utf-8'))['sourceId']
        claims = {'title': 'Owned fixture integration check', 'sources': ['transcript', 'frames'], 'findings': [
            {'kind': 'speech', 'text': 'The fixture captions mention local export.', 'evidence': [{'sourceId': source_id, 'second': 1, 'quote': 'Local export is available.'}]},
            {'kind': 'visual', 'text': 'The owned fixture contains color bars.', 'evidence': [{'sourceId': source_id, 'second': 0.75, 'frame': 'frame-01.jpg'}]}
        ]}
        (root / 'claims.json').write_text(json.dumps(claims), encoding='utf-8')
        report = m.execute(request('report', claims='claims.json', output='report.md'))
        assert report['verified'] and report['references'] == 2
        receipt = {'status': 'passed', 'engine': m.VERSION, 'checks': ['real_HTTP_extractor_captions_without_video_download', 'timed_search', 'FFmpeg_bounded_video_download', 'original_offset_frames', 'audio_only_final_artifact', 'quote_and_frame_citations'], 'report': report, 'video': video, 'audio': audio, 'frames': frames}
        (root / 'integration.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        print(json.dumps({'status': 'passed', 'checks': receipt['checks'], 'receipt': str(root / 'integration.json')}))
finally:
    server.shutdown()
    server.server_close()
