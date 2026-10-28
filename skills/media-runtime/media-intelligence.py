"""Task-local video evidence; optional yt-dlp is loaded from a checksum-pinned zipapp."""
import hashlib
import html
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import socket
import shutil
import subprocess
import sys
from urllib.parse import parse_qs, quote, urlencode, urlsplit, urlunsplit

sys.dont_write_bytecode = True
VERSION = "2026.10.26"
MAX_JSON = 4 * 1024 * 1024


class MediaError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def fail(code, message):
    raise MediaError(code, message)


def inside(root, value):
    root, target = Path(root).resolve(), Path(value)
    target = (root / target).resolve()
    if not target.is_relative_to(root):
        fail("OUTSIDE_WORKSPACE", "Input and output paths must stay in the task workspace.")
    return target


def public_url(value, resolve=True):
    if not isinstance(value, str) or len(value) > 4096 or any(ord(c) < 32 for c in value):
        fail("INVALID_URL", "Pass one public HTTP(S) video URL.")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in ("http", "https") or not host or parsed.username or parsed.password:
        fail("INVALID_URL", "Only public HTTP(S) URLs without embedded credentials are accepted.")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".home", ".lan")):
        fail("PRIVATE_URL", "Local and private-network URLs are outside this public-video workflow.")
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        addresses = []
    if resolve and not addresses:
        try:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)]
        except OSError:
            fail("SOURCE_UNREACHABLE", "The video host could not be resolved.")
    if any(not address.is_global for address in addresses):
        fail("PRIVATE_URL", "Local, private, multicast and reserved addresses are not accepted.")
    query = parse_qs(parsed.query)
    if any(re.search(r"token|signature|password|auth|credential|secret|^key$", key, re.I) for key in query):
        fail("CREDENTIAL_URL", "Use the video's public page URL rather than a signed or authenticated media URL.")
    if (host == "youtube.com" or host.endswith(".youtube.com")) and parsed.path.split("/")[1] in ("playlist", "channel", "feed", "@"):
        fail("SINGLE_VIDEO_REQUIRED", "Pass an individual video, not a playlist, channel or feed.")
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def canonical_url(value):
    parsed = urlsplit(value)
    allowed = {key: values[0] for key, values in parse_qs(parsed.query).items() if not re.match(r"utm_|^(si|feature|fbclid|gclid|t|start)$", key, re.I)}
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(allowed), ""))


def timestamp_link(source, seconds):
    parsed = urlsplit(source)
    host, second = (parsed.hostname or "").lower(), int(seconds)
    query = parse_qs(parsed.query)
    fragment = ""
    if host == "vimeo.com" or host.endswith(".vimeo.com"):
        fragment = f"t={second}s"
    elif host == "twitch.tv" or host.endswith(".twitch.tv"):
        query["t"] = [f"{second // 3600}h{second % 3600 // 60}m{second % 60}s"]
    elif host == "dailymotion.com" or host.endswith(".dailymotion.com"):
        query["start"] = [str(second)]
    elif re.search(r"\.(mp4|webm|m4v|mov|m3u8)$", parsed.path, re.I):
        fragment = f"t={second}"
    else:
        query["t"] = [str(second)]
    return urlunsplit((parsed.scheme, parsed.netloc, quote(parsed.path, safe="/%:@!$&'*+,;=-._~"), urlencode({key: values[0] for key, values in query.items()}), fragment))


def bounded_number(value, minimum, maximum, code="INVALID_LIMIT"):
    try:
        result = float(value)
    except (TypeError, ValueError):
        fail(code, "Invalid numeric limit or timestamp.")
    if not math.isfinite(result) or not minimum <= result <= maximum:
        fail(code, "Numeric value exceeds the permitted range.")
    return result


def load_json(file):
    if file.stat().st_size > MAX_JSON:
        fail("INPUT_TOO_LARGE", "The JSON input exceeds 4 MiB.")
    return json.loads(file.read_text(encoding="utf-8"))


