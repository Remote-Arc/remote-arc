import fs from "node:fs";

// Safety Guard for deletion commands. Instead of pattern-matching command text,
// it finds the delete commands a shell line would run (including nested cmd,
// PowerShell and sh layers), resolves each target to an absolute path and
// refuses only roots, homes, protected folders and targets it cannot resolve
// unambiguously. Narrow cleanup such as node_modules, %TEMP% or Library/Caches
// stays allowed. The Go port in packages/execution-core/execution/delete_guard.go
// must stay behaviourally identical; both run testdata/delete_guard_cases.json.

export type DeleteGuardContext = {
  platform: string;
  cwd: string;
  home: string;
  env: Record<string, string | undefined>;
};

type Shell = "cmd" | "ps" | "sh";
type Segment = { raw: string; sep: string };
type Word = { text: string; raw: string; start: number; end: number; quoted: boolean; unresolved: boolean; pipeItem: boolean };
type State = { ctx: DeleteGuardContext; cwd: string | null; vars: Map<string, string | null>; depth: number };
type SegInfo = { words: Word[]; k: number; shell: Shell; upstream: SegInfo | null };

class Refusal extends Error {}

const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 256 * 1024;
const DELETE_MENTION =
  /(?:^|[^a-z0-9_-])(?:rd|rmdir|del|erase|rm|ri|remove-item|unlink|shred|srm|rimraf|rmtree|rmsync|rmdirsync|robocopy|rsync)(?:[^a-z0-9_-]|$)|::delete/i;
