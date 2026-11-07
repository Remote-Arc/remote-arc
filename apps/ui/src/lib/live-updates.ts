// One change feed per Dashboard tab, shared by every list that wants it.
// The Relay sends only a topic name; each list reloads itself through its
// normal API request. A list must keep a fallback poll for when the feed is
// down, and it reloads whenever the feed connects or drops, because changes
// may have been missed in between.

export type LiveTopic = "approvals" | "attention";

type Listener = { topic: LiveTopic; onChange: () => void };

const KEEPALIVE_MS = 45_000;
const MAX_RETRY_MS = 30_000;

const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();
let socket: WebSocket | null = null;
let connected = false;
let retries = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let keepAlive: ReturnType<typeof setInterval> | undefined;

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  for (const listener of [...statusListeners]) listener(value);
}

function reloadAll() {
  for (const listener of [...listeners]) listener.onChange();
}

function feedUrl() {
  const url = new URL("/api/live", globalThis.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  if (listeners.size === 0) return;
  const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** retries);
  retries += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (socket || listeners.size === 0 || typeof WebSocket === "undefined") return;
  let current: WebSocket;
  try {
    current = new WebSocket(feedUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  socket = current;
  current.onopen = () => {
    if (socket !== current) return;
    retries = 0;
    clearInterval(keepAlive);
    // The Relay answers this exact text without waking its Durable Object.
    keepAlive = setInterval(() => {
      if (current.readyState === 1) current.send("ping");
    }, KEEPALIVE_MS);
    setConnected(true);
    reloadAll();
  };
  current.onmessage = (event) => {
    if (socket !== current || typeof event.data !== "string") return;
    let message: { type?: unknown; topic?: unknown };
    try {
      message = JSON.parse(event.data);
    } catch {
      return; // "pong" and anything else that is not a change.
    }
    if (message?.type !== "changed") return;
    for (const listener of [...listeners])
      if (listener.topic === message.topic) listener.onChange();
  };
  current.onclose = () => {
    if (socket !== current) return;
    socket = null;
    clearInterval(keepAlive);
    const wasConnected = connected;
    setConnected(false);
    if (wasConnected) reloadAll();
    scheduleReconnect();
  };
  current.onerror = () => current.close();
}

function disconnectIfUnused() {
  if (listeners.size > 0) return;
  clearTimeout(reconnectTimer);
  clearInterval(keepAlive);
  const current = socket;
  socket = null;
  retries = 0;
  setConnected(false);
  current?.close(1000, "unused");
}

/** Calls onChange when the topic changes, connects or the feed drops. */
export function subscribeLive(topic: LiveTopic, onChange: () => void) {
  const listener = { topic, onChange };
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    disconnectIfUnused();
  };
}

/** Reports the feed state now and on every change. */
export function onLiveStatus(listener: (connected: boolean) => void) {
  statusListeners.add(listener);
  listener(connected);
  return () => {
    statusListeners.delete(listener);
  };
}
