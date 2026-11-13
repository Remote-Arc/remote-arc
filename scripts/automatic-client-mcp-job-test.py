"""Windows qualification must reap fixture descendants without touching others."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("qualification", Path(__file__).with_name("automatic-client-mcp-qualification.py"))
qualification = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualification)


@unittest.skipUnless(os.name == "nt", "Windows job objects")
class ProcessScopeTest(unittest.TestCase):
    def test_orphan_reaped_and_unrelated_process_preserved(self):
        with tempfile.TemporaryDirectory(prefix="remotearc-process-scope-") as directory:
            unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"],
                                         creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                result = qualification.windows_worker([sys.executable, "-c", """
import json, os, subprocess, sys, time
request = json.load(sys.stdin)
child = subprocess.Popen([sys.executable, '-c',
    'import os, pathlib, sys, time; os.chdir(sys.argv[1]); pathlib.Path("ready").touch(); time.sleep(60)',
    request['directory']], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
deadline = time.monotonic() + 5
while not os.path.exists(os.path.join(request['directory'], 'ready')):
    assert time.monotonic() < deadline, 'child did not lock its fixture'
    time.sleep(0.02)
print(json.dumps({'child': child.pid}))
"""], {"directory": directory})
                self.assertGreater(result["child"], 0)
                self.assertIsNone(unrelated.poll())
                # Windows cannot remove a directory that is still a process cwd.
                Path(directory, "ready").unlink()
                Path(directory).rmdir()
            finally:
                unrelated.kill()
                unrelated.wait(timeout=5)

    def test_worker_failure_is_not_hidden(self):
        with self.assertRaisesRegex(RuntimeError, "fixture assertion failed"):
            qualification.windows_worker([sys.executable, "-c",
                "import json,sys; json.load(sys.stdin); raise AssertionError('fixture assertion failed')"], {})


if __name__ == "__main__":
    unittest.main()
