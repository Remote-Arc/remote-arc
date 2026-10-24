import os
import subprocess
import sys
from pathlib import Path

mode = sys.argv[1]
root = Path(__file__).resolve().parents[1]
files = ["launch.go", "view.go", "session.go"]
folder = "apps/agent/internal/browserrunner/"
for filename in files:
    relative = folder + filename
    (root / relative).write_text(subprocess.check_output(["git", "show", "HEAD:" + relative], cwd=root, text=True))

p = root / (folder + "launch.go")
source = p.read_text().replace('"--disable-sync",', '"--disable-sync",\n\t\t"--enable-automation",')
if mode == "legacy-surface":
    source = source.replace('CalculateNativeWinOcclusion"', 'CalculateNativeWinOcclusion,CDPScreenshotNewSurface"')
    source = source.replace('args = append(args, "--enable-features=CDPScreenshotNewSurface")', '// New surface disabled for this diagnostic probe.')
elif mode in ("no-gpu-vsync", "no-gpu-vsync-allstages"):
    extra = '"--disable-gpu-vsync",'
    if mode == "no-gpu-vsync-allstages":
        extra += '\n\t\t"--run-all-compositor-stages-before-draw",'
    source = source.replace('"--disable-background-timer-throttling",', '"--disable-background-timer-throttling",\n\t\t' + extra)
elif mode == "all-compositor-stages":
    source = source.replace('"--disable-background-timer-throttling",', '"--disable-background-timer-throttling",\n\t\t"--run-all-compositor-stages-before-draw",')
p.write_text(source)

p = root / (folder + "view.go")
source = p.read_text()
if mode == "native-only":
    source = source.replace('"fromSurface": true', '"fromSurface": false')
    source = source.replace('"Page.startScreencast", map[string]any', '"Page.enable", map[string]any')
elif mode == "screencast-1-only":
    source = source.replace('"everyNthFrame": 2', '"everyNthFrame": 1')
    source = source.replace('needFrame := s.viewActive', 'needFrame := false && s.viewActive')
elif mode == "screencast-1":
    source = source.replace('"everyNthFrame": 2', '"everyNthFrame": 1')
p.write_text(source)

if mode == "focus-after-hide":
    p = root / (folder + "session.go")
    source = p.read_text()
    call = '\t_ = s.conn.Call(ctx, "Emulation.setFocusEmulationEnabled", map[string]any{"enabled": true}, nil)\n'
    assert source.count(call) == 1
    source = source.replace(call, "", 1)
    marker = '\tif s.cp.ResumeURL != ""'
    source = source.replace(marker, call + marker, 1)
    p.write_text(source)

subprocess.run(["gofmt", "-w"] + [folder + x for x in files], cwd=root, check=True)
print("CAPTURE_PROBE", mode, flush=True)
