import { useRef,useState } from "react";
import { useI18n } from "../../../app/i18n.js";
import { type Device } from "../../../types/app-types.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Per-device management: access, background mode, task policy, processes,
// execution logs and Local Undo.

import { useDeviceActivity } from "./use-device-activity.js";
import { useDeviceSettings } from "./use-device-settings.js";

// Per-device management: which card and panel is open, rename and forget,
// plus the settings and activity actions of each device.
export function useDeviceActions({ devices, tr, refreshAll, showNotice, askConfirm, askPrompt }: { devices: Device[]; tr: Translate; refreshAll: () => Promise<void>; showNotice: DashboardDialogs["showNotice"]; askConfirm: DashboardDialogs["askConfirm"]; askPrompt: DashboardDialogs["askPrompt"] }) {
  const settings = useDeviceSettings({ devices, tr, refreshAll, showNotice, askConfirm, askPrompt });
  const activity = useDeviceActivity({ devices, tr, refreshAll, showNotice, askConfirm, askPrompt });
  const [managedDeviceId, setManagedDeviceId] = useState<string | null>(null);
  const [devicePanel, setDevicePanel] = useState<"access" | "tasks" | "activity">("access");
  const recoveryInFlight=useRef(false);
  const [connectionRecoveryBusyId,setConnectionRecoveryBusyId]=useState<string|null>(null);
  const [connectionRecoveryMessages,setConnectionRecoveryMessages]=useState<Record<string,string>>({});

  async function recoverDeviceConnection(device:Device){
    if(recoveryInFlight.current)return;
    recoveryInFlight.current=true;setConnectionRecoveryBusyId(device.id);
    setConnectionRecoveryMessages(value=>({...value,[device.id]:''}));
    try{
      const response=await fetch('/api/devices/'+encodeURIComponent(device.id)+'/reconnect',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
      if(!response.ok)throw Error('connection check unavailable');
      const value=await response.json() as {state?:string};
      const message=value.state==='connection_present'
        ?tr('A connection signal is present. Check the earlier operation result before retrying; this does not confirm execution.','已收到连接信号。请先核对此前操作结果，再决定是否重试；连接存在不代表执行已恢复。')
        :value.state==='reconnect_requested'
          ?tr('Expired connections cleared. Wake the computer and keep Remote Arc running, then check again. Recovery is not confirmed yet.','已清理过期连接。请唤醒电脑并保持 Remote Arc 运行，再次检查；当前尚未确认恢复。')
          :value.state==='device_unreachable'
            ?tr('Wake this computer and confirm Remote Arc is running, then check again. Remote Arc cannot wake a sleeping computer remotely.','请先唤醒电脑并确认 Remote Arc 正在运行，再次检查。无法从这里远程唤醒休眠电脑。')
            :null;
      if(!message)throw Error('invalid connection observation');
      setConnectionRecoveryMessages(current=>({...current,[device.id]:message}));
      await refreshAll();
    }catch{
      setConnectionRecoveryMessages(value=>({...value,[device.id]:tr('Could not check the connection. Wake the computer, confirm Remote Arc is running, and try again.','暂时无法检查连接。请唤醒电脑、确认 Remote Arc 正在运行后再试。')}));
    }finally{recoveryInFlight.current=false;setConnectionRecoveryBusyId(null);}
  }

  async function revoke(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    const confirmed = await askConfirm(
      tr("Forget this device?", "删除这台设备？"),
      tr(
        (device?.name || "This device") + " will be removed from your Remote Arc account. Local files and software are not deleted. To use this runtime again, run Remote Arc locally and pair it again. Your AI-client authorizations are unchanged.",
        (device?.name || "这台设备") + " 将从 Remote Arc 账户中移除。本机文件和软件不会被删除。如需再次使用这个运行环境，请在本机重新运行 Remote Arc 并重新配对。AI 客户端授权不会受影响。",
      ),
      tr("Forget device", "删除设备"),
      "danger",
    );
    if (!confirmed) return;

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(deviceId) + "/revoke",
      { method: "POST" },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      await showNotice(
        tr("Device was not removed", "设备未删除"),
        payload.error || tr(
          "Remote Arc could not remove this device. Its existing pairing is still active.",
          "Remote Arc 无法删除这台设备，现有配对仍然有效。",
        ),
      );
      return;
    }

    if (managedDeviceId === deviceId) setManagedDeviceId(null);
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = (await askPrompt(
      tr("Rename device", "重命名设备"),
      tr("Choose the name shown throughout your Remote Arc dashboard.", "设置这台设备在 Remote Arc Dashboard 中显示的名称。"),
      device.name,
      tr("Device name", "设备名称"),
    ))?.trim();
    if (!next || next === device.name) return;
    await fetch("/api/devices/" + encodeURIComponent(device.id) + "/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await refreshAll();
  }

  return { ...settings, ...activity, managedDeviceId, setManagedDeviceId, devicePanel, setDevicePanel, revoke, rename,recoverDeviceConnection,connectionRecoveryBusyId,connectionRecoveryMessages };
}

export type DeviceActions = ReturnType<typeof useDeviceActions>;
