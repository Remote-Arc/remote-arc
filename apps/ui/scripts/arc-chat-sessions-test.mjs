import test from "node:test";
import assert from "node:assert/strict";
import {
  arcChatTitle, arcChatStorageKey, loadArcChatSessions, saveArcChatSessions,
} from "../src/arc-chat-sessions.ts";

function fakeStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test("session drafts are scoped by account and restored", () => {
  const original = globalThis.sessionStorage;
  globalThis.sessionStorage = fakeStorage();
  try {
    assert.notEqual(arcChatStorageKey("a"), arcChatStorageKey("b"));
    const session = { id:"s1", title:"Review project", createdAt:100, updatedAt:200,
      objective:"Review this PR", criteria:"Tests pass", messages:[
        { id:"m1", role:"user", content:"Review this PR" },
        { id:"m2", role:"assistant", content:"What counts as done?" },
      ] };
    saveArcChatSessions("a", [session]);
    assert.deepEqual(loadArcChatSessions("a"), [session]);
    assert.deepEqual(loadArcChatSessions("b"), []);
  } finally { globalThis.sessionStorage = original; }
});

test("malformed or unexpected stored data does not break the chat", () => {
  const original=globalThis.sessionStorage;
  globalThis.sessionStorage=fakeStorage();
  try {
    sessionStorage.setItem(arcChatStorageKey("a"),"not-json");
    assert.deepEqual(loadArcChatSessions("a"),[]);
    sessionStorage.setItem(arcChatStorageKey("a"),JSON.stringify({version:999,sessions:[]}));
    assert.deepEqual(loadArcChatSessions("a"),[]);
    sessionStorage.setItem(arcChatStorageKey("a"),JSON.stringify({version:1,sessions:[{id:"x",messages:[{role:"admin",content:"hello"}]}]}));
    assert.deepEqual(loadArcChatSessions("a"),[]);
  } finally {globalThis.sessionStorage=original;}
});

test("large drafts and histories are bounded", () => {
  const original=globalThis.sessionStorage;
  globalThis.sessionStorage=fakeStorage();
  try {
    const sessions=Array.from({length:45},(_,index)=>({
      id:String(index),title:"t".repeat(200),createdAt:index,updatedAt:index,
      objective:"o".repeat(8000),criteria:"c".repeat(3000),
      messages:Array.from({length:50},(__,i)=>({id:String(i),role:"user",content:"x".repeat(7000)})),
    }));
    saveArcChatSessions("a",sessions);
    const saved=loadArcChatSessions("a");
    assert.equal(saved.length,30);
    assert.equal(saved[0].messages.length,32);
    assert.equal(saved[0].criteria.length,2000);
    assert.equal(saved[0].messages[0].content.length,6000);
  } finally {globalThis.sessionStorage=original;}
});

test("titles are compact and normalized",()=>{
  assert.equal(arcChatTitle("  first   second  "), "first second");
  assert.ok(arcChatTitle("a".repeat(90)).length<=48);
});
