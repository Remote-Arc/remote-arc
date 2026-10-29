"""A task-local stdio MCP client. Returns observations, never a fabricated scene receipt."""
import argparse
import asyncio
import json
import os
import pathlib
import sys
from datetime import timedelta
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ALLOWED = {'get_scene_info', 'execute_blender_code'}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True, type=int)
    parser.add_argument('--request')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise ValueError('Invalid loopback port')
    request = json.loads(pathlib.Path(args.request).read_text(encoding='utf-8')) if args.request else None
    if request:
        if request.get('tool') not in ALLOWED or not isinstance(request.get('arguments', {}), dict):
            raise ValueError('Only local scene inspection and Blender code are supported')
        if request['tool'] == 'execute_blender_code' and not request['arguments'].get('user_prompt', '').strip():
            raise ValueError('Include the user\'s actual request in user_prompt')
    env = {**os.environ, 'DISABLE_TELEMETRY': 'true', 'BLENDER_MCP_SAFE_MODE': '1', 'BLENDER_HOST': '127.0.0.1', 'BLENDER_PORT': str(args.port)}
    parameters = StdioServerParameters(command=sys.executable, args=['-m', 'blender_mcp.server', '--host', '127.0.0.1', '--port', str(args.port)], env=env)
    async with asyncio.timeout(210):
        async with stdio_client(parameters) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=180)) as session:
                initialized = await session.initialize()
                tools = await session.list_tools()
                supported = [tool for tool in tools.tools if tool.name in ALLOWED]
                if request:
                    if request['tool'] not in {tool.name for tool in supported}:
                        raise ValueError('The requested tool is unavailable in this server version')
                    result = await session.call_tool(request['tool'], request.get('arguments', {}))
                    text = '\n'.join(getattr(item, 'text', '') for item in result.content)
                    if result.isError or any(text.lstrip().startswith(prefix) for prefix in ['Error', 'Rejected by safe mode', 'Failed']):
                        raise RuntimeError(text[:4000])
                    output = {'status': 'observed', 'server': initialized.serverInfo.model_dump(), 'tool': request['tool'], 'content': text, 'meaning': 'Inspect this actual tool observation; verify saved files or rendered outputs separately.'}
                else:
                    output = {'status': 'connected', 'server': initialized.serverInfo.model_dump(), 'tools': [tool.model_dump(exclude_none=True) for tool in supported], 'meaning': 'MCP handshake and discovery completed. Read get_scene_info to check the Blender addon; no artwork is complete.'}
                print(json.dumps(output, ensure_ascii=False))

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({'status': 'failed', 'message': str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
