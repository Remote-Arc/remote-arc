type Env = { DB: D1Database };
type Counts = { connections:number; disconnects:number; heartbeats:number; observedDevices:number; connectingDevices:number; reconnectingDevices:number; reconnects:number };
type Group = Counts & { platform:string; agentVersion:string };
type SignalState = {
  phase:'healthy'|'pending'|'firing'|'recovering'; unhealthy_since:string|null; healthy_since:string|null;
  last_evaluated_at:string; last_notification_at:string|null; notified_phase:'healthy'|'firing'|null;
};
export const RELIABILITY_POLICY = { windowMinutes:15, reconnects:10, reconnectingDevices:3, sustainedMinutes:5, recoveryMinutes:5, cooldownMinutes:10, observationGapMinutes:12 };
/** Agents send hello every 30 s; one observation per five minutes is enough for the 15-minute signal. */
export const HEARTBEAT_INTERVAL_MS = 5*60000;
export type DeviceReliability = {
  coverage:'observed'|'no_samples'|'unavailable'; scope:'none'|'single_device'|'multiple_devices';
  policy:typeof RELIABILITY_POLICY; windows:{ minutes:number; counts:Counts }[]; groups:Group[];
  groupsTruncated:boolean; trend:{minute:string;connections:number;disconnects:number;heartbeats:number}[];
  signal:SignalState|null;
};
const emptyCounts = ():Counts => ({connections:0,disconnects:0,heartbeats:0,observedDevices:0,connectingDevices:0,reconnectingDevices:0,reconnects:0});
export const unavailableReliability = ():DeviceReliability => ({coverage:'unavailable',scope:'none',policy:RELIABILITY_POLICY,windows:[],groups:[],groupsTruncated:false,trend:[],signal:null});

/** Called only with the socket's authenticated owner/device identity. Device metadata is untrusted. */
export async function recordDeviceConnection(env:Env,userId:string,deviceId:string,kind:'connected'|'disconnected'|'heartbeat',metadata:{platform?:unknown;agentVersion?:unknown},now=Date.now()) {
  const platform = typeof metadata.platform==='string' && ['win32','darwin','linux','browser'].includes(metadata.platform) ? metadata.platform : 'unknown';
  // The browser extension reports browser-<version>; its platform label already says so.
  const reported = typeof metadata.agentVersion==='string' ? metadata.agentVersion.replace(/^browser-/,'') : '';
  const version = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-(?:rc|beta|alpha)(?:\.\d{1,5}){1,3})?$/.test(reported) ? reported : 'unknown';
  const bucket = new Date(Math.floor(now/60000)*60000).toISOString();
  try {
    await env.DB.prepare(`INSERT INTO device_connection_buckets(bucket_start,device_id,platform,agent_version,connects,disconnects,heartbeats)
      SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM devices WHERE id=?2 AND user_id=?8 AND revoked_at IS NULL)
      ON CONFLICT(bucket_start,device_id) DO UPDATE SET
      connects=MIN(60,connects+excluded.connects),disconnects=MIN(60,disconnects+excluded.disconnects),heartbeats=MIN(60,heartbeats+excluded.heartbeats)`)
      .bind(bucket,deviceId,platform,version,kind==='connected'?1:0,kind==='disconnected'?1:0,kind==='disconnected'?0:1,userId).run();
  } catch { console.warn('device_reliability_write_failed'); }
}

const countColumns = `COALESCE(SUM(connections),0) connections,COALESCE(SUM(disconnects),0) disconnects,
  COALESCE(SUM(heartbeats),0) heartbeats,COUNT(*) observedDevices,
  COALESCE(SUM(CASE WHEN connections>0 THEN 1 ELSE 0 END),0) connectingDevices,
  COALESCE(SUM(CASE WHEN connections>=3 THEN 1 ELSE 0 END),0) reconnectingDevices,
  COALESCE(SUM(MAX(0,connections-1)),0) reconnects`;
const perDevice = `SELECT b.device_id,b.platform,b.agent_version,SUM(b.connects) connections,SUM(b.disconnects) disconnects,SUM(b.heartbeats) heartbeats
  FROM device_connection_buckets b JOIN devices d ON d.id=b.device_id AND d.revoked_at IS NULL
  WHERE b.bucket_start>=?1 AND b.bucket_start<=?2 GROUP BY b.device_id,b.platform,b.agent_version`;