def write_new(file, value):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if len(text.encode("utf-8")) > MAX_JSON:
        fail("OUTPUT_LIMIT", "Evidence JSON exceeds 4 MiB; use a shorter source interval.")
    with file.open("x", encoding="utf-8") as output:
        output.write(text)


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def record(file, **details):
    if not file.is_file() or file.stat().st_size == 0:
        fail("EMPTY_OUTPUT", "No nonempty artifact was produced.")
    return {"path": file.name, "bytes": file.stat().st_size, "sha256": digest(file), **details}


def sanitize_info(info, requested_url):
    if info.get("_type") in ("playlist", "multi_video", "url", "url_transparent") or info.get("entries") is not None:
        fail("SINGLE_VIDEO_REQUIRED", "The link resolved to multiple videos or an unresolved redirect.")
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        fail("LIVE_UNBOUNDED", "Live/upcoming media needs a separately bounded recording workflow.")
    if info.get("has_drm") is True:
        fail("PROTECTED_MEDIA", "Protected media cannot be downloaded by this workflow.")
    if info.get("availability") in ("private", "premium_only", "subscriber_only", "needs_auth"):
        fail("SOURCE_AUTH_REQUIRED", "This source requires access not available to the public workflow.")
    duration = info.get("duration")
    if duration is not None:
        duration = bounded_number(duration, 0.001, 7 * 86400, "INVALID_DURATION")
    url = public_url(info.get("webpage_url") or requested_url)
    source_id = hashlib.sha256(canonical_url(url).encode()).hexdigest()[:16]
    return {"schemaVersion": 1, "sourceId": source_id, "url": canonical_url(url), "title": str(info.get("title") or info.get("id") or "Video")[:500], "uploader": str(info.get("uploader") or info.get("channel") or "")[:200], "duration": duration, "description": str(info.get("description") or "")[:12000], "uploadDate": info.get("upload_date"), "engine": {"name": "yt-dlp", "version": VERSION}, "evidence": [], "limitations": []}


def choose_track(info, languages):
    choices = []
    for automatic, key in ((False, "subtitles"), (True, "automatic_captions")):
        for language, tracks in (info.get(key) or {}).items():
            if language in ("live_chat", "danmaku"):
                continue
            for track in tracks:
                if track.get("ext") not in ("vtt", "srt", "json3") or not track.get("url"):
                    continue
                rank = next((i for i, desired in enumerate(languages) if language == desired or language.split("-")[0] == desired), len(languages) + 1)
                choices.append(((rank, automatic, {"vtt": 0, "json3": 1, "srt": 2}[track["ext"]], language), {**track, "language": language, "automatic": automatic}))
    return min(choices, key=lambda item: item[0])[1] if choices else None


def parse_captions(content, extension, duration=None):
    if extension not in ("vtt", "srt", "json3"):
        fail("INVALID_SUBTITLES", "Use SRT, VTT or JSON3 captions.")
    def stamp(value):
        parts = value.replace(",", ".").split(":")
        return sum(float(part) * 60 ** i for i, part in enumerate(reversed(parts)))
    cues = []
    if extension == "json3":
        for event in json.loads(content).get("events", []):
            text = "".join(str(segment.get("utf8", "")) for segment in event.get("segs", []))
            if text.strip() and event.get("dDurationMs", 0) > 0:
                cues.append({"start": event.get("tStartMs", 0) / 1000, "end": (event.get("tStartMs", 0) + event["dDurationMs"]) / 1000, "text": text})
    else:
        for block in re.split(r"\r?\n\s*\r?\n", content.replace("\ufeff", "")):
            match = re.search(r"((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})[^\n]*\n([\s\S]+)", block)
            if match:
                cues.append({"start": stamp(match[1]), "end": stamp(match[2]), "text": match[3]})
    cleaned, previous = [], -1.0
    for cue in cues:
        cue["text"] = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", cue["text"]))).strip()
        start, end = cue["start"], cue["end"]
        if not cue["text"]:
            continue
        if not all(math.isfinite(value) for value in (start, end)) or start < previous or start < 0 or end <= start or duration is not None and end > duration + 2:
            fail("INVALID_SUBTITLES", "Caption timing is unordered or outside the source duration.")
        previous = start
        if cleaned and cleaned[-1]["text"] == cue["text"] and start <= cleaned[-1]["end"] + 0.1:
            cleaned[-1]["end"] = max(cleaned[-1]["end"], end)
        else:
            cleaned.append(cue)
    if not cleaned:
        fail("NO_SUBTITLES", "No usable timed speech was present in the caption track.")
    if len(cleaned) > 50000 or sum(len(cue["text"]) for cue in cleaned) > 1500000 or any(len(cue["text"]) > 12000 for cue in cleaned):
        fail("CAPTION_LIMIT", "The track has too many cues for a bounded analysis pass.")
    return cleaned


