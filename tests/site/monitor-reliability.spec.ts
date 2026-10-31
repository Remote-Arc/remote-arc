import {test,expect} from './fixtures';
const counts={connections:30,disconnects:25,heartbeats:80,observedDevices:3,reconnects:27,reconnectingDevices:3};
const observed={coverage:'observed',scope:'multiple_devices',windows:[15,60,1440].map(minutes=>({minutes,counts})),
  groups:[{platform:'win32',agentVersion:'0.6.5-rc.1',...counts}],groupsTruncated:false,
  trend:[{minute:'2026-10-31T00:00:00.000Z',connections:30,disconnects:25,heartbeats:80}],
  signal:{phase:'firing',last_evaluated_at:'2026-10-31T00:00:00.000Z',last_notification_at:null}};
for(const scenario of ['observed','single','unavailable','no_samples'])test('Monitor reliability: '+scenario,async({page},testInfo)=>{
  const zh=testInfo.project.metadata.language==='zh';
  const data=scenario==='observed'?observed:scenario==='single'?{...observed,scope:'single_device',signal:{...observed.signal,phase:'healthy'}}:{...observed,coverage:scenario};
  let reads=0;
  await page.route('**/api/monitor',route=>{reads++;return route.fulfill({json:{deviceReliability:data}});});
  await page.addInitScript(()=>{(window as Window&{monitorTestFetch?:typeof fetch}).monitorTestFetch=window.fetch.bind(window);});
  await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();
  await page.addScriptTag({type:'module',url:'/scripts/monitor-reliability-browser-fixture.tsx'});
  const panel=page.locator('#monitor-browser-fixture');
  if(scenario==='observed'){
    await expect(panel).toContainText(zh?'持续重连异常':'Sustained reconnect anomaly');
    await expect(panel).toContainText(zh?'不能确认平台故障':'does not prove a platform outage');
    await expect(panel.getByRole('table').first()).toContainText('24h');
    await panel.locator('summary').click();await expect(panel.locator('details table')).toBeVisible();
  }else if(scenario==='single')await expect(panel).toContainText(zh?'集中在单台设备':'isolated to one device');
  else{
    await expect(panel).toContainText(scenario==='unavailable'?(zh?'连接指标暂不可用':'telemetry is unavailable'):(zh?'近期没有连接观测':'No recent connection observations'));
    await expect(panel.getByRole('table')).toHaveCount(0);
  }
  expect(reads,'The monitor does not poll or send mutations').toBe(1);
  const widths=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport+1);
});
