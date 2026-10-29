/** What Arc (Slack, Agent Workspace and scheduled runs) knows about computer
 * tools. One entry per device tool: the prompt lists only tools that the
 * user's devices actually have, so a new device tool reaches Arc by adding a
 * line here rather than by editing every prompt. Limits must match
 * arc-device-tools.ts schemas. */
export const ARC_DEVICE_TOOL_GUIDE:Readonly<Record<string,string>>={
 list_agent_sessions:'{source?:"codex"|"claude"|"all",workspace?,limit?:1..50,git?:boolean} Codex / Claude Code tasks on that computer: each session\'s working directory or worktree, last activity, branch, uncommitted changes and other worktrees. Use first for questions about coding-agent tasks, worktrees or progress.',
 list_processes:'{filter?,limit?:1..1000,details?:boolean} running programs with a header; filter by name (e.g. "codex", "claude", "node"); details:true adds command lines on Windows.',
 list_directory:'{path,depth?:1..6}',
 get_file_info:'{path} size, type and modified time.',
 read_file:'{path,offset?,length?:1..1200} text by line range (offset is a line number, negative reads from the end). The header shows total lines; continue with the next offset for long files.',
 read_binary_file:'{path,offset?,length?:1..262144} base64 byte chunk for images and other binaries.',
 write_file:'{path,content,mode?:"rewrite"|"append"} chunk large files, then read back.',
 edit_block:'{file_path,old_string,new_string,expected_replacements?}',
 undo_last_change:'{} revert the most recent Remote Arc file change on that computer.',
 start_process:'{command,cwd?,background?:true,timeout_ms?:1..120000} shell: cmd.exe on Windows (wrap PowerShell as powershell -NoProfile -Command "..."), /bin/sh on macOS/Linux. Use background:true for anything over ~20 s.',
 process_status:'{process_id,wait_ms?:0..40000,until_text?} wait locally for output/completion instead of sleeping and polling.',
 process_output:'{process_id,cursor?,max_bytes?}',
 stop_process:'{process_id}',
 browser_runner_start:'{task_id,allowed_origins:[...],start_url?} start or resume a task browser limited to those sites.',
 browser_runner_snapshot:'{session_id,max_elements?,max_text?} read the page with element refs.',
 browser_runner_act:'{session_id,action,snapshot_id?,ref?,value?,fields?,url?,key?,path?,effect?,idempotency_key?} click/fill/select/press/upload/navigate/wait/fill_form; final submits need effect:"submit" and an idempotency_key.',
 browser_runner_wait:'{session_id,until:"user_done"|"page_change"|"text"|"url_contains"|"upload_done"|"idle",text?,url_contains?,timeout_ms?:1000..40000} wait without polling; finishing a handoff does not confirm or retry a submit.',
 browser_runner_status:'{session_id?} saved checkpoint, or open tasks when omitted.',
 browser_runner_confirm:'{session_id,idempotency_key,outcome,evidence} settle an unverified submit with on-page evidence.',
 browser_runner_close:'{session_id,forget?,force?,reason?} pending handoff or submit requires force:true and an explicit abandonment reason.',
};

// Tools used only by the dashboard or the agent itself.
const INTERNAL=new Set(['browse_directories','list_undo_actions','undo_change','list_managed_processes','goal_workspace','set_task_keep_awake','background_agent_status','set_background_agent','agent_execution_log','set_device_runtime']);

type DeviceRow={id:string;name:string;platform:string;status?:string;tools?:string[];available_tools?:string[];allowed_tools?:string[];workspace_roots?:string[];agent_version?:string|null;last_seen?:string|null};

/** Compact, model-friendly device list: what each computer can do right now. */
export function compactArcDevices(devices:readonly DeviceRow[]){
 return devices.slice(0,8).map(device=>{
  const tools=(device.tools||device.available_tools||device.allowed_tools||[]).filter(tool=>!INTERNAL.has(tool));
  return{id:device.id,name:String(device.name||'').slice(0,80),platform:device.platform,status:device.status||'unknown',tools,
   ...(device.workspace_roots?.length?{workspaceRoots:device.workspace_roots.slice(0,6)}:{}),
   ...(device.agent_version?{agentVersion:device.agent_version}:{}),...(device.last_seen?{lastSeen:device.last_seen}:{})};
 });
}

/** device_tool usage for the tools present on the user's computers. Unknown
 * tools a device advertises are still listed so Arc can learn their schema
 * from the first validation error. */
export function arcDeviceToolGuide(devices:ReturnType<typeof compactArcDevices>){
 const present=new Set(devices.flatMap(device=>device.tools));
 if(!present.size)return 'device_tool: no computer tools are available yet. If the task needs a computer, say which permission or device is missing.';
 const known=Object.keys(ARC_DEVICE_TOOL_GUIDE).filter(tool=>present.has(tool)).map(tool=>`${tool} ${ARC_DEVICE_TOOL_GUIDE[tool]}`);
 const other=[...present].filter(tool=>!(tool in ARC_DEVICE_TOOL_GUIDE)).sort();
 return `device_tool {deviceId,tool,arguments} on a device from devices whose tools include it. Inner tools:\n- ${known.join('\n- ')}${other.length?`\n- also available: ${other.join(', ')} (read the schema from the first validation error)`:''}`;
}
