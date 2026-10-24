import subprocess
import sys
from pathlib import Path

mode = sys.argv[1]
root = Path(__file__).resolve().parents[1]
folder = "apps/agent/internal/browserrunner/"
for name in ("launch.go", "view.go", "session.go"):
    relative = folder + name
    (root / relative).write_text(subprocess.check_output(["git", "show", "HEAD:" + relative], cwd=root, text=True))

if mode == "legacy-surface-no-reacquire":
    p = root / (folder + "launch.go")
    source = p.read_text()
    source = source.replace('CalculateNativeWinOcclusion"', 'CalculateNativeWinOcclusion,CDPScreenshotNewSurface"')
    source = source.replace('args = append(args, "--enable-features=CDPScreenshotNewSurface")', '// New surface disabled for this diagnostic probe.')
    p.write_text(source)

if mode != "baseline-no-automation":
    p = root / (folder + "view.go")
    source = p.read_text()
    start = source.index('\t\tif runtime.GOOS == "darwin" && s.hasWindow() && s.cp.Headless {')
    end = source.index('\n\t\ts.ev.Lock()', start)
    source = source[:start] + source[end:]
    source = source.replace('\n\t"runtime"', '')
    if mode == "native-only-no-reacquire":
        source = source.replace('"fromSurface": true', '"fromSurface": false')
        source = source.replace('"Page.startScreencast", map[string]any', '"Page.enable", map[string]any')
    p.write_text(source)

if mode == "focus-after-hide-no-reacquire":
    p = root / (folder + "session.go")
    source = p.read_text()
    call = '\t_ = s.conn.Call(ctx, "Emulation.setFocusEmulationEnabled", map[string]any{"enabled": true}, nil)\n'
    assert source.count(call) == 1
    source = source.replace(call, "", 1)
    source = source.replace('\tif s.cp.ResumeURL != ""', call + '\tif s.cp.ResumeURL != ""', 1)
    p.write_text(source)

subprocess.run(["gofmt", "-w"] + [folder + x for x in ("launch.go", "view.go", "session.go")], cwd=root, check=True)
print("CAPTURE_PROBE", mode, "automation=false", flush=True)
