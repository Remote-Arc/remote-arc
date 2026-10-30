import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {DeviceRegistry} from '../src/devices/registry.js';
import {callDevice} from '../src/devices/device-call.js';
import {PROCESS_TIMEOUT_GUIDANCE} from '../src/devices/call-timeout.js';
import {classifyExpectedMcpError} from '../src/mcp/mcp-errors.js';

const sent: any[] = [];
let failSend = false;
const socket = {
  deserializeAttachment: () => ({userId:'owner',deviceId:'device',tools:['start_process','read_file']}),
  send(text: string) { if (failSend) throw Error('socket closed'); sent.push(JSON.parse(text)); },
};
const registry = new DeviceRegistry({getWebSockets:()=>[socket]} as unknown as DurableObjectState);
const request = (timeout_ms?: unknown, tool='start_process') => new Request('https://registry/call', {
  method:'POST',headers:{'x-remote-link-user-id':'owner','content-type':'application/json'},
  body:JSON.stringify({deviceId:'device',tool,arguments:{command:'synthetic-only',...(timeout_ms===undefined?{}:{timeout_ms})}}),
});
const reply = (id:string) => registry.webSocketMessage(socket as unknown as WebSocket,JSON.stringify({type:'result',id,result:{exit_code:0}}));
mock.timers.enable({apis:['Date','setTimeout']});
try {
  let observed = false;
  const long = registry.fetch(request(90000)).then(r=>{observed=true;return r;});
  await setImmediate();
  assert.equal(sent.length,1);
  mock.timers.tick(45000);await setImmediate();
  assert.equal(observed,false,'Relay must not abandon a 90 s command at 45 s');
  mock.timers.tick(45000);reply(sent[0].id);
  assert.equal((await long).status,200);
  assert.equal(sent.length,1,'Waiting does not redispatch a command');

  const missing = registry.fetch(request(120000));await setImmediate();
  const missingId = sent[1].id;
  mock.timers.tick(124999);await setImmediate();
  assert.equal((registry as any).pending.size,1,'Allow the maximum command and return grace');
  mock.timers.tick(1);
  const timeout = await missing;assert.equal(timeout.status,504);
  assert.match(JSON.stringify(await timeout.json()),/device call timed out/);
  assert.equal((registry as any).pending.size,0);
  reply(missingId);assert.equal(sent.length,2,'Late acknowledgement never starts a replacement');

  const next = registry.fetch(request(undefined,'read_file'));await setImmediate();
  reply(missingId);assert.equal((registry as any).pending.size,1,'Stale result cannot settle a later call');
  mock.timers.tick(45000);assert.equal((await next).status,504,'Other tools retain their deadline');

  const count = sent.length;
  for (const invalid of [0,-1,1.5,120001,600000,'90000',null]) {
    const response = await registry.fetch(request(invalid));
    assert.equal(response.status,400);assert.match(JSON.stringify(await response.json()),/background:true/);
    await assert.rejects(callDevice({} as never,{} as never,'device','start_process',{timeout_ms:invalid}),/No command was dispatched/);
  }
  assert.equal(sent.length,count,'Invalid budgets are refused before any device dispatch');
  assert.equal(classifyExpectedMcpError(Error(PROCESS_TIMEOUT_GUIDANCE))?.code,'INVALID_TOOL_REQUEST');
  failSend=true;
  assert.equal((await registry.fetch(request(90000))).status,504);
  assert.equal((registry as any).pending.size,0,'Failed socket send clears the timer and pending entry');
} finally { mock.timers.reset(); }
console.log('PASS: 90/120 s foreground reply budgets, late results, no replay, invalid input and timer cleanup');