class QuietLogger:
    def debug(self, message):
        pass
    def warning(self, message):
        pass
    def error(self, message):
        pass


def downloader(request, progress=None, overrides=None):
    sys.path.insert(0, str(request["engine"]))
    from yt_dlp import YoutubeDL
    from yt_dlp.version import __version__
    if __version__ != VERSION:
        fail("ENGINE_VERSION", "yt-dlp did not match the verified pinned engine.")
    params = {"quiet": True, "no_warnings": True, "logger": QuietLogger(), "noplaylist": True, "playlistend": 1, "cachedir": False, "socket_timeout": 15, "retries": 2, "fragment_retries": 1, "extractor_retries": 1, "concurrent_fragment_downloads": 1, "skip_unavailable_fragments": False, "overwrites": False, "continuedl": False, "restrictfilenames": True, "writethumbnail": False, "writeinfojson": False, "writecomments": False, "js_runtimes": {"node": {"path": request["node"]}}, "remote_components": set(), "ratelimit": 2 * 1024 * 1024}
    if progress:
        params["progress_hooks"] = [progress]
    if request.get("ffmpeg"):
        params["ffmpeg_location"] = shutil.which(request["ffmpeg"]) or request["ffmpeg"]
    params.update(overrides or {})
    return YoutubeDL(params)


