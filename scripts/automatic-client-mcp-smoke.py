#!/usr/bin/env python3
"""Real native clients + ordinary device startup, with synthetic profiles/Relay only.

No model turns, account login, real device credentials or developer config writes.
Requires installed native Codex and Claude Code binaries; this is not a CI fake.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
import pathlib
import queue
import struct
import subprocess
import tempfile
import threading
import time

from urllib.request import Request, urlopen


def options():
    return {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execute(command, env, cwd):
    p = subprocess.run([str(x) for x in command], cwd=cwd, env=env, capture_output=True,
                       text=True, encoding="utf-8", timeout=40, **options())
    assert p.returncode == 0, "command failed; private client diagnostics omitted"
    return p.stdout


def recv_frame(stream):
    header = stream.read(2)
    if len(header) != 2:
        return None
    opcode, size = header[0] & 15, header[1] & 127
    if size == 126:
        size = struct.unpack("!H", stream.read(2))[0]
    elif size == 127:
        size = struct.unpack("!Q", stream.read(8))[0]
    assert size < 2 * 1024 * 1024, "oversized synthetic frame"
    mask = stream.read(4) if header[1] & 128 else None
    body = stream.read(size)
    if mask:
        body = bytes(c ^ mask[i % 4] for i, c in enumerate(body))
    if opcode == 8:
        return None
    return json.loads(body) if opcode == 1 else {}


class Relay(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, fixture):
        self.fixture = fixture
        self.messages = queue.Queue()
        super().__init__(("127.0.0.1", 0), RelayHandler)


class RelayHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path != "/agent":
            self.send_response(204)
            self.end_headers()
            return
        self.connection.settimeout(40)
        key = self.headers["Sec-WebSocket-Key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", base64.b64encode(hashlib.sha1(key.encode()).digest()).decode())
        self.end_headers()
        self.wfile.flush()
        try:
            hello = recv_frame(self.rfile)
            self.server.messages.put(("hello", time.monotonic(), hello))
            message = json.dumps({"type": "call", "id": "read-smoke", "tool": "read_file",
                                  "arguments": {"path": str(self.server.fixture / "visible.txt")}}).encode()
            self.wfile.write(bytes([0x81, 126]) + struct.pack("!H", len(message)) + message)
            self.wfile.flush()
            while True:
                message = recv_frame(self.rfile)
                if message is None:
                    return
                if message.get("id") == "read-smoke":
                    self.server.messages.put(("read", time.monotonic(), message))
        except (OSError, ValueError):
            return


def ordinary_start(binary, env, fixture, should_skip=False):
    relay = Relay(fixture)
    threading.Thread(target=relay.serve_forever, daemon=True).start()
    state = pathlib.Path(env["REMOTEARC_HOME"]) / ".remotearc"
    state.mkdir(parents=True, exist_ok=True)
    (state / "config.json").write_text(json.dumps({"deviceId": "synthetic-device", "deviceToken": "synthetic-only",
        "deviceName": "synthetic-device", "origin": "http://127.0.0.1:" + str(relay.server_port), "mode": "safe"}), encoding="utf-8")
    log = fixture / ("failure-start.log" if should_skip else "normal-start.log")
    started = time.monotonic()
    with log.open("wb") as output:
        process = subprocess.Popen([str(binary), "--foreground", "--safe"], cwd=fixture, env=env,
                                   stdin=subprocess.DEVNULL, stdout=output, stderr=output, **options())
        try:
            kind, connected, hello = relay.messages.get(timeout=5)
            assert kind == "hello" and hello["type"] == "hello" and len(hello["tools"]) == 13
            kind, _, reply = relay.messages.get(timeout=5)
            assert kind == "read" and not reply.get("error") and "synthetic-file-ok" in json.dumps(reply)
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                text = log.read_text(encoding="utf-8", errors="replace")
                notice = "automatic MCP setup skipped" if should_skip else "Remote Arc MCP registered"
                if text.count(notice) >= 2:
                    break
                assert process.poll() is None, "optional client setup stopped the core agent"
                time.sleep(0.05)
            else:
                raise AssertionError("automatic integration notices missing")
            assert process.poll() is None, "device agent stopped after optional setup"
            # Stop only this fixture's authenticated loopback server. Never
            # modify global startup/launchd/registry registrations during smoke.
            endpoint = json.loads((state / "agent" / "control.json").read_text(encoding="utf-8"))
            assert endpoint["url"].startswith("http://127.0.0.1:") and endpoint["pid"] == process.pid
            with urlopen(Request(endpoint["url"] + "/stop", data=b"", headers={"Authorization": "Bearer " + endpoint["token"]}), timeout=5):
                pass
            assert process.wait(timeout=5) == 0
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            relay.shutdown()
            relay.server_close()
    return round(connected - started, 3)


def mcp_status(binary, env, cwd):
    """Call the actual installed safe MCP command, without a model client turn."""
    p = subprocess.Popen([str(binary), "--mcp", "--safe"], cwd=cwd, env=env, stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", **options())
    responses = queue.Queue()

    def read():
        for line in p.stdout:
            responses.put(json.loads(line))

    threading.Thread(target=read, daemon=True).start()

    def call(seq, method, params):
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": seq, "method": method, "params": params}) + "\n")
        p.stdin.flush()
        while True:
            message = responses.get(timeout=10)
            if message.get("id") == seq:
                assert "error" not in message, "safe MCP request failed"
                return message["result"]

    try:
        call(1, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                               "clientInfo": {"name": "synthetic-auto-setup-smoke", "version": "1"}})
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        p.stdin.flush()
        tools = call(2, "tools/list", {})["tools"]
        assert "remote_arc_status" in {t["name"] for t in tools}
        result = call(3, "tools/call", {"name": "remote_arc_status", "arguments": {}})
        status = json.loads(result["content"][0]["text"])
        assert status["engine"] == "go" and status["mode"] == "safe"
        return len(tools)
    finally:
        p.stdin.close()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait(timeout=5)
        p.stdout.close()


def run(binary, codex, claude, base):
    def fixture(name):
        root = base / name
        for child in ("codex", "claude", "arc"):
            (root / child).mkdir(parents=True)
        (root / "visible.txt").write_text("synthetic-file-ok", encoding="utf-8")
        env = dict(os.environ)
        for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "CHATGPT_AUTH_TOKEN", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDECODE"):
            env.pop(key, None)
        env.update(CODEX_HOME=str(root / "codex"), CLAUDE_CONFIG_DIR=str(root / "claude"), REMOTEARC_HOME=str(root / "arc"),
                   PATH=os.pathsep.join((str(codex.parent), str(claude.parent), env.get("PATH", ""))),
                   DISABLE_AUTOUPDATER="1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1")
        return root, env

    fresh, env = fixture("fresh")
    connected = ordinary_start(binary, env, fresh)
    codex_config = fresh / "codex" / "config.toml"
    claude_config = fresh / "claude" / ".claude.json"
    bindings = json.loads(claude_config.read_text(encoding="utf-8"))["mcpServers"]
    assert len(bindings) == 1 and bindings["remote_arc"]["args"] == ["--mcp", "--safe"]
    pinned = pathlib.Path(bindings["remote_arc"]["command"])
    assert pinned.is_file() and digest(pinned) == digest(binary) and str(pinned) in codex_config.read_text(encoding="utf-8").replace("\\\\", "\\")
    tools = mcp_status(pinned, env, fresh)
    hashes = (digest(codex_config), digest(claude_config))
    repeated = json.loads(execute([binary, "setup", "auto"], env, fresh))["clients"]
    assert len(repeated) == 2 and all(r["status"] == "already_registered" for r in repeated)
    assert hashes == (digest(codex_config), digest(claude_config)), "repeat setup changed existing config"
    doctors = {}
    for client in ("codex", "claude"):
        r = json.loads(execute([binary, "setup", "doctor", "--global", "--agent", client], env, fresh))["clients"][0]
        assert r["status"] == "healthy" and r["client_connection_verified"]
        assert r["client_tools_verified"] == (client == "codex")
        doctors[client] = r
    for client in ("codex", "claude"):
        r = json.loads(execute([binary, "setup", "uninstall", "--global", "--agent", client], env, fresh))["clients"][0]
        assert r["status"] == "uninstalled"

    custom, env = fixture("custom")
    codex_config, claude_config = custom / "codex" / "config.toml", custom / "claude" / ".claude.json"
    codex_config.write_text('# existing custom MCP\n[mcp_servers.my_ra]\nurl = "https://mcp.remotearc.app/mcp"\nenabled = false\n', encoding="utf-8")
    claude_config.write_text(json.dumps({"mcpServers": {"my RA": {"type": "http", "url": "https://mcp.remotearc.app/mcp"}}, "theme": "dark"}), encoding="utf-8")
    hashes = digest(codex_config), digest(claude_config)
    repeated = json.loads(execute([binary, "setup", "auto"], env, custom))["clients"]
    assert all(r["status"] == "already_registered" for r in repeated)
    assert hashes == (digest(codex_config), digest(claude_config)), "custom registration was modified"

    failed, env = fixture("invalid-clients")
    (failed / "codex" / "config.toml").write_text("invalid = [", encoding="utf-8")
    (failed / "claude" / ".claude.json").write_text("{", encoding="utf-8")
    failure_connected = ordinary_start(binary, env, failed, should_skip=True)
    return {"native_sha256": digest(binary), "native_version": execute([binary,"--version"],env,failed).strip(), "platform": os.name,
            "codex_version": execute([codex, "--version"], env, failed).strip(),
            "claude_version": execute([claude, "--version"], {**env, "CLAUDE_CONFIG_DIR": str(custom / "claude")}, custom).strip(),
            "normal_start_connected_seconds": connected, "broken_clients_connected_seconds": failure_connected,
            "safe_mcp_tools": tools, "doctor": doctors, "model_turns": 0,
            "passed": ["ordinary startup registers both real native clients in the background",
                       "device connects and executes a read alongside optional setup",
                       "shared durable native MCP command responds without a model",
                       "repeat setup preserves both config file hashes",
                       "custom names and disabled existing Remote Arc entries preserved",
                       "owned uninstall succeeds for both clients",
                       "both invalid client configs leave normal device execution available"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("binary", "codex", "claude"):
        parser.add_argument("--" + name, type=pathlib.Path, required=True)
    parser.add_argument("--report", type=pathlib.Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="remotearc-auto-mcp-smoke-") as directory:
        base = pathlib.Path(directory).resolve()
        assert base.parent == pathlib.Path(tempfile.gettempdir()).resolve() and base.name.startswith("remotearc-auto-mcp-smoke-")
        report = run(args.binary.resolve(), args.codex.resolve(), args.claude.resolve(), base)
    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    print(text)