const INLINE_DELETE =
  /(?:shutil\.rmtree|os\.removedirs|os\.rmdir|os\.remove|os\.unlink|rmtree|rmSync|rmdirSync|unlinkSync|rimraf\.sync|rimraf|fsp\.rm|promises\.rm|fs\.rm|FileUtils\.rm_rf|FileUtils\.rm_r|FileUtils\.remove_dir|remove_tree)\s*\(\s*(?:[rRbBuUfF]{0,2}(?:'([^']*)'|"([^"]*)"|`([^`]*)`))?/g;
const DOTNET_DELETE = /\[(?:system\.)?io\.(?:directory|file)\]::delete\s*\(\s*(?:'([^']*)'|"([^"]*)")?/gi;

function ambiguous(why: string): never {
  throw new Refusal("the delete target could not be resolved unambiguously (" + why + ")");
}

// ---------------------------------------------------------------- paths

function normWin(p: string): string {
  const s = p.replace(/\//g, "\\");
  let prefix = "";
  let rest = s;
  if (s.startsWith("\\\\")) {
    const parts = s.slice(2).split("\\").filter((x) => x !== "");
    prefix = "\\\\" + parts.slice(0, 2).join("\\");
    rest = parts.slice(2).join("\\");
    if (parts.length < 2) return prefix;
  } else if (/^[A-Za-z]:/.test(s)) {
    prefix = s.slice(0, 2).toUpperCase();
    rest = s.slice(2);
  }
  const out: string[] = [];
  for (const part of rest.split("\\")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part.replace(/[. ]+$/, "") || part);
  }
  return prefix + "\\" + out.join("\\");
}

function normPosix(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

function joinPath(win: boolean, base: string, rel: string): string {
  return win ? normWin(base + "\\" + rel) : normPosix(base + "/" + rel);
}

function parentOf(win: boolean, p: string): string {
  const sep = win ? "\\" : "/";
  const cut = p.lastIndexOf(sep);
  if (cut <= 0) return win ? p : "/";
  const parent = p.slice(0, cut);
  return win && /^[A-Za-z]:$/.test(parent) ? parent + "\\" : parent;
}

// ------------------------------------------------------- protection rules

type Rules = { win: boolean; insensitive: boolean; ancestor: string[]; inside: string[]; allow: string[]; homeParents: string[]; mountParents: string[] };

function rulesFor(ctx: DeleteGuardContext): Rules {
  const win = ctx.platform === "win32";
  const norm = win ? normWin : normPosix;
  const sep = win ? "\\" : "/";
  const home = norm(ctx.home);
  const h = (rel: string) => norm(home + sep + rel.replace(/\//g, sep));
  const env = (name: string) => lookupEnv(ctx, name);
  if (win) {
    const drive = (env("SystemDrive") || "C:").slice(0, 2);
    const sys = env("SystemRoot") || drive + "\\Windows";
    const programData = env("ProgramData") || drive + "\\ProgramData";
    return {
      win, insensitive: true,
      ancestor: [home, drive + "\\Users\\Public",
        ...["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos", "Favorites", "Contacts", "Saved Games", "Searches", "Links", "OneDrive", "Dropbox", "Google Drive", "iCloudDrive", "AppData", "AppData/Local", "AppData/Roaming", "AppData/LocalLow", ".config", ".local", ".local/share", "source", "source/repos"].map(h),
        ...["OneDrive", "OneDriveConsumer", "OneDriveCommercial"].map(env).filter((x): x is string => !!x)].map(norm),
      inside: [sys, env("ProgramFiles") || drive + "\\Program Files", env("ProgramFiles(x86)") || drive + "\\Program Files (x86)", programData,
        drive + "\\System Volume Information", drive + "\\Recovery", drive + "\\Boot",
        ...[".ssh", ".gnupg", ".aws", ".azure", ".kube", "AppData/Roaming/Microsoft/Credentials", "AppData/Roaming/Microsoft/Protect", "AppData/Local/Microsoft/Credentials", "AppData/Roaming/Microsoft/SystemCertificates"].map(h)].map(norm),
      allow: [sys + "\\Temp", sys + "\\SoftwareDistribution\\Download", programData + "\\Microsoft\\Windows\\WER"].map(norm),
      homeParents: [norm(drive + "\\Users")],
      mountParents: [],
    };
  }
  return {
    win, insensitive: ctx.platform === "darwin",
    ancestor: [home, "/Users", "/home", "/Volumes", "/mnt", "/media", "/Applications", "/var", "/private", "/private/var", "/opt", "/usr/local",
      ...["Desktop", "Documents", "Downloads", "Pictures", "Music", "Movies", "Videos", "Public", "Templates", "Library", "Library/Application Support", "Library/Mobile Documents", "Library/CloudStorage", "Library/Containers", "Library/Group Containers", "Library/Mail", "Library/Messages", "Dropbox", "OneDrive", "Google Drive", ".config", ".local", ".local/share"].map(h)],
    inside: ["/bin", "/sbin", "/usr", "/etc", "/boot", "/lib", "/lib32", "/lib64", "/libx32", "/root", "/srv", "/proc", "/sys", "/dev", "/run", "/snap", "/System", "/Library", "/private/etc", "/var/lib", "/var/db", "/private/var/db", "/cores",
      ...[".ssh", ".gnupg", ".aws", ".azure", ".kube", ".password-store", "Library/Keychains", ".local/share/keyrings"].map(h)],
    allow: ["/usr/local", "/Library/Caches", "/Library/Logs"],
    homeParents: ["/Users", "/home"],
    mountParents: ["/Volumes", "/mnt", "/media"],
  };
}

function within(r: Rules, child: string, parent: string): boolean {
  const sep = r.win ? "\\" : "/";
  const c = r.insensitive ? child.toLowerCase() : child;
  const p = r.insensitive ? parent.toLowerCase() : parent;
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

function isRoot(r: Rules, p: string): boolean {
  if (!r.win) return p === "/";
  if (/^[A-Za-z]:\\$/.test(p)) return true;
  return p.startsWith("\\\\") && p.slice(2).split("\\").filter((x) => x !== "").length <= 2;
}

/** Why deleting this absolute path (or its contents) is refused, or null. */
export function protectedDeleteReason(ctx: DeleteGuardContext, abs: string): string | null {
  const r = rulesFor(ctx);
  const sep = r.win ? "\\" : "/";
  if (isRoot(r, abs)) return "deleting a drive, share or filesystem root (" + abs + ")";
  if (abs.split(sep).some((part) => part.toLowerCase() === ".remotearc")) return "deleting the Remote Arc Undo and configuration store";
  for (const d of r.inside) {
    if (within(r, abs, d) && !r.allow.some((a) => within(r, abs, a) && within(r, a, d))) return "deleting inside protected location " + d;
    if (within(r, d, abs)) return "deleting " + abs + " would remove protected location " + d;
  }
  for (const d of r.ancestor) {
    if (within(r, d, abs)) return within(r, abs, d) ? "deleting protected folder " + d : "deleting " + abs + " would remove protected folder " + d;
  }
  const parent = parentOf(r.win, abs);
  for (const d of r.homeParents) if (within(r, parent, d) && within(r, d, parent)) return "deleting a user's home folder (" + abs + ")";
  for (const d of r.mountParents) if (within(r, parent, d) && within(r, d, parent)) return "deleting a mounted volume (" + abs + ")";
  return null;
}

// --------------------------------------------------------------- lexing

function lookupEnv(ctx: DeleteGuardContext, name: string): string | undefined {
  if (ctx.platform !== "win32") return ctx.env[name];
  const wanted = name.toLowerCase();
  for (const key of Object.keys(ctx.env)) if (key.toLowerCase() === wanted) return ctx.env[key];
  return undefined;
}

function matchParen(src: string, open: number, shell: Shell): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
    else if (c === "'" || c === '"') { const end = skipQuoted(src, i, shell); if (end < 0) return -1; i = end; }
  }
  return -1;
}

/** Index of the closing quote for the quote at i, or -1 when unterminated. */
function skipQuoted(src: string, i: number, shell: Shell): number {
  const q = src.charAt(i);
  for (let j = i + 1; j < src.length; j++) {
    const c = src.charAt(j);
    if (shell === "sh" && q === '"' && c === "\\") { j++; continue; }
    if (shell === "ps" && q === '"' && c === "`") { j++; continue; }
    if (c === q) {
      if (shell === "ps" && src.charAt(j + 1) === q) { j++; continue; }
      return j;
    }
  }
  return -1;
}

function splitSegments(src: string, shell: Shell): { segments: Segment[]; unbalanced: boolean } {
  const segments: Segment[] = [];
  let start = 0, sep = "", unbalanced = false;
  const cut = (end: number, next: string, width: number) => { segments.push({ raw: src.slice(start, end), sep }); sep = next; start = end + width; };
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i), n = src.charAt(i + 1) || "";
    const wordStart = i === start || /[\s;|&(){}]/.test(src.charAt(i - 1) || " ");
    if (shell === "cmd") {
      if (c === "^") { i++; continue; }
      if (c === '"') { const end = src.indexOf('"', i + 1); if (end < 0) { unbalanced = true; break; } i = end; continue; }
    } else {
      if (c === "'" || c === '"') { const end = skipQuoted(src, i, shell); if (end < 0) { unbalanced = true; break; } i = end; continue; }
      if (shell === "sh" && c === "\\") { i++; continue; }
      if (shell === "ps" && c === "`") { i++; continue; }
      if (shell === "sh" && c === "`") { const end = src.indexOf("`", i + 1); if (end < 0) { unbalanced = true; break; } i = end; continue; }
      if (c === "#" && wordStart) { if (shell === "ps" && src.charAt(i - 1) === "<") continue; const nl = src.indexOf("\n", i); i = nl < 0 ? src.length : nl - 1; continue; }
      if (shell === "ps" && c === "<" && n === "#") { const end = src.indexOf("#>", i + 2); i = end < 0 ? src.length : end + 1; continue; }
      if (c === "$" && n === "(") { const end = matchParen(src, i + 1, shell); if (end < 0) { unbalanced = true; break; } i = end; continue; }
      if (shell === "ps" && (c === "(" || (c === "@" && n === "("))) { const end = matchParen(src, c === "@" ? i + 1 : i, shell); if (end < 0) { unbalanced = true; break; } i = end; continue; }
    }
    if (c === "\n") { cut(i, ";", 1); continue; }
    if ((c === "&" && n === "&") || (c === "|" && n === "|")) { cut(i, ";", 2); i++; continue; }
    if (c === "|") { cut(i, "|", 1); continue; }
    if (c === ";" && shell !== "cmd") { cut(i, ";", 1); continue; }
    if (c === "&" && shell !== "ps") { cut(i, ";", 1); continue; }
    if ((c === "(" || c === ")") && shell !== "ps") { cut(i, ";", 1); continue; }
    if (shell === "ps" && (c === "{" || c === "}")) { cut(i, c === "{" ? "{" : ";", 1); continue; }
  }
  segments.push({ raw: src.slice(start), sep });
  return { segments, unbalanced };
}

function words(seg: Segment, shell: Shell, st: State): Word[] {
  const raw = seg.raw, out: Word[] = [];
  const ctx = st.ctx;
  let i = 0;
  const isSpace = (c: string) => c === " " || c === "\t" || c === "\r" || (shell === "cmd" && (c === "," || c === ";" || c === "=")) || (shell === "ps" && c === ",");
  while (i < raw.length) {
    while (i < raw.length && isSpace(raw.charAt(i))) i++;
    if (i >= raw.length) break;
    const start = i;
    let text = "", quoted = false, unresolved = false, pipeItem = false, inQuote = false;
    const expandSh = () => {
      // raw.charAt(i) === "$"
      const n = raw.charAt(i + 1) || "";
      if (n === "(") { const end = matchParen(raw, i + 1, shell); unresolved = true; i = end < 0 ? raw.length : end + 1; return; }
      if (n === "{") {
        const end = raw.indexOf("}", i + 2), name = end < 0 ? "" : raw.slice(i + 2, end);
        i = end < 0 ? raw.length : end + 1;
        if (!/^[A-Za-z_]\w*$/.test(name)) { unresolved = true; return; }
        const v = st.vars.has(name) ? st.vars.get(name) : name === "HOME" ? lookupEnv(ctx, "HOME") || ctx.home : lookupEnv(ctx, name);
        if (!v) unresolved = true; else text += v;
        return;
      }
      const m = /^[A-Za-z_]\w*/.exec(raw.slice(i + 1));
      if (m) {
        const name = m[0];
        i += 1 + name.length;
        const v = st.vars.has(name) ? st.vars.get(name) : name === "HOME" ? lookupEnv(ctx, "HOME") || ctx.home : lookupEnv(ctx, name);
        if (!v) unresolved = true; else text += v;
        return;
      }
      if (/[0-9@*#?$!-]/.test(n)) { unresolved = true; i += 2; return; }
      text += "$"; i++;
    };
    const expandPs = () => {
      const n = raw.charAt(i + 1) || "";
      if (n === "(") { const end = matchParen(raw, i + 1, shell); unresolved = true; i = end < 0 ? raw.length : end + 1; return; }
      if (n === "{") { const end = raw.indexOf("}", i + 2); unresolved = true; i = end < 0 ? raw.length : end + 1; return; }
      const m = /^[A-Za-z0-9_?:]+/.exec(raw.slice(i + 1));
      if (!m) { text += "$"; i++; return; }
      let name = m[0];
      if (name.endsWith(":")) name = name.slice(0, -1);
      i += 1 + name.length;
      const lower = name.toLowerCase();
      if (lower.startsWith("env:")) { const v = lookupEnv(ctx, name.slice(4)); if (!v) unresolved = true; else text += v; return; }
      if (lower === "_" || lower === "psitem") {
        pipeItem = true;
        const prop = /^\.[A-Za-z_]\w*/.exec(raw.slice(i));
        if (prop) i += prop[0].length;
        return;
      }
      if (lower === "home") { text += ctx.home; return; }
      if (lower === "pwd") { if (st.cwd) text += st.cwd; else unresolved = true; return; }
      const v = st.vars.get(lower);
      if (!v) unresolved = true; else text += v;
    };
    while (i < raw.length) {
      const c = raw.charAt(i);
      if (shell === "cmd") {
        if (!inQuote && isSpace(c)) break;
        if (c === "^" && !inQuote) { text += raw.charAt(i + 1) || ""; i += 2; continue; }
        if (c === '"') { inQuote = !inQuote; quoted = true; i++; continue; }
        if (c === "%") {
          if (raw.charAt(i + 1) === "%") { unresolved = true; i += 3; continue; }
          const end = raw.indexOf("%", i + 1);
          const name = end < 0 ? "" : raw.slice(i + 1, end);
          if (end < 0 || name === "" || /[\s:~"]/.test(name)) {
            if (/^[~A-Za-z]/.test(raw.charAt(i + 1) || "")) { unresolved = true; i += 2; while (i < raw.length && /[A-Za-z0-9~$:]/.test(raw.charAt(i))) i++; continue; }
            text += c; i++; continue;
          }
          const v = lookupEnv(ctx, name);
          if (!v) unresolved = true; else text += v;
          i = end + 1;
          continue;
        }
        text += c; i++;
        continue;
      }
      if (isSpace(c)) break;
      if (shell === "sh") {
        if (c === "\\") { if (raw.charAt(i + 1) !== "\n") text += raw.charAt(i + 1) || ""; i += 2; continue; }
        if (c === "'") { const end = raw.indexOf("'", i + 1); const e = end < 0 ? raw.length : end; text += raw.slice(i + 1, e); quoted = true; i = e + 1; continue; }
        if (c === '"') {
          quoted = true; i++;
          while (i < raw.length && raw.charAt(i) !== '"') {
            if (raw.charAt(i) === "\\" && /[$`"\\\n]/.test(raw.charAt(i + 1) || "")) { text += raw.charAt(i + 1); i += 2; continue; }
            if (raw.charAt(i) === "$") { expandSh(); continue; }
            if (raw.charAt(i) === "`") { const end = raw.indexOf("`", i + 1); unresolved = true; i = end < 0 ? raw.length : end + 1; continue; }
            text += raw.charAt(i); i++;
          }
          i++;
          continue;
        }
        if (c === "$") { expandSh(); continue; }
        if (c === "`") { const end = raw.indexOf("`", i + 1); unresolved = true; i = end < 0 ? raw.length : end + 1; continue; }
        if (c === "~" && text === "" && !quoted && (i + 1 >= raw.length || raw.charAt(i + 1) === "/" || isSpace(raw.charAt(i + 1)))) { text += ctx.home; i++; continue; }
        if (c === "~" && text === "" && !quoted) { unresolved = true; }
        text += c; i++;
        continue;
      }
      // PowerShell
      if (c === "`") { text += raw.charAt(i + 1) || ""; i += 2; continue; }
      if (c === "'") {
        quoted = true; i++;
        while (i < raw.length) { if (raw.charAt(i) === "'") { if (raw.charAt(i + 1) === "'") { text += "'"; i += 2; continue; } break; } text += raw.charAt(i); i++; }
        i++;
        continue;
      }
      if (c === '"') {
        quoted = true; i++;
        while (i < raw.length) {
          const d = raw.charAt(i);
          if (d === "`") { text += raw.charAt(i + 1) || ""; i += 2; continue; }
          if (d === '"') { if (raw.charAt(i + 1) === '"') { text += '"'; i += 2; continue; } break; }
          if (d === "$") { expandPs(); continue; }
          text += d; i++;
        }
        i++;
        continue;
      }
      if (c === "$") { expandPs(); continue; }
      if (c === "(" || (c === "@" && raw.charAt(i + 1) === "(")) { const end = matchParen(raw, c === "@" ? i + 1 : i, shell); unresolved = true; i = end < 0 ? raw.length : end + 1; continue; }
      if (c === "~" && text === "" && !quoted && (i + 1 >= raw.length || raw.charAt(i + 1) === "\\" || raw.charAt(i + 1) === "/" || isSpace(raw.charAt(i + 1)))) { text += ctx.home; i++; continue; }
      text += c; i++;
    }
    out.push({ text, raw: raw.slice(start, i), start, end: i, quoted, unresolved, pipeItem });
  }
  // Drop redirections such as 2>nul, >log.txt, 2>&1.
  const kept: Word[] = [];
  for (let j = 0; j < out.length; j++) {
    const w = out[j]!;
    if (!w.quoted && /^(?:\d|&)?(?:>>?|<)(?:&\d)?$/.test(w.raw)) { j++; continue; }
    if (!w.quoted && /^(?:\d|&)?(?:>>?|<)/.test(w.raw)) continue;
    kept.push(w);
  }
  return kept;
}

// ------------------------------------------------------- command shapes

function commandName(text: string): string {
  let n = text.toLowerCase();
  const cut = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
  if (cut >= 0) n = n.slice(cut + 1);
  return n.replace(/\.(?:exe|com|cmd|bat)$/, "");
}

function skipPrefixes(ws: Word[], shell: Shell): number {
  let k = 0;
  while (k < ws.length) {
    const w = ws[k]!;
    if (w.quoted) return k;
    const t = w.text.toLowerCase();
    if (shell === "cmd") {
      if (t === "@" || t === "call" || t === "else" || t === "do") { k++; continue; }
      if (t.startsWith("@")) { w.text = w.text.slice(1); continue; }
      if (t === "start") {
        k++;
        if (k < ws.length && ws[k]!.quoted) k++;
        while (k < ws.length && ws[k]!.text.startsWith("/")) k++;
        continue;
      }
      if (t === "if") {
        k++;
        if (k < ws.length && ws[k]!.text.toLowerCase() === "/i") k++;
        if (k < ws.length && ws[k]!.text.toLowerCase() === "not") k++;
        const kind = k < ws.length ? ws[k]!.text.toLowerCase() : "";
        if (kind === "exist" || kind === "defined" || kind === "errorlevel" || kind === "cmdextversion") k += 2;
        else if (k + 1 < ws.length && ["==", "equ", "neq", "lss", "leq", "gtr", "geq"].includes(ws[k + 1]!.text.toLowerCase())) k += 3;
        else if (ws[k]?.raw.includes("==")) k += 1;
        else k += 2;
        continue;
      }
      if (t === "for") {
        const d = ws.findIndex((x, j) => j > k && x.text.toLowerCase() === "do");
        if (d < 0) return ws.length;
        k = d + 1;
        continue;
      }
      return k;
    }
    if (shell === "ps") {
      if (["&", ".", "if", "elseif", "else", "foreach", "while", "do", "try", "finally", "until", "}", "{"].includes(t)) { k++; continue; }
      return k;
    }
    if (/^[A-Za-z_]\w*=/.test(w.raw)) { k++; continue; }
    if (t === "sudo" || t === "doas") {
      k++;
      while (k < ws.length && ws[k]!.text.startsWith("-")) k += ["-u", "-g", "-h", "-p", "-c", "-r", "-t", "-u"].includes(ws[k]!.text) ? 2 : 1;
      continue;
    }
    if (t === "env") { k++; while (k < ws.length && (ws[k]!.text.startsWith("-") || ws[k]!.text.includes("="))) k++; continue; }
    if (t === "timeout") { k += 2; continue; }
    if (["command", "builtin", "exec", "nohup", "time", "nice", "ionice", "stdbuf", "caffeinate", "npx", "pnpx", "bunx", "then", "do", "else", "elif", "if", "while", "until", "!", "{", "}"].includes(t)) {
      k++;
      while (k < ws.length && !ws[k]!.quoted && /^-/.test(ws[k]!.text) && ws[k]!.text !== "-") k++;
      continue;
    }
    return k;
  }
  return k;
}

function nestedShellOf(name: string): Shell | null {
  if (name === "cmd") return "cmd";
  if (name === "powershell" || name === "pwsh") return "ps";
  if (["bash", "sh", "zsh", "dash", "ksh"].includes(name)) return "sh";
  return null;
}

function rejoin(ws: Word[]): string {
  return ws.map((w) => (/\s/.test(w.text) ? '"' + w.text + '"' : w.text)).join(" ");
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"')) {
    const last = t.lastIndexOf('"');
    if (last > 0) return t.slice(1, last) + t.slice(last + 1);
  }
  return t;
}

type Nested = { script: string; shell: Shell; file?: string } | null;

function nestedScript(ws: Word[], k: number, seg: Segment, outer: Shell, inner: Shell): Nested {
  const rest = (j: number, skip: number): string =>
    outer === "cmd" ? stripOuterQuotes(seg.raw.slice(ws[j]!.start + skip)) : rejoin(ws.slice(j + 1));
  if (inner === "cmd") {
    for (let j = k + 1; j < ws.length; j++) {
      const t = ws[j]!.text.toLowerCase();
      if (t.startsWith("/c") || t.startsWith("/k")) {
        const script = outer === "cmd" ? rest(j, 2) : [ws[j]!.text.slice(2), rejoin(ws.slice(j + 1))].join(" ").trim();
        return { script, shell: "cmd" };
      }
      if (!t.startsWith("/")) return null;
    }
    return null;
  }
  if (inner === "ps") {
    const valued = ["-executionpolicy", "-ep", "-ex", "-windowstyle", "-w", "-inputformat", "-outputformat", "-of", "-configurationname", "-workingdirectory", "-wd", "-settingsfile", "-custompipename", "-version", "-psconsolefile"];
    for (let j = k + 1; j < ws.length; j++) {
      const t = ws[j]!.text.toLowerCase();
      if (t.length >= 2 && "-command".startsWith(t)) return { script: rest(j, ws[j]!.end - ws[j]!.start), shell: "ps" };
      if ((t.length >= 2 && "-encodedcommand".startsWith(t)) || t === "-ec") {
        const encoded = ws[j + 1]?.text || "";
        const decoded = Buffer.from(encoded, "base64").toString("utf16le");
        if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded) || decoded.includes("�")) ambiguous("undecodable -EncodedCommand");
        return { script: decoded, shell: "ps" };
      }
      if (t.length >= 2 && "-file".startsWith(t)) return { script: "", shell: "ps", file: ws[j + 1]?.text };
      if (t.startsWith("-")) { if (valued.includes(t)) j++; continue; }
      return { script: outer === "cmd" ? stripOuterQuotes(seg.raw.slice(ws[j]!.start)) : rejoin(ws.slice(j)), shell: "ps" };
    }
    return null;
  }
  for (let j = k + 1; j < ws.length; j++) {
    const t = ws[j]!.text;
    if (/^-[a-z]*c[a-z]*$/i.test(t) && !t.startsWith("--")) return { script: ws[j + 1]?.text || "", shell: "sh" };
    if (t.startsWith("-")) continue;
    return { script: "", shell: "sh", file: t };
  }
  return null;
}

/** Flag-free arguments of a Remove-Item style command, plus -Path/-LiteralPath values. */
function psTargets(ws: Word[], from: number): Word[] {
  const out: Word[] = [];
  for (let j = from; j < ws.length; j++) {
    const w = ws[j]!;
    if (w.pipeItem || w.quoted || !w.text.startsWith("-") || w.text === "-") { out.push(w); continue; }
    let name = w.text.slice(1).toLowerCase();
    let inline: string | null = null;
    const colon = name.indexOf(":");
    if (colon >= 0) { inline = w.text.slice(colon + 2); name = name.slice(0, colon); }
    const pathParam = (name.length >= 1 && "path".startsWith(name)) || (name.length >= 2 && ("literalpath".startsWith(name) || "pspath".startsWith(name))) || name === "lp";
    const valueParam = name.length >= 2 && ["filter", "include", "exclude", "credential", "stream"].some((x) => x.startsWith(name));
    if (pathParam) {
      if (inline !== null) out.push({ ...w, text: inline });
      else if (j + 1 < ws.length) out.push(ws[++j]!);
      continue;
    }
    if (valueParam && inline === null) j++;
  }
  return out;
}

function posixTargets(ws: Word[], from: number): Word[] {
  const out: Word[] = [];
  let options = true;
  for (let j = from; j < ws.length; j++) {
    const w = ws[j]!;
    if (options && !w.quoted && w.text === "--") { options = false; continue; }
    if (options && !w.quoted && w.text.startsWith("-") && w.text.length > 1) continue;
    out.push(w);
  }
  return out;
}

function cmdTargets(ws: Word[], from: number): Word[] {
  return ws.slice(from).filter((w) => w.quoted || !w.text.startsWith("/"));
}

function listingTargets(info: SegInfo | null): Word[] | null {
  if (!info || info.k >= info.words.length) return null;
  const { words: ws, k } = info;
  const name = commandName(ws[k]!.text);
  const dot: Word = { text: ".", raw: ".", start: 0, end: 0, quoted: false, unresolved: false, pipeItem: false };
  if (["get-childitem", "gci", "ls", "dir", "get-item", "gi"].includes(name)) {
    const found = info.shell === "ps"
      ? psTargets(ws, k + 1).filter((w) => !w.pipeItem)
      : ws.slice(k + 1).filter((w) => w.quoted || (!w.text.startsWith("-") && !(info.shell === "cmd" && w.text.startsWith("/"))));
    return found.length ? found : [dot];
  }
  if (name === "find" || name === "fd") {
    const found: Word[] = [];
    for (let j = k + 1; j < ws.length; j++) { const t = ws[j]!.text; if (!ws[j]!.quoted && (t.startsWith("-") || t === "(" || t === "!")) break; found.push(ws[j]!); }
    return found.length ? found : [dot];
  }
  return null;
}

// ---------------------------------------------------------------- analysis

function resolveTarget(w: Word, st: State, shell: Shell): string | null {
  const win = st.ctx.platform === "win32";
  if (w.unresolved) ambiguous("unexpanded variable or command substitution in " + JSON.stringify(w.raw));
  let t = w.text;
  if (t.trim() === "") ambiguous("empty path");
  if (t.includes('"')) ambiguous("a quote character became part of the path " + JSON.stringify(w.raw));
  if (win) {
    t = t.replace(/\//g, "\\");
    if (shell === "ps") {
      t = t.replace(/^(?:microsoft\.powershell\.core\\)?filesystem::/i, "");
      if (/^[a-z][a-z0-9]+:/i.test(t)) return null;
    }
    if (/^\\\\\?\\unc\\/i.test(t)) t = "\\\\" + t.slice(8);
    else if (/^\\\\[?.]\\[a-z]:/i.test(t)) t = t.slice(4);
    else if (/^\\\\[?.]\\/.test(t)) ambiguous("device namespace path " + JSON.stringify(w.raw));
  }
  // Deleting a wildcard is judged by the folder whose contents it matches.
  const wild = t.search(shell === "ps" ? /[*?[]/ : /[*?]/);
  if (wild >= 0) {
    const before = t.slice(0, wild);
    const sepAt = before.lastIndexOf(win ? "\\" : "/");
    t = sepAt >= 0 ? t.slice(0, sepAt + 1) : win && /^[A-Za-z]:/.test(before) ? before.slice(0, 2) : ".";
  }
  let abs: string;
  if (win) {
    if (t.startsWith("\\\\")) abs = normWin(t);
    else if (/^[A-Za-z]:\\/.test(t)) abs = normWin(t);
    else if (/^[A-Za-z]:/.test(t)) {
      if (!st.cwd || st.cwd.slice(0, 2).toUpperCase() !== t.slice(0, 2).toUpperCase()) ambiguous("drive-relative path " + JSON.stringify(w.raw));
      abs = joinPath(true, st.cwd!, t.slice(2));
    } else if (t.startsWith("\\")) {
      if (!st.cwd || !/^[A-Za-z]:/.test(st.cwd)) ambiguous("root-relative path with an unknown current drive");
      abs = normWin(st.cwd!.slice(0, 2) + t);
    } else {
      if (!st.cwd) ambiguous("relative path after the working directory changed to an unknown location");
      abs = joinPath(true, st.cwd!, t);
    }
    if (/~\d/.test(abs)) {
      const long = expandShortNames(abs);
      if (long === null) ambiguous("unresolvable 8.3 short name " + JSON.stringify(w.raw));
      abs = long;
    }
  } else {
    if (t.startsWith("/")) abs = normPosix(t);
    else {
      if (!st.cwd) ambiguous("relative path after the working directory changed to an unknown location");
      abs = joinPath(false, st.cwd!, t);
    }
  }
  return abs;
}

/** Replaces 8.3 names (ADMINI~1) via the nearest existing ancestor; the rest is kept as written. */
function expandShortNames(abs: string): string | null {
  const rest: string[] = [];
  for (let dir = abs; ; ) {
    try {
      const long = normWin(fs.realpathSync.native(dir) + "\\" + rest.join("\\"));
      return /~\d/.test(long) ? null : long;
    } catch {
      const parent = parentOf(true, dir);
      if (parent === dir) return null;
      rest.unshift(dir.slice(dir.lastIndexOf("\\") + 1));
      dir = parent;
    }
  }
}

function check(targets: Word[], st: State, shell: Shell) {
  for (const w of targets) {
    const abs = resolveTarget(w, st, shell);
    if (abs === null) continue;
    const reason = protectedDeleteReason(st.ctx, abs);
    if (reason) throw new Refusal(reason);
  }
}

function checkInline(code: string, st: State, re: RegExp) {
  re.lastIndex = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const literal = m[1] ?? m[2] ?? m[3];
    if (literal === undefined) ambiguous("a computed path in " + JSON.stringify(m[0]));
    const after = code.slice(m.index + m[0].length).trimStart();
    if (/^[+.%]/.test(after)) ambiguous("a concatenated path in " + JSON.stringify(m[0]));
    check([{ text: literal, raw: literal, start: 0, end: 0, quoted: true, unresolved: false, pipeItem: false }], st, "sh");
  }
}

function readScript(file: string | undefined, st: State, shell: Shell): string | null {
  if (!file) return null;
  let abs: string | null;
  try { abs = resolveTarget({ text: file, raw: file, start: 0, end: 0, quoted: true, unresolved: false, pipeItem: false }, st, shell); } catch { return null; }
  if (!abs) return null;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_SCRIPT_BYTES) return null;
    return fs.readFileSync(abs, "utf8");
  } catch { return null; }
}

function scriptShellFor(name: string): Shell | null {
  if (/\.ps1$/.test(name)) return "ps";
  if (/\.(?:bat|cmd)$/.test(name)) return "cmd";
  if (/\.sh$/.test(name)) return "sh";
  return null;
}

function analyze(src: string, shell: Shell, st: State) {
  if (st.depth > MAX_DEPTH) { if (DELETE_MENTION.test(src)) ambiguous("too many nested shell layers"); return; }
  const { segments, unbalanced } = splitSegments(src, shell);
  if (unbalanced && DELETE_MENTION.test(src)) ambiguous("unbalanced quotes");
  let last = null as SegInfo | null;
  for (const seg of segments) {
    const ws = words(seg, shell, st);
    const upstream: SegInfo | null = seg.sep === "|" ? last : seg.sep === "{" ? last?.upstream ?? null : null;
    if (shell === "ps") checkInline(seg.raw, st, DOTNET_DELETE);
    // Variable assignments used by later segments: NAME=value (sh), $name = value (ps).
    if (shell === "sh" && ws.length > 0 && ws.every((w) => /^[A-Za-z_]\w*=/.test(w.raw))) {
      for (const w of ws) { const eq = w.text.indexOf("="); st.vars.set(w.text.slice(0, eq), w.unresolved ? null : w.text.slice(eq + 1)); }
      last = { words: ws, k: ws.length, shell, upstream };
      continue;
    }
    const psAssign = shell === "ps" ? /^\s*\$([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(seg.raw) : null;
    if (psAssign) {
      const value = words({ raw: psAssign[2]!, sep: "" }, shell, st);
      st.vars.set(psAssign[1]!.toLowerCase(), value.length === 1 && !value[0]!.unresolved && !value[0]!.pipeItem ? value[0]!.text : null);
      last = { words: ws, k: ws.length, shell, upstream };
      continue;
    }
    let k = skipPrefixes(ws, shell);
    const info: SegInfo = { words: ws, k, shell, upstream };
    last = info;
    if (k >= ws.length) continue;
    let name = commandName(ws[k]!.text);
    let piped = upstream !== null;
    let viaXargs = false;
    // cmd.exe accepts switches glued to the builtin name: rd/s/q, del/q.
    if (shell === "cmd" && !ws[k]!.quoted) {
      const glued = /^(rd|rmdir|del|erase)(\/.*)$/i.exec(ws[k]!.text);
      if (glued) { name = glued[1]!.toLowerCase(); ws.splice(k + 1, 0, { ...ws[k]!, text: glued[2]!, raw: glued[2]! }); }
    }
    if (name === "xargs") {
      k++;
      while (k < ws.length && ws[k]!.text.startsWith("-")) k += /^-[IinPLdEs]$/.test(ws[k]!.text) ? 2 : 1;
      if (k >= ws.length) continue;
      name = commandName(ws[k]!.text);
      piped = true;
      viaXargs = true;
      info.k = k;
    }
    const nested = nestedShellOf(name);
    if (nested) {
      const inner = nestedScript(ws, k, seg, shell, nested);
      if (!inner) continue;
      const script = inner.file !== undefined ? readScript(inner.file, st, shell) : inner.script;
      if (script === null) continue;
      if (shell !== "sh" && seg.raw.slice(ws[k]!.start).includes('\\"') && DELETE_MENTION.test(script)) {
        ambiguous('\\" escaped quotes inside a nested ' + name + " command; cmd.exe and PowerShell do not treat \\\" as an escape");
      }
      analyze(script, inner.shell, { ...st, vars: new Map(st.vars), depth: st.depth + 1 });
      continue;
    }
    const fileShell = scriptShellFor(ws[k]!.text.toLowerCase());
    if (fileShell) {
      const script = readScript(ws[k]!.text, st, shell);
      if (script !== null) analyze(script, fileShell, { ...st, vars: new Map(), depth: st.depth + 1 });
      continue;
    }
    if (["cd", "chdir", "pushd", "set-location", "sl", "push-location"].includes(name)) {
      const arg = (shell === "ps" ? psTargets(ws, k + 1) : ws.slice(k + 1).filter((w) => w.quoted || !(w.text.startsWith("/") && shell === "cmd" && w.text.length === 2) && !(shell === "sh" && w.text.startsWith("-"))))[0];
      if (!arg) { if (shell === "sh") st.cwd = st.ctx.home; continue; }
      if (arg.text === "-" && shell !== "cmd") { st.cwd = null; continue; }
      try { st.cwd = resolveTarget(arg, st, shell); } catch { st.cwd = null; }
      continue;
    }
    if (["popd", "pop-location"].includes(name)) { st.cwd = null; continue; }
    if (shell === "ps" && ["start-process", "saps", "invoke-expression", "iex", "invoke-command", "icm"].includes(name)) {
      if (DELETE_MENTION.test(seg.raw)) ambiguous("deletion inside " + name);
      continue;
    }
    if (["python", "python3", "py", "node", "perl", "ruby", "deno", "bun"].includes(name)) {
      for (let j = k + 1; j < ws.length; j++) {
        const t = ws[j]!.text;
        if (["-c", "-e", "--eval", "-p", "--print", "eval"].includes(t)) { checkInline(ws[j + 1]?.text || "", st, INLINE_DELETE); break; }
      }
      continue;
    }
    let targets: Word[] | null = null;
    const psRemove = shell === "ps" && ["remove-item", "ri", "rm", "rmdir", "del", "erase", "rd"].includes(name);
    if (psRemove) targets = psTargets(ws, k + 1);
    else if (shell === "cmd" && ["rd", "rmdir", "del", "erase"].includes(name)) targets = cmdTargets(ws, k + 1);
    else if (["rm", "rmdir", "unlink", "shred", "srm", "rimraf"].includes(name)) targets = posixTargets(ws, k + 1);
    else if (name === "find" && shell !== "cmd") {
      const deletes = ws.slice(k + 1).some((w, j, all) => w.text === "-delete" || (["-exec", "-execdir", "-ok", "-okdir"].includes(w.text) && ["rm", "rmdir", "unlink", "shred"].includes(commandName(all[j + 1]?.text || ""))));
      if (deletes) targets = listingTargets(info);
    } else if (name === "robocopy") {
      if (ws.slice(k + 1).some((w) => /^\/(?:mir|purge)$/i.test(w.text))) { const pos = cmdTargets(ws, k + 1); if (pos[1]!) targets = [pos[1]!]; }
    } else if (name === "rsync") {
      if (ws.slice(k + 1).some((w) => w.text.startsWith("--delete"))) {
        const pos = posixTargets(ws, k + 1).filter((w) => !/^[^/\\]{2,}:/.test(w.text));
        if (pos.length) targets = [pos[pos.length - 1]!];
      }
    }
    if (targets === null) continue;
    if (piped) {
      const fromUpstream = listingTargets(upstream);
      const explicit = targets.filter((w) => !w.pipeItem && w.text !== "{}");
      if (viaXargs || explicit.length === 0 || targets.some((w) => w.pipeItem)) {
        if (!fromUpstream) ambiguous("pipeline input from a command whose paths are unknown");
        targets = [...explicit, ...fromUpstream];
      }
    } else if (targets.some((w) => w.pipeItem)) {
      const fromUpstream = listingTargets(upstream);
      if (!fromUpstream) ambiguous("$_ without a known pipeline source");
      targets = [...targets.filter((w) => !w.pipeItem), ...fromUpstream];
    }
    check(targets, st, shell);
  }
}

/**
 * Returns why the command must not run, or null. Only deletion is judged here;
 * the other catastrophic-command rules stay in safety.ts.
 */
export function findDangerousDelete(command: string, ctx: DeleteGuardContext): string | null {
  const win = ctx.platform === "win32";
  const cwd = ctx.cwd ? (win ? normWin(ctx.cwd) : normPosix(ctx.cwd)) : null;
  try {
    analyze(command, win ? "cmd" : "sh", { ctx, cwd, vars: new Map(), depth: 0 });
    return null;
  } catch (error) {
    if (error instanceof Refusal) return error.message;
    throw error;
  }
}
