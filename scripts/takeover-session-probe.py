#!/usr/bin/env python3
"""Read-only metadata qualification for #253; no model/SDK/network invocation."""

import argparse
import collections
import io
import json
import os
import pathlib
import re
import sys

LIMIT = 64 * 1024
CONTRACT = "remotearc.session-research/v1"


def metadata(stream, source):
    remaining = LIMIT
    while remaining > 0:
        line = stream.readline(remaining)
        if not line:
            break
        remaining -= len(line)
        try:
            item = json.loads(line)
            if not isinstance(item, dict):
                continue
            data = item.get("payload", {}) if source == "codex" else item
            if not isinstance(data, dict):
                continue
            if source == "codex" and item.get("type") != "session_meta":
                continue
            identity = data.get("id" if source == "codex" else "sessionId")
            cwd = data.get("cwd")
            if not isinstance(identity, str) or not identity or len(identity) > 256:
                continue
            if not isinstance(cwd, str) or not (pathlib.PurePosixPath(cwd).is_absolute() or pathlib.PureWindowsPath(cwd).is_absolute()):
                continue
            version = data.get("cli_version", "unrecorded")
            if not isinstance(version, str) or len(version) > 80 or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-(?:alpha|beta|rc)(?:\.[0-9]+)+)?", version):
                version = "unrecorded"
            # No identity, path, message body or tool content leaves this reader.
            return {"metadata_observable": True, "recorded_cli_version": version}
        except (ValueError, UnicodeError, TypeError):
            continue
    return None


def fixtures(root):
    checked = []
    for source, names in (("codex", ("basic", "partial")), ("claude", ("basic", "resume"))):
        for name in names:
            path = root / source / (name + ".jsonl")
            raw = path.read_bytes().replace(b"__WORKSPACE__", b"/synthetic/project")
            observed = metadata(io.BytesIO(raw), source)
            if not observed:
                raise ValueError("fixture metadata unavailable: " + source + "/" + name)
            if any(term in json.dumps(observed) for term in ("Synthetic task", "Synthetic retained", "synthetic-user", "/synthetic/project")):
                raise ValueError("fixture body or path leaked")
            checked.append(source + "/" + name)
    if metadata(io.BytesIO(b"x" * (LIMIT + 1)), "codex") is not None:
        raise ValueError("metadata limit failed")
    return {"contract": CONTRACT, "state": "passed", "synthetic_fixtures": checked, "upstream_model_calls": 0}


def scan(root, source):
    result = {"contract": CONTRACT, "source": source, "state": "available" if root.is_dir() else "unavailable",
              "scanned_files": 0, "metadata_observable": 0, "skipped_files": 0, "recorded_cli_versions": {},
              "returned_private_text": False, "upstream_model_calls": 0,
              "unverified": ["history completeness", "actual workspace state", "external effects", "task completion"]}
    versions = collections.Counter()
    if root.is_symlink():
        result["state"] = "symlink_not_followed"
        return result
    for directory, dirs, names in os.walk(str(root), followlinks=False):
        dirs[:] = sorted(d for d in dirs if not (pathlib.Path(directory) / d).is_symlink())
        for name in sorted(names):
            path = pathlib.Path(directory) / name
            if path.suffix != ".jsonl" or path.is_symlink():
                continue
            if result["scanned_files"] >= 1000:
                result["state"] = "scan_limit_reached"
                result["recorded_cli_versions"] = dict(versions)
                return result
            result["scanned_files"] += 1
            try:
                with path.open("rb") as stream:
                    observed = metadata(stream, source)
                if observed:
                    result["metadata_observable"] += 1
                    versions[observed["recorded_cli_version"]] += 1
                else:
                    result["skipped_files"] += 1
            except OSError:
                result["skipped_files"] += 1
    result["recorded_cli_versions"] = dict(versions)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--fixtures", type=pathlib.Path)
    mode.add_argument("--sessions-root", type=pathlib.Path)
    parser.add_argument("--source", choices=("codex", "claude"))
    parser.add_argument("--consent-metadata", action="store_true", help="permit bounded reads of local session headers")
    args = parser.parse_args()
    if args.sessions_root and (not args.consent_metadata or not args.source):
        parser.error("a real source requires --source and --consent-metadata; no files were read")
    try:
        result = fixtures(args.fixtures) if args.fixtures else scan(args.sessions_root, args.source)
        print(json.dumps(result, sort_keys=True))
    except (OSError, ValueError) as error:
        print(json.dumps({"contract": CONTRACT, "state": "failed", "error_type": type(error).__name__}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
