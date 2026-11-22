#!/usr/bin/env python3
"""Qualify real, pinned clients against source/native and public npm entry points.

Install clients with npm --ignore-scripts in an isolated prefix first. Never uses
account credentials or a model turn. Published npm tests have no Go override.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen


def windows_worker(command, payload):
    """Contain only this fixture's processes, including orphaned client children.

    The worker waits for stdin before launching clients, so job assignment happens
    before descendants can escape. Do not kill clients by executable name.
    https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
    """
    import ctypes
    from ctypes import wintypes

    class Accounting(ctypes.Structure):
        _fields_ = [(name, ctypes.c_int64) for name in (
            "user_time", "kernel_time", "period_user_time", "period_kernel_time")]
        _fields_ += [(name, wintypes.DWORD) for name in (
            "page_faults", "total_processes", "active_processes", "terminated_processes")]

    api = ctypes.WinDLL("kernel32", use_last_error=True)
    api.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    api.CreateJobObjectW.restype = wintypes.HANDLE
    api.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    api.AssignProcessToJobObject.restype = wintypes.BOOL
    api.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    api.TerminateJobObject.restype = wintypes.BOOL
    api.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int,
                                             ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
    api.QueryInformationJobObject.restype = wintypes.BOOL
    api.CloseHandle.argtypes = [wintypes.HANDLE]
    api.CloseHandle.restype = wintypes.BOOL
    job = api.CreateJobObjectW(None, None)
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())
    process = None
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, encoding="utf-8",
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        if not api.AssignProcessToJobObject(job, int(process._handle)):
            raise ctypes.WinError(ctypes.get_last_error())
        stdout, stderr = process.communicate(json.dumps(payload), timeout=300)
        if process.returncode:
            raise RuntimeError("Client qualification failed:\n" + stderr[-8000:])
        return json.loads(stdout)
    finally:
        try:
            if not api.TerminateJobObject(job, 1):
                raise ctypes.WinError(ctypes.get_last_error())
            deadline = time.monotonic() + 5
            accounting = Accounting()
            while True:
                if not api.QueryInformationJobObject(job, 1, ctypes.byref(accounting),
                                                    ctypes.sizeof(accounting), None):
                    raise ctypes.WinError(ctypes.get_last_error())
                if not accounting.active_processes:
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("Fixture client processes did not stop before directory cleanup")
                time.sleep(0.02)
        finally:
            api.CloseHandle(job)
            if process is not None and process.poll() is None:
                process.kill()  # Also handles failure to assign the waiting worker.
                process.wait(timeout=5)


def worker():
    request = json.load(sys.stdin)  # Parent assigns the job before releasing this gate.
    spec = importlib.util.spec_from_file_location("client_mcp_smoke", pathlib.Path(__file__).with_name("automatic-client-mcp-smoke.py"))
    smoke = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(smoke)
    paths = [pathlib.Path(request[key]) for key in ("binary", "codex", "claude", "directory")]
    discovery = pathlib.Path(request["discovery"]) if request["discovery"] else None
    print(json.dumps(smoke.run(*paths, discovery, request["launcher"])), flush=True)


def main():
    if sys.argv[1:] == ["--worker"]:
        worker()
        return
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("client-prefix", "source-binary", "npm-prefix", "report-dir"):
        parser.add_argument("--" + name, type=pathlib.Path, required=True)
    parser.add_argument("--global-client-prefix", type=pathlib.Path)
    args = parser.parse_args()
    output = args.report_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    modules = args.client_prefix.resolve() / "node_modules"
    cpu = "arm64" if platform.machine().lower() in ("arm64", "aarch64") else "x64"
    target_os = {"win32": "win32", "darwin": "darwin", "linux": "linux"}[sys.platform]
    target = {("win32", "x64"): "x86_64-pc-windows-msvc", ("win32", "arm64"): "aarch64-pc-windows-msvc",
              ("darwin", "x64"): "x86_64-apple-darwin", ("darwin", "arm64"): "aarch64-apple-darwin",
              ("linux", "x64"): "x86_64-unknown-linux-musl", ("linux", "arm64"): "aarch64-unknown-linux-musl"}[(target_os, cpu)]
    suffix = ".exe" if os.name == "nt" else ""
    codex = modules / "@openai" / f"codex-{target_os}-{cpu}" / "vendor" / target / "bin" / ("codex" + suffix)
    claude = modules / "@anthropic-ai" / f"claude-code-{target_os}-{cpu}" / ("claude" + suffix)
    assert codex.is_file() and claude.is_file(), "pinned native client packages are missing"
    npm = args.npm_prefix.resolve() / "node_modules" / "remotelink" / "dist"
    manifest = json.loads((npm / "go-binaries.json").read_text("utf-8"))
    version = manifest["version"]
    asset_os = {"win32": "windows", "darwin": "darwin", "linux": "linux"}[sys.platform]
    arch = "arm64" if cpu == "arm64" else "amd64"
    asset = f"remotelink-v{version}-{asset_os}-{arch}{suffix}"
    public = output / asset
    url = f"https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v{version}/{asset}"
    with urlopen(url, timeout=120) as response:
        data = response.read(100 * 1024 * 1024 + 1)
    assert len(data) <= 100 * 1024 * 1024, "release binary exceeds limit"
    assert hashlib.sha256(data).hexdigest() == manifest["checksums"][asset], "published npm/release SHA256 mismatch"
    public.write_bytes(data)
    public.chmod(0o700)
    spec = importlib.util.spec_from_file_location("client_mcp_smoke", pathlib.Path(__file__).with_name("automatic-client-mcp-smoke.py"))
    smoke = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(smoke)
    node = shutil.which("node")
    assert node, "Node is required to test the public npm entry point"
    cases = [
        ("source-npm-clients", args.source_binary.resolve(), modules / ".bin" if os.name == "nt" else None, None, codex, claude),
        ("public-native", public, None, None, codex, claude),
        ("public-npm", public, None, [node, str(npm / "index.js")], codex, claude),
    ]
    if args.global_client_prefix:
        assert os.name == "nt", "global shim qualification is Windows-specific"
        prefix = args.global_client_prefix.resolve()
        global_modules = prefix / "node_modules"
        global_codex = global_modules / "@openai" / "codex" / "node_modules" / "@openai" / f"codex-win32-{cpu}" / "vendor" / target / "bin" / "codex.exe"
        global_claude = global_modules / "@anthropic-ai" / "claude-code" / "node_modules" / "@anthropic-ai" / f"claude-code-win32-{cpu}" / "claude.exe"
        assert global_codex.is_file() and global_claude.is_file(), "nested global native packages are missing"
        cases.append(("source-global-npm-clients", args.source_binary.resolve(), prefix, None, global_codex, global_claude))
    for name, binary, discovery, launcher, actual_codex, actual_claude in cases:
        with tempfile.TemporaryDirectory(prefix="remotearc-client-qualification-") as directory:
            if os.name == "nt":
                result = windows_worker([sys.executable, str(pathlib.Path(__file__).resolve()), "--worker"], {
                    "binary": str(binary), "codex": str(actual_codex), "claude": str(actual_claude),
                    "directory": str(pathlib.Path(directory).resolve()),
                    "discovery": str(discovery) if discovery else None, "launcher": launcher,
                })
            else:
                result = smoke.run(binary, actual_codex, actual_claude, pathlib.Path(directory).resolve(), discovery, launcher)
        result["qualification_case"] = name
        result["published_version"] = version
        (output / f"{name}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"PASS {name}: {sys.platform}/{cpu}, real Codex and Claude, no model turns", flush=True)


if __name__ == "__main__":
    main()
