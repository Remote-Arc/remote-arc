#!/usr/bin/env python3
"""Exercise native local setup against an installed Codex, using synthetic profiles only."""

import argparse
import hashlib
import json
import os
import pathlib
import queue
import shutil
import subprocess
import sys
import tempfile
import threading

sys.dont_write_bytecode = True


def spawn_options():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CodexRPC:
    def __init__(self, binary, profile, env):
        self.process = subprocess.Popen([str(binary), "app-server"], cwd=profile, env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, encoding="utf-8", **spawn_options())
        self.responses = queue.Queue()
        self.sequence = 0

        def reader():
            while True:
                line = self.process.stdout.readline(8 * 1024 * 1024)
                self.responses.put(line)
                if not line:
                    break

        threading.Thread(target=reader, daemon=True).start()
        self.call("initialize", {"clientInfo": {"name": "remote_arc_setup_smoke", "version": "1"},
                                 "capabilities": {"experimentalApi": True, "explicitGatewayOauth": True}})
        self.process.stdin.write(json.dumps({"method": "initialized"}) + "\n")
        self.process.stdin.flush()

    def call(self, method, params, error_expected=False):
        assert method != "turn/start", "smoke must not invoke model generation"
        self.sequence += 1
        self.process.stdin.write(json.dumps({"id": self.sequence, "method": method, "params": params}) + "\n")
        self.process.stdin.flush()
        for _ in range(1000):
            line = self.responses.get(timeout=20)
            assert line and len(line) < 8 * 1024 * 1024, "Codex response missing or oversized"
            response = json.loads(line)
            if response.get("method"):
                assert "id" not in response, "native provider action required; not automatically approved"
                continue
            if response.get("id") != self.sequence:
                continue
            if error_expected:
                assert "error" in response, "stale conditional write was accepted"
                return response
            assert "error" not in response, "Codex rejected " + method + "; private diagnostics omitted"
            return response["result"]
        raise AssertionError("Codex response bound exceeded")

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.process.stdout.close()


