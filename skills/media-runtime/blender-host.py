"""Run the pinned Blender addon in an isolated GUI instance, without global registration."""
import importlib.util
import json
import os
import pathlib
import sys
import bpy

config = json.loads(pathlib.Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf-8'))
if bpy.app.background:
    raise RuntimeError('Blender MCP requires the GUI event loop; background rendering is separate.')
os.environ['DISABLE_TELEMETRY'] = 'true'
if hasattr(bpy.context.preferences.filepaths, 'use_save_last_session'):
    bpy.context.preferences.filepaths.use_save_last_session = False
for directory in config['sites']:
    if directory not in sys.path:
        sys.path.append(directory)
spec = importlib.util.spec_from_file_location('ra_blender_addon', config['addon'])
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
# No register(): no preferences, external asset providers or update-check timers.
# Upstream command dispatch expects these Scene RNA toggles even for local tools.
for provider in ('polyhaven', 'hyper3d', 'sketchfab', 'polypizza', 'hunyuan3d'):
    setattr(bpy.types.Scene, 'blendermcp_use_' + provider, bpy.props.BoolProperty(default=False))
server = addon.BlenderMCPServer(host='127.0.0.1', port=config['port'])
server.start()
if not server.running or server.socket is None:
    raise RuntimeError('Blender addon could not bind its loopback port.')
session = pathlib.Path(config['session'])
(session / 'status.json').write_text(json.dumps({'status': 'ready', 'pid': os.getpid(), 'port': config['port'], 'host': '127.0.0.1', 'blender': bpy.app.version_string}), encoding='utf-8')

def poll_stop():
    if (session / 'stop.request').exists():
        server.stop()
        (session / 'status.json').write_text(json.dumps({'status': 'stopped', 'pid': os.getpid()}), encoding='utf-8')
        bpy.ops.wm.quit_blender()
        return None
    return 0.5

bpy.app.timers.register(poll_stop, first_interval=0.5)