def inspect_source(request, output, captions):
    url = public_url(request["url"])
    with downloader(request) as ydl:
        info = ydl.extract_info(url, download=False)
        source = sanitize_info(info, url)
        source["captionLanguages"] = {"manual": sorted((info.get("subtitles") or {}).keys()), "automatic": sorted((info.get("automatic_captions") or {}).keys())}
        if captions:
            track = choose_track(info, request["languages"])
            if track:
                # Signed CDN caption URLs stay in memory and never enter reports or receipts.
                parsed = urlsplit(track["url"])
                public_url(urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", "")))
                with ydl.urlopen(track["url"]) as response:
                    data = response.read(MAX_JSON + 1)
                if len(data) > MAX_JSON:
                    fail("CAPTION_LIMIT", "Caption track exceeds 4 MiB.")
                cues = parse_captions(data.decode("utf-8-sig"), track["ext"], source["duration"])
                raw = output / ("captions." + track["ext"])
                with raw.open("xb") as file:
                    file.write(data)
                for cue in cues:
                    cue["url"] = timestamp_link(source["url"], cue["start"])
                transcript = output / "transcript.json"
                write_new(transcript, {"sourceId": source["sourceId"], "language": track["language"], "origin": "automatic_captions" if track["automatic"] else "publisher_captions", "cues": cues})
                source["evidence"].extend([record(raw, kind="original_captions"), record(transcript, kind="transcript")])
                source["limitations"].append("Captions are speech evidence; they do not prove what is visible on screen.")
                if track["automatic"]:
                    source["limitations"].append("Automatic captions require spot checks for names, numbers and technical terms.")
            else:
                source["limitations"].append("No usable captions were found. Download only audio and use local transcription if speech analysis is needed.")
        source["status"] = "transcript_ready" if any(item["kind"] == "transcript" for item in source["evidence"]) else "metadata_only"
        source["nextSteps"] = ["read_or_find_transcript", "request_targeted_frames_if_visual_evidence_is_needed"] if source["status"] == "transcript_ready" else ["download_audio_then_local_transcription_if_needed", "download_a_bounded_video_section_only_for_visual_questions"]
        write_new(output / "source.json", source)
        return {"status": source["status"], "verified": True, "verification": "source_metadata_and_artifact_integrity", "sourceId": source["sourceId"], "source": str(output / "source.json"), "transcript": str(output / "transcript.json") if source["status"] == "transcript_ready" else None, "videoDownloaded": False, "nextSteps": source["nextSteps"]}


def probe(request, file):
    result = subprocess.run([request["ffprobe"], "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,width,height", "-of", "json", str(file)], check=True, capture_output=True, timeout=30)
    return json.loads(result.stdout)


def download_source(request, output):
    url = public_url(request["url"])
    maximum = request["maxBytes"]
    def progress(event):
        if event.get("downloaded_bytes", 0) > maximum or (event.get("total_bytes") or 0) > maximum:
            fail("DOWNLOAD_LIMIT", "Media transfer exceeded the selected byte budget.")
    with downloader(request, progress) as ydl:
        info = ydl.extract_info(url, download=False)
        source = sanitize_info(info, url)
        duration = source["duration"]
        if not duration and request.get("end") is None:
            fail("UNKNOWN_DURATION", "This source has no known duration; provide an explicit end within the time budget.")
        start, end = request.get("start", 0), request.get("end", duration)
        if not 0 <= start < end or duration and end > duration + 0.05 or end - start > request["maxSeconds"]:
            fail("DURATION_LIMIT", "Choose a shorter source or a bounded time section.")
        options = {"outtmpl": str(output / "media.%(ext)s"), "format": "bestaudio/best" if request["kind"] == "audio" else f"bestvideo[height<=?{request['height']}]+bestaudio/best[height<=?{request['height']}]", "max_filesize": maximum, "merge_output_format": "mp4"}
        if request["kind"] == "audio":
            # Combined-only sources may require temporary video bytes; final evidence is audio.
            options["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "128"}]
        if request.get("start") is not None or request.get("end") is not None:
            from yt_dlp.utils import download_range_func
            options.update({"download_ranges": download_range_func(None, [(start, end)]), "force_keyframes_at_cuts": True})
        # yt-dlp normalizes templates/selectors/postprocessors at construction.
        # A fresh instance avoids mutating those initialized internals after inspection.
        with downloader(request, progress, options) as transfer:
            transfer.process_ie_result(info, download=True)
        files = [file for file in output.iterdir() if file.is_file() and re.fullmatch(r"media\.[A-Za-z0-9]{1,8}", file.name)]
        if len(files) != 1:
            fail("DOWNLOAD_INCOMPLETE", "No single completed media file was produced within the budget.")
        file = files[0]
        if file.stat().st_size > maximum:
            fail("DOWNLOAD_LIMIT", "Final media exceeds the selected byte budget.")
        actual = probe(request, file)
        streams = actual.get("streams", [])
        if not any(stream.get("codec_type") == request["kind"] for stream in streams):
            fail("INVALID_MEDIA", "Downloaded file is missing the requested media stream.")
        if request["kind"] == "video" and any(stream.get("height", 0) > request["height"] for stream in streams):
            fail("RESOLUTION_LIMIT", "The source omitted resolution metadata and the downloaded stream exceeds the selected height.")
        actual_duration = float(actual.get("format", {}).get("duration", 0))
        if not 0 < actual_duration <= end - start + 2:
            fail("INVALID_MEDIA", "Downloaded duration does not match the requested interval.")
        source["capture"] = {"start": start, "end": end, "duration": actual_duration, "timing": "requested_source_interval; verify fine alignment against original playback"}
        source["evidence"] = [record(file, kind=request["kind"], media=actual)]
        source["status"] = "media_ready"
        source["limitations"] = ["Media existence and streams were checked. No semantic analysis or full decoder review is implied."]
        write_new(output / "source.json", source)
        return {"status": "media_ready", "verified": True, "verification": "file_hash_streams_and_duration", "source": str(output / "source.json"), "media": str(file), "capture": source["capture"]}


def evidence_source(root, directory):
    directory = inside(root, directory)
    source = load_json(directory / "source.json")
    if source.get("schemaVersion") != 1 or not re.fullmatch(r"[a-f0-9]{16}", source.get("sourceId", "")):
        fail("INVALID_EVIDENCE", "Invalid evidence manifest.")
    public_url(source["url"], resolve=False)
    for entry in source.get("evidence", []):
        file = inside(directory, entry["path"])
        if not file.is_file() or digest(file) != entry["sha256"] or file.stat().st_size != entry["bytes"]:
            fail("EVIDENCE_CHANGED", "Evidence bytes no longer match the source receipt.")
    return source, directory


def index_subtitles(request, output):
    source, directory = evidence_source(request["workspace"], request["evidence"])
    subtitle = inside(request["workspace"], request["input"])
    if subtitle.stat().st_size > MAX_JSON:
        fail("CAPTION_LIMIT", "The local transcript exceeds 4 MiB.")
    offset = source.get("capture", {}).get("start", 0)
    duration = source.get("capture", {}).get("duration", source["duration"])
    cues = parse_captions(subtitle.read_text(encoding="utf-8-sig"), subtitle.suffix.lstrip("."), duration)
    for cue in cues:
        cue["start"] += offset
        cue["end"] += offset
        cue["url"] = timestamp_link(source["url"], cue["start"])
    target = output / "transcript.json"
    write_new(target, {"sourceId": source["sourceId"], "language": request.get("language", "auto"), "origin": "local_transcription", "cues": cues})
    source["evidence"] = [record(target, kind="transcript")]
    source["status"] = "transcript_ready"
    source["limitations"] = ["Local speech recognition needs review; source timestamps include the downloaded section offset."]
    write_new(output / "source.json", source)
    return {"status": "transcript_ready", "verified": True, "source": str(output / "source.json"), "transcript": str(target)}


def frame_evidence(request, output):
    source, directory = evidence_source(request["workspace"], request["evidence"])
    entry = next((item for item in source["evidence"] if item["kind"] == "video"), None)
    if not entry:
        fail("VIDEO_REQUIRED", "Frame extraction requires a verified downloaded video.")
    media = inside(directory, entry["path"])
    offset = source.get("capture", {}).get("start", 0)
    duration = source.get("capture", {}).get("duration", source["duration"])
    frames = []
    for index, value in enumerate(request["times"]):
        second = bounded_number(value, offset, offset + duration - 0.001, "INVALID_FRAME_TIME")
        file = output / f"frame-{index + 1:02d}.jpg"
        subprocess.run([request["ffmpeg"], "-nostdin", "-v", "error", "-n", "-ss", str(second - offset), "-i", str(media), "-frames:v", "1", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease", "-q:v", "3", str(file)], check=True, capture_output=True, timeout=30)
        frames.append(record(file, kind="frame", second=second, url=timestamp_link(source["url"], second)))
    source["evidence"] = frames
    source["status"] = "frames_ready"
    source["limitations"] = ["Frames are sampled visual evidence, not proof of continuous action. Section timing may have a small seek offset."]
    write_new(output / "source.json", source)
    return {"status": "frames_ready", "verified": True, "source": str(output / "source.json"), "frames": frames}


def find_cues(request):
    source, directory = evidence_source(request["workspace"], request["evidence"])
    entry = next((item for item in source["evidence"] if item["kind"] == "transcript"), None)
    if not entry:
        fail("TRANSCRIPT_REQUIRED", "Read or create timed transcript evidence first.")
    transcript = load_json(inside(directory, entry["path"]))
    query = request["query"].strip().lower()
    if not 1 <= len(query) <= 500:
        fail("INVALID_QUERY", "Search query must be 1–500 characters.")
    terms = list(dict.fromkeys([query, *re.findall(r"[\w-]{2,}", query)]))
    matches = [{**cue, "sourceId": source["sourceId"]} for cue in transcript["cues"] if any(term in cue["text"].lower() for term in terms)]
    return {"status": "searched", "verified": True, "totalMatches": len(matches), "matches": matches[:request["limit"]], "truncated": len(matches) > request["limit"], "origin": transcript["origin"]}


def md(value):
    return re.sub(r"([\\`*_{}\[\]<>#|!])", r"\\\1", str(value).replace("\r", " ").replace("\n", " "))


def make_report(request):
    root = request["workspace"]
    claims = load_json(inside(root, request["claims"]))
    if not 1 <= len(claims.get("sources", [])) <= 24 or not 1 <= len(claims.get("findings", [])) <= 60:
        fail("INVALID_REPORT", "Use 1–24 evidence bundles and 1–60 findings.")
    sources = {}
    for directory in claims["sources"]:
        source, folder = evidence_source(root, directory)
        sources.setdefault(source["sourceId"], []).append((source, folder))
    rows = ["# " + md(claims.get("title", "Video analysis")), "", "Evidence: speech / sampled frames / analysis. Linked timestamps refer to the original video.", ""]
    references = 0
    for index, finding in enumerate(claims["findings"]):
        kind, text, evidence = finding.get("kind"), finding.get("text", ""), finding.get("evidence", [])
        if kind not in ("speech", "visual", "analysis") or not 1 <= len(text) <= 3000 or not 1 <= len(evidence) <= 8:
            fail("INVALID_REPORT", "Each finding needs a kind, bounded text and actual evidence references.")
        rows.extend([f"## {index + 1}. {md(text)}", "", f"Type: {kind}", ""])
        for citation in evidence:
            bundles = sources.get(citation.get("sourceId"), [])
            if not bundles:
                fail("INVALID_CITATION", "Citation source is missing from the evidence set.")
            source = bundles[0][0]
            second = bounded_number(citation.get("second"), 0, source["duration"] or 7 * 86400, "INVALID_CITATION")
            quote, frame = citation.get("quote"), citation.get("frame")
            if not quote and not frame:
                fail("INVALID_CITATION", "Cite a transcript quote or a verified frame.")
            if quote:
                if not isinstance(quote, str) or not 1 <= len(quote) <= 800:
                    fail("INVALID_CITATION", "Quote is invalid or too long.")
                valid = False
                for item, folder in bundles:
                    for entry in item["evidence"]:
                        if entry["kind"] == "transcript":
                            transcript = load_json(inside(folder, entry["path"]))
                            nearby = " ".join(cue["text"] for cue in transcript["cues"] if cue["start"] - 1 <= second <= cue["end"] + 1)
                            if re.sub(r"\s+", " ", quote).strip() in nearby:
                                valid = True
                if not valid:
                    fail("INVALID_CITATION", "The quote is not present at the cited source timestamp.")
            if frame:
                valid = any(entry["kind"] == "frame" and entry["path"] == frame and abs(entry["second"] - second) < 0.05 for item, _folder in bundles for entry in item["evidence"])
                if not valid:
                    fail("INVALID_CITATION", "The cited frame or its original-video timestamp was not verified.")
            if kind == "visual" and not frame or kind == "speech" and not quote:
                fail("INVALID_CITATION", "Visual findings need a frame; speech findings need a transcript quote.")
            minutes, seconds = divmod(int(second), 60)
            rows.append(f"- [{md(source['title'])} · {minutes:02d}:{seconds:02d}]({timestamp_link(source['url'], second)})")
            if quote:
                rows.append("  > " + md(quote))
            if frame:
                rows.append("  Frame: " + md(frame))
            references += 1
        rows.append("")
    rows.extend(["## Source limitations", ""])
    for bundles in sources.values():
        for source, _folder in bundles:
            for limitation in source.get("limitations", []):
                rows.append("- " + md(limitation))
    target = inside(root, request["output"])
    if target.exists() or Path(str(target) + ".artifact.json").exists():
        fail("OUTPUT_EXISTS", "Choose a new report and receipt path.")
    target.parent.mkdir(parents=True, exist_ok=True)
    write_new(target, "\n".join(rows) + "\n")
    receipt = {"status": "completed", "verified": True, "verification": "evidence_integrity_and_citation_matching; semantic_claims_require_review", "path": str(target), "findings": len(claims["findings"]), "references": references, "sha256": digest(target)}
    write_new(Path(str(target) + ".artifact.json"), receipt)
    return receipt


def execute(request):
    root = Path(request["workspace"]).resolve(strict=True)
    request["workspace"] = str(root)
    action = request["action"]
    if action not in ("inspect", "transcript", "download", "index", "frames", "find", "report"):
        fail("INVALID_ACTION", "Unsupported media action.")
    if action in ("inspect", "transcript", "download"):
        public_url(request["url"])
    if action == "download":
        bounded_number(request["maxBytes"], 1024 * 1024, 512 * 1024 * 1024)
        bounded_number(request["maxSeconds"], 1, 3600)
        bounded_number(request["height"], 144, 1080)
        if request["kind"] not in ("audio", "video"):
            fail("INVALID_KIND", "Use audio or video.")
    if action == "frames" and not 1 <= len(request["times"]) <= 24:
        fail("FRAME_LIMIT", "Request 1–24 original-video timestamps.")
    if action == "find":
        bounded_number(request["limit"], 1, 100)
    if action == "find":
        return find_cues(request)
    if action == "report":
        return make_report(request)
    output = inside(root, request["output"])
    if output.exists():
        fail("OUTPUT_EXISTS", "Choose a new output path; existing files are preserved.")
    output.mkdir(parents=True, exist_ok=False)
    try:
        if action in ("inspect", "transcript"):
            return inspect_source(request, output, action == "transcript")
        if action == "download":
            return download_source(request, output)
        if action == "index":
            return index_subtitles(request, output)
        if action == "frames":
            return frame_evidence(request, output)
        fail("INVALID_ACTION", "Unsupported media action.")
    except Exception:
        # Partial files remain task-owned evidence of failure, never a completion receipt.
        write_new(output / "failure.json", {"status": "failed", "verified": False})
        raise


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_JSON + 1)
        if len(raw) > MAX_JSON:
            fail("INPUT_TOO_LARGE", "Request exceeds 4 MiB.")
        result = execute(json.loads(raw))
        print(json.dumps(result))
    except MediaError as error:
        print(json.dumps({"status": "failed", "verified": False, "code": error.code, "message": str(error)}))
        return 1
    except Exception as error:
        # Never echo provider exceptions: they may contain signed URLs or credentials.
        name = type(error).__name__
        challenge = any(word in str(error).lower() for word in ("sign in", "log in", "cookies", "confirm you", "not a bot", "http error 403", "http error 429"))
        print(json.dumps({"status": "failed", "verified": False, "code": "SOURCE_AUTH_OR_CHALLENGE" if challenge else "SOURCE_OR_ENGINE_FAILED", "message": "Public source access was blocked by authentication or an anti-bot challenge; no cookies were read." if challenge else "Source access or local processing failed; no verified result is claimed.", "errorType": name}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
