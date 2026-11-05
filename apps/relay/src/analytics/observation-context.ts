// Request-scoped server-verified identities. Never populated from client metadata.
const actors = new WeakMap<Request, string>();
const traces = new WeakMap<object, string>();
export function setObservationActor(request: Request, userId: string) {
  actors.set(request, userId);
}
export function observationActor(request: Request) {
  return actors.get(request);
}
export function setIdentityTrace(identity: object, traceId: string) {
  traces.set(identity, traceId);
}
export function identityTrace(identity: object) {
  return traces.get(identity);
}
