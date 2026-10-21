#!/usr/bin/env python3
"""Research reader privacy, consent and size-bound regressions."""

import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SCRIPT = pathlib.Path(__file__).with_name("takeover-session-probe.py")
SPEC = importlib.util.spec_from_file_location("probe", SCRIPT)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class ProbeTests(unittest.TestCase):
    def test_fixture_contract(self):
        result = PROBE.fixtures(SCRIPT.parent.parent / "tests" / "fixtures" / "agent-sessions")
        self.assertEqual(len(result["synthetic_fixtures"]), 4)
        self.assertEqual(result["upstream_model_calls"], 0)

    def test_untrusted_fields_do_not_reach_diagnostics(self):
        record = {"type": "session_meta", "payload": {"id": "PRIVATE_ID", "cwd": "/private/project",
                  "cli_version": "PRIVATE_DIAGNOSTIC_TEXT", "content": "PRIVATE_BODY"}}
        observed = PROBE.metadata(io.BytesIO(json.dumps(record).encode()), "codex")
        self.assertEqual(observed, {"metadata_observable": True, "recorded_cli_version": "unrecorded"})
        record["payload"]["cli_version"] = "1" * 1000 + ".2.3"
        self.assertEqual(PROBE.metadata(io.BytesIO(json.dumps(record).encode()), "codex")["recorded_cli_version"], "unrecorded")
        for secret in ("PRIVATE_ID", "/private/project", "PRIVATE_BODY", "PRIVATE_DIAGNOSTIC_TEXT"):
            self.assertNotIn(secret, json.dumps(observed))

    def test_prefix_and_unsupported_records(self):
        for raw in (b"[]\nnull\n", b'{"type":"session_meta","payload":[]}\n', b"x" * (PROBE.LIMIT + 1)):
            self.assertIsNone(PROBE.metadata(io.BytesIO(raw), "codex"))

    def test_consent_is_required_before_real_scan(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--sessions-root", "/not-read", "--source", "codex"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("no files were read", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_source_is_unchanged_and_links_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            file = root / "fixture.jsonl"
            raw = b'{"type":"user","sessionId":"PRIVATE_ID","cwd":"/synthetic/project","message":{"content":"PRIVATE_BODY"}}\n'
            file.write_bytes(raw)
            before = file.stat()
            result = PROBE.scan(root, "claude")
            self.assertEqual(result["metadata_observable"], 1)
            self.assertNotIn("PRIVATE", json.dumps(result))
            self.assertEqual(file.read_bytes(), raw)
            self.assertEqual(file.stat().st_mtime_ns, before.st_mtime_ns)
            try:
                os.symlink(str(file), str(root / "link.jsonl"))
            except OSError:
                return
            self.assertEqual(PROBE.scan(root, "claude")["scanned_files"], 1)

    def test_missing_source_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            result = PROBE.scan(pathlib.Path(directory) / "missing", "codex")
            self.assertEqual(result["state"], "unavailable")
            self.assertEqual(result["metadata_observable"], 0)


if __name__ == "__main__":
    unittest.main()
