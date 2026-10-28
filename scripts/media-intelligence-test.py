"""Offline workflow tests: no accounts, remote services, model weights or network access."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("media_evidence", Path(__file__).resolve().parents[1] / "skills/media-runtime/media-intelligence.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
URL = "https://www.youtube.com/watch?v=fixture&utm_source=test"
VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThe new export is local.\n\n00:00:06.000 --> 00:00:09.000\n<b>支持中文</b> &amp; English.\n"

class FakeDL:
    def __init__(self, info):
        self.info, self.params, self.downloads = info, {}, 0
    def __enter__(self): return self
    def __exit__(self, *_args): pass
    def extract_info(self, url, download=False):
        assert download is False
        return self.info
    def urlopen(self, _url): return io.BytesIO(VTT.encode())
    def process_ie_result(self, *_args, **_kwargs):
        self.downloads += 1
        raise AssertionError("Caption-first paths must not download media")

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ra-media-evidence-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dns = patch.object(m.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.215.14', 443))])
        self.dns.start()
        self.addCleanup(self.dns.stop)

    def request(self, action, **fields):
        return {'workspace': str(self.root), 'action': action, 'output': action, **fields}

    def info(self, **fields):
        return {'id': 'fixture', 'title': 'Product release', 'duration': 120, 'webpage_url': URL, **fields}

    def transcript(self):
        fake = FakeDL(self.info(subtitles={'en': [{'ext': 'vtt', 'url': 'https://example.org/captions.vtt?signature=private'}]}))
        with patch.object(m, 'downloader', return_value=fake):
            result = m.execute(self.request('transcript', url=URL, languages=['en']))
        self.assertFalse(result['videoDownloaded'])
        self.assertEqual(fake.downloads, 0)
        return result

    def test_caption_first_retains_provenance_without_signed_cdn_urls(self):
        result = self.transcript()
        source = json.loads(Path(result['source']).read_text())
        self.assertEqual(source['status'], 'transcript_ready')
        self.assertEqual(source['url'], 'https://www.youtube.com/watch?v=fixture')
        self.assertEqual(source['engine']['version'], m.VERSION)
        self.assertNotIn('signature', json.dumps(source))
        self.assertEqual([entry['kind'] for entry in source['evidence']], ['original_captions', 'transcript'])
        found = m.execute(self.request('find', evidence='transcript', query='export', limit=1))
        self.assertEqual(found['matches'][0]['start'], 1)
        self.assertIn('t=1', found['matches'][0]['url'])

    def test_missing_captions_returns_metadata_without_media_download(self):
        fake = FakeDL(self.info())
        with patch.object(m, 'downloader', return_value=fake):
            result = m.execute(self.request('transcript', url=URL, languages=['zh', 'en']))
        self.assertEqual(result['status'], 'metadata_only')
        self.assertIsNone(result['transcript'])
        self.assertFalse(result['videoDownloaded'])
        self.assertEqual(fake.downloads, 0)

    def test_track_language_and_manual_preference(self):
        track = lambda url: [{'ext': 'vtt', 'url': url}]
        info = self.info(subtitles={'en': track('manual')}, automatic_captions={'en': track('auto'), 'zh-Hans': track('zh')})
        self.assertEqual(m.choose_track(info, ['en'])['url'], 'manual')
        self.assertEqual(m.choose_track(info, ['zh', 'en'])['url'], 'zh')
        self.assertIsNone(m.choose_track({'subtitles': {'live_chat': track('chat')}}, ['en']))

    def test_srt_vtt_json3_and_rolling_deduplication(self):
        self.assertEqual(m.parse_captions(VTT, 'vtt', 120)[1]['text'], '支持中文 & English.')
        srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:01,500 --> 00:00:03,000\nHello\n'
        self.assertEqual(m.parse_captions(srt, 'srt'), [{'start': 1, 'end': 3, 'text': 'Hello'}])
        self.assertEqual(m.parse_captions('{"events":[{"tStartMs":1000,"dDurationMs":2000,"segs":[{"utf8":"Hello"}]}]}', 'json3')[0]['end'], 3)
        for content in ['WEBVTT', VTT.replace('00:00:04.000', '00:00:00.000'), VTT.replace('00:00:09.000', '00:03:00.000')]:
            with self.assertRaises(m.MediaError): m.parse_captions(content, 'vtt', 120)

    def test_timestamp_links_follow_source_player_and_escape_markdown(self):
        for source, suffix in [('https://www.youtube.com/watch?v=one', '&t=72'), ('https://www.bilibili.com/video/BVexample', '?t=72'), ('https://vimeo.com/12345', '#t=72s'), ('https://media.example.org/video.mp4', '#t=72'), ('https://www.twitch.tv/videos/12345', '?t=0h1m12s'), ('https://www.dailymotion.com/video/example', '?start=72')]:
            self.assertTrue(m.timestamp_link(source, 72).endswith(suffix))
        self.assertNotIn(')', m.timestamp_link('https://example.org/a)injected', 1))

    def test_public_single_finite_sources_only(self):
        for url in ['file:///etc/passwd', 'http://127.0.0.1/a', 'https://[::1]/a', 'https://user:pass@example.org/a', 'https://example.org/a?token=secret', 'http://router.local/a']:
            with self.subTest(url=url), self.assertRaises(m.MediaError): m.public_url(url)
        for extra in [{'_type': 'playlist'}, {'entries': []}, {'is_live': True}, {'has_drm': True}, {'availability': 'needs_auth'}, {'duration': float('nan')}]:
            with self.subTest(extra=extra), self.assertRaises(m.MediaError): m.sanitize_info(self.info(**extra), URL)
        self.assertEqual(m.canonical_url('https://example.org/play?id=one&utm_source=test'), 'https://example.org/play?id=one')

    def test_existing_outputs_and_workspace_escape_are_preserved(self):
        kept = self.root / 'kept'
        kept.mkdir()
        (kept / 'original').write_text('keep me')
        with self.assertRaises(m.MediaError): m.execute(self.request('index', output='kept'))
        with self.assertRaises(m.MediaError): m.inside(self.root, '../escape')
        self.assertEqual((kept / 'original').read_text(), 'keep me')

    def test_source_interval_budget_is_checked_before_download(self):
        fake = FakeDL(self.info(duration=1200))
        with patch.object(m, 'downloader', return_value=fake):
            with self.assertRaises(m.MediaError) as error:
                m.execute(self.request('download', url=URL, kind='audio', maxBytes=1024**2, maxSeconds=60, height=720))
        self.assertEqual(error.exception.code, 'DURATION_LIMIT')
        self.assertEqual(fake.downloads, 0)
        self.assertFalse((self.root / 'download/source.json').exists())
        self.assertEqual(json.loads((self.root / 'download/failure.json').read_text())['verified'], False)

    def test_local_transcription_restores_original_section_offset(self):
        result = self.transcript()
        source_file = Path(result['source'])
        source = json.loads(source_file.read_text())
        source['capture'] = {'start': 60, 'end': 90, 'duration': 30}
        source_file.write_text(json.dumps(source))
        subtitle = self.root / 'local.srt'
        subtitle.write_text('1\n00:00:02,000 --> 00:00:05,000\nA local quote.\n', encoding='utf-8')
        result = m.execute(self.request('index', evidence='transcript', input='local.srt'))
        cue = json.loads(Path(result['transcript']).read_text())['cues'][0]
        self.assertEqual((cue['start'], cue['end']), (62, 65))
        self.assertIn('t=62', cue['url'])

    def claims(self):
        source = json.loads((self.root / 'transcript/source.json').read_text())
        data = {'title': 'Comparison', 'sources': ['transcript'], 'findings': [{'kind': 'speech', 'text': 'Local export was announced.', 'evidence': [{'sourceId': source['sourceId'], 'second': 2, 'quote': 'The new export is local.'}]}]}
        target = self.root / 'claims.json'
        target.write_text(json.dumps(data))
        return data, target

    def test_report_checks_real_quote_at_original_timestamp(self):
        self.transcript()
        data, target = self.claims()
        result = m.execute(self.request('report', claims='claims.json', output='report.md'))
        self.assertTrue(result['verified'])
        self.assertIn('semantic_claims_require_review', result['verification'])
        self.assertIn('t=2', (self.root / 'report.md').read_text())
        for citation in [{'second': 100}, {'quote': 'Invented claim'}, {'sourceId': '0' * 16}, {'frame': 'invented.jpg'}]:
            original = data['findings'][0]['evidence'][0].copy()
            data['findings'][0]['evidence'][0].update(citation)
            target.write_text(json.dumps(data))
            with self.assertRaises(m.MediaError): m.execute(self.request('report', claims='claims.json', output='invalid.md'))
            self.assertFalse((self.root / 'invalid.md').exists())
            data['findings'][0]['evidence'][0] = original

    def test_changed_evidence_is_rejected(self):
        self.transcript()
        self.claims()
        (self.root / 'transcript/transcript.json').write_text('{"invented":"text"}')
        for action, fields in [('find', {'evidence': 'transcript', 'query': 'export', 'limit': 20}), ('report', {'claims': 'claims.json', 'output': 'report.md'})]:
            with self.assertRaises(m.MediaError) as error: m.execute(self.request(action, **fields))
            self.assertEqual(error.exception.code, 'EVIDENCE_CHANGED')

if __name__ == '__main__': unittest.main(verbosity=2)
