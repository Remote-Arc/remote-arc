// The current Go CLI hands over an older idle Agent automatically and asks
// before interrupting active work. Preserve the device's recovery choice.
export function isOlderRelease(current: string | null | undefined, latest: string): boolean {
  const parse = (value: string | null | undefined) => {
    const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/);
    if (!match) return null;
    const stage = match[4] === "alpha" ? 0 : match[4] === "beta" ? 1 : match[4] === "rc" ? 2 : 3;
    return [Number(match[1]), Number(match[2]), Number(match[3]), stage, Number(match[5] || 0)];
  };
  const running = parse(current), target = parse(latest);
  if (!running || !target) return false;
  for (let i = 0; i < running.length; i++) {
    if (running[i] !== target[i]) return running[i]! < target[i]!;
  }
  return false;
}

export function goUpdateCommands(version: string, recoverInBackground: boolean): string[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid stable Agent release");
  return [`npx -y remotelink@${version} ${recoverInBackground ? "--background" : "--foreground"}`];
}