export async function readDeviceReliability(env:Env,now=Date.now()):Promise<DeviceReliability> {
  try {
    const end=new Date(now).toISOString(),since=(minutes:number)=>new Date(Math.floor(now/60000)*60000-(minutes-1)*60000).toISOString();
    // Global counts count a device once across upgrades; group counters are per platform/version.
    const windows=await Promise.all([15,60,1440].map(async minutes=>({minutes,counts:await env.DB.prepare(`SELECT ${countColumns} FROM (SELECT device_id,SUM(connections) connections,SUM(disconnects) disconnects,SUM(heartbeats) heartbeats FROM (${perDevice}) GROUP BY device_id)`).bind(since(minutes),end).first<Counts>()||emptyCounts()})));
    const [groups,trend,signal]=await Promise.all([
      env.DB.prepare(`SELECT platform,agent_version agentVersion,${countColumns} FROM (${perDevice}) GROUP BY platform,agent_version ORDER BY reconnects DESC,connections DESC,platform,agent_version LIMIT 21`).bind(since(15),end).all<Group>(),
      env.DB.prepare(`SELECT b.bucket_start minute,SUM(b.connects) connections,SUM(b.disconnects) disconnects,SUM(b.heartbeats) heartbeats FROM device_connection_buckets b JOIN devices d ON d.id=b.device_id AND d.revoked_at IS NULL WHERE b.bucket_start>=?1 AND b.bucket_start<=?2 GROUP BY b.bucket_start ORDER BY b.bucket_start LIMIT 61`).bind(since(60),end).all<DeviceReliability['trend'][number]>(),
      env.DB.prepare("SELECT phase,unhealthy_since,healthy_since,last_evaluated_at,last_notification_at,notified_phase FROM service_reliability_state WHERE signal='device_reconnect_churn'").first<SignalState>(),
    ]);
    const counts=windows[0]!.counts;
    return {coverage:counts.observedDevices?'observed':'no_samples',scope:counts.reconnectingDevices>1?'multiple_devices':counts.reconnectingDevices===1?'single_device':'none',policy:RELIABILITY_POLICY,windows,groups:groups.results.slice(0,20),groupsTruncated:groups.results.length>20,trend:trend.results,signal};
  } catch { return unavailableReliability(); }
}

export type ReliabilityNotification = { phase:'firing'|'healthy'; counts:Counts; at:string };
export async function evaluateDeviceReliability(env:Env,snapshot:DeviceReliability,notify?: (input:ReliabilityNotification)=>Promise<void>,now=Date.now()) {
  // Missing migrations, telemetry or observations can never prove recovery.
  if(snapshot.coverage!=='observed')return;
  const at=new Date(now).toISOString(),counts=snapshot.windows[0]!.counts;
  const unhealthy=counts.reconnects>=RELIABILITY_POLICY.reconnects&&counts.reconnectingDevices>=RELIABILITY_POLICY.reconnectingDevices;
  await env.DB.prepare("INSERT OR IGNORE INTO service_reliability_state(signal,phase,last_evaluated_at) VALUES('device_reconnect_churn','healthy','1970-01-01T00:00:00.000Z')").run();
  const current=await env.DB.prepare("SELECT * FROM service_reliability_state WHERE signal='device_reconnect_churn'").first<SignalState>();
  if(!current||now-Date.parse(current.last_evaluated_at)<240000)return;
  let phase:SignalState['phase'],unhealthySince=current.unhealthy_since,healthySince=current.healthy_since;
  // A sustained window must be observed throughout, so a gap starts it again.
  if(now-Date.parse(current.last_evaluated_at)>RELIABILITY_POLICY.observationGapMinutes*60000)unhealthySince=healthySince=null;
  if(unhealthy){
    unhealthySince??=at;healthySince=null;
    phase=current.phase==='firing'||current.phase==='recovering'||now-Date.parse(unhealthySince)>=RELIABILITY_POLICY.sustainedMinutes*60000?'firing':'pending';
  }else{
    unhealthySince=null;
    if(current.phase==='firing'||current.phase==='recovering'){
      healthySince??=at;phase=now-Date.parse(healthySince)>=RELIABILITY_POLICY.recoveryMinutes*60000?'healthy':'recovering';
    }else{phase='healthy';healthySince=null;}
  }
  // Compare-and-swap fences overlapping cron deliveries; admin reads never evaluate/send.
  const changed=await env.DB.prepare(`UPDATE service_reliability_state SET phase=?1,unhealthy_since=?2,healthy_since=?3,last_evaluated_at=?4
    WHERE signal='device_reconnect_churn' AND last_evaluated_at=?5 RETURNING signal`).bind(phase,unhealthySince,healthySince,at,current.last_evaluated_at).first();
  if(!changed||!notify)return;
  // One alert per incident. A delivery that was not confirmed retries after the cooldown.
  const desired=phase==='firing'&&current.notified_phase!=='firing'?'firing':phase==='healthy'&&current.notified_phase==='firing'?'healthy':null;
  if(!desired)return;
  const claimed=await env.DB.prepare(`UPDATE service_reliability_state SET last_notification_at=?1 WHERE signal='device_reconnect_churn'
    AND last_evaluated_at=?1 AND (last_notification_at IS NULL OR last_notification_at<=?2) RETURNING signal`)
    .bind(at,new Date(now-RELIABILITY_POLICY.cooldownMinutes*60000).toISOString()).first();
  if(!claimed)return;
  // Claim before delivery. A send error can be ambiguous, so never immediately replay it.
  try{
    await notify({phase:desired,counts,at});
    await env.DB.prepare("UPDATE service_reliability_state SET notified_phase=?1 WHERE signal='device_reconnect_churn' AND last_notification_at=?2").bind(desired,at).run();
  }catch{console.warn('device_reliability_alert_delivery_unknown');}
}

export async function purgeDeviceReliability(env:Env,now=Date.now()) {
  await env.DB.prepare(`DELETE FROM device_connection_buckets WHERE (bucket_start,device_id) IN
    (SELECT bucket_start,device_id FROM device_connection_buckets WHERE bucket_start<?1 ORDER BY bucket_start LIMIT 5000)`)
    .bind(new Date(now-30*86400000).toISOString()).run();
}