def run_smoke(binary, codex, base):
    passed = []
    client_version = None

    def fixture(name, customized=False):
        root = base / name
        project, profile, state = root / "project with spaces", root / "codex-profile", root / "arc-state"
        for directory in (project, profile, state):
            directory.mkdir(parents=True)
        env = dict(os.environ)
        for key in list(env):
            if key.upper() in ("OPENAI_API_KEY", "CODEX_API_KEY", "CHATGPT_AUTH_TOKEN"):
                del env[key]
        env.update(CODEX_HOME=str(profile), REMOTEARC_HOME=str(state))
        original = ""
        marker = root / "unrelated-started"
        if customized:
            unrelated = root / "unrelated.py"
            unrelated.write_text("import pathlib,sys\npathlib.Path(sys.argv[1]).write_text('unexpected')\n", encoding="utf-8")
            original = ("# Preserve this unrelated comment\nmodel_reasoning_effort = \"high\"\n"
                        "[mcp_servers.fixture_existing]\ncommand = " + json.dumps(sys.executable) + "\nargs = " +
                        json.dumps([str(unrelated), str(marker)]) + "\nenabled = true\n")
            (profile / "config.toml").write_text(original, encoding="utf-8")
        return project, profile, state, env, original, marker

    def execute(action, item, expected=None, code=None):
        nonlocal client_version
        project, profile, state, env, original, marker = item
        result = subprocess.run([str(binary), "setup", action, "--agent", "codex", "--workspace", str(project),
                                 "--codex-binary", str(codex)], cwd=base, env=env, capture_output=True,
                                text=True, encoding="utf-8", timeout=90, **spawn_options())
        value = json.loads(result.stdout)
        if code:
            assert result.returncode != 0 and value.get("error_code") == code, action + " did not reject " + code
        else:
            assert result.returncode == 0, action + " failed: " + value.get("error_code", "unknown") + "; " + value.get("hint", "")
            if expected:
                assert value["status"] == expected, action + " status mismatch"
        assert not marker.exists(), "healthcheck started an unrelated MCP integration"
        if value.get("client_version"):
            client_version = value["client_version"]
        return value

    clean = fixture("clean")
    assert execute("status", clean, "not_installed")["changed"] is False
    first = execute("install", clean, "installed")
    assert first["changed"] and first["client_tools_verified"]
    assert execute("install", clean, "installed")["changed"] is False
    execute("uninstall", clean, "uninstalled")
    execute("uninstall", clean, "not_installed")
    passed.append("fresh profile, repeated install and repeated uninstall")

    custom = fixture("customized", customized=True)
    project, profile, state, env, original, marker = custom
    installed = execute("install", custom, "installed")
    name = installed["registration"]
    config = profile / "config.toml"
    assert name in config.read_text(encoding="utf-8")
    assert "# Preserve this unrelated comment" in config.read_text(encoding="utf-8")
    before = digest(config)
    assert execute("install", custom, "installed")["changed"] is False
    assert digest(config) == before, "repeat setup rewrote config"
    execute("doctor", custom, "healthy")
    execute("status", custom, "registered")
    records = list((state / ".remotearc" / "integrations" / "codex").glob("*.json"))
    assert len(records) == 1, "expected exactly one ownership record"
    record_path = records[0]
    record = json.loads(record_path.read_text(encoding="utf-8"))
    assert record["stage"] == "installed" and record["original_entry"] is None
    assert config.read_text(encoding="utf-8").count("[mcp_servers." + name + "]") == 1
    passed.append("custom settings/comments retained; actual client catalog and status; unrelated MCP disabled")

    record["stage"] = "prepared"
    record["pending_from"] = None
    record_path.write_text(json.dumps(record), encoding="utf-8")
    assert execute("install", custom, "installed")["changed"] is False
    record_path.write_text(json.dumps(record), encoding="utf-8")
    config.write_text(original, encoding="utf-8")
    assert execute("install", custom, "installed")["changed"] is True
    config.write_text(original, encoding="utf-8")
    assert execute("repair", custom, "installed")["client_tools_verified"] is True
    passed.append("interrupted before/after config dispatch; missing entry repair")

    installed_config = config.read_text(encoding="utf-8")
    with config.open("a", encoding="utf-8") as stream:
        stream.write("\n[mcp_servers." + name + ".env]\nSYNTHETIC_USER_EDIT = \"preserve\"\n")
    drift_hash = digest(config)
    for action in ("install", "repair", "uninstall"):
        execute(action, custom, code="config_drift")
        assert digest(config) == drift_hash, "drift was overwritten"
    config.write_text(installed_config, encoding="utf-8")
    passed.append("config drift never overwritten or deleted")

    rpc = CodexRPC(codex, profile, env)
    try:
        read = rpc.call("config/read", {"includeLayers": True, "cwd": str(project)})
        layer = next(entry for entry in read["layers"] if entry["name"]["type"] == "user" and not entry["name"].get("profile"))
        current = config.read_text(encoding="utf-8")
        changed = current.replace('model_reasoning_effort = "high"', 'model_reasoning_effort = "medium"')
        assert changed != current, "synthetic concurrent config edit missing"
        config.write_text(changed, encoding="utf-8")
        rpc.call("config/batchWrite", {"filePath": str(config), "expectedVersion": layer["version"],
                                      "reloadUserConfig": False, "edits": [{"keyPath": "mcp_servers." + name,
                                      "mergeStrategy": "replace", "value": layer["config"]["mcp_servers"][name]}]}, error_expected=True)
        assert config.read_text(encoding="utf-8") == changed
        servers = {key: {"enabled": False} for key in layer["config"]["mcp_servers"]}
        servers[name] = layer["config"]["mcp_servers"][name]
        thread = rpc.call("thread/start", {"cwd": str(project), "ephemeral": True, "sandbox": "read-only",
                                           "config": {"mcp_servers": servers}})["thread"]["id"]
        rpc.call("mcpServerStatus/list", {"threadId": thread, "serverName": name, "detail": "toolsAndAuthOnly"})
        visible = project / "visible.txt"
        outside = base / "outside.txt"
        visible.write_text("VISIBLE_SYNTHETIC_CONTENT", encoding="utf-8")
        outside.write_text("OUTSIDE_SYNTHETIC_CANARY", encoding="utf-8")
        for file, blocked in ((visible, False), (outside, True)):
            observed = rpc.call("mcpServer/tool/call", {"threadId": thread, "server": name, "tool": "read_file",
                                                       "arguments": {"path": str(file)}})
            assert bool(observed.get("isError")) == blocked
            if blocked:
                assert "OUTSIDE_SYNTHETIC_CANARY" not in json.dumps(observed)
            else:
                assert "VISIBLE_SYNTHETIC_CONTENT" in json.dumps(observed)
    finally:
        rpc.close()
    passed.append("real Codex conditional config conflict, scoped file call and outside denial; no model turn")

    project.rename(project.with_name("original-project"))
    project.mkdir()
    execute("doctor", custom, code="workspace_changed")
    execute("install", custom, code="workspace_changed")
    record = json.loads(record_path.read_text(encoding="utf-8"))
    record["stage"] = "removing"
    record["pending_from"] = record["desired_entry"]
    record_path.write_text(json.dumps(record), encoding="utf-8")
    execute("uninstall", custom, "uninstalled")
    assert not record_path.exists()
    assert name not in config.read_text(encoding="utf-8")
    assert "fixture_existing" in config.read_text(encoding="utf-8")
    assert "# Preserve this unrelated comment" in config.read_text(encoding="utf-8")
    assert 'model_reasoning_effort = "medium"' in config.read_text(encoding="utf-8")
    execute("uninstall", custom, "not_installed")
    passed.append("replaced project refused; interrupted uninstall keeps unrelated/concurrent settings")

    return {"state": "passed", "platform": sys.platform, "codex_version": client_version,
            "native_binary_sha256": digest(binary), "scenarios": passed,
            "source_model_calls": 0, "target_model_turns": 0, "real_user_config_changed": False,
            "unverified": ["real macOS host", "WSL", "Claude", "ChatGPT web activation", "cross-agent continuation"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=pathlib.Path, required=True)
    parser.add_argument("--codex", type=pathlib.Path, required=True)
    parser.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("work"))
    parser.add_argument("--report", type=pathlib.Path)
    args = parser.parse_args()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    fixture = pathlib.Path(tempfile.mkdtemp(prefix="codex-local-setup-", dir=work))
    try:
        result = run_smoke(args.binary.resolve(), args.codex.resolve(), fixture)
        rendered = json.dumps(result, indent=2)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(rendered + "\n", encoding="utf-8")
        print(rendered)
    finally:
        # Delete only this generated fixture, after checking the resolved target.
        resolved = fixture.resolve()
        if resolved.parent == work and resolved.name.startswith("codex-local-setup-") and not fixture.is_symlink():
            shutil.rmtree(resolved)


if __name__ == "__main__":
    main()
