(function (op, a) {
  "use strict";
  // Remote Arc Browser Runner page helper. The local Agent evaluates it in an
  // isolated world (only "install" runs in the page's main world). It never
  // reads cookies, storage or credentials and never returns values of
  // sensitive fields.
  const SENSITIVE_AUTOCOMPLETE = ["current-password", "new-password", "one-time-code", "cc-name", "cc-number", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type"];
  const SENSITIVE_NAME = /(passw|passwd|pwd|otp|one[-_ ]?time|verification[-_ ]?code|cvv|cvc|csc|card[-_ ]?num|ccnum|cc[-_]?number|security[-_ ]?code)/i;
  const CAPTCHA = /(recaptcha|hcaptcha|turnstile|challenges\.cloudflare\.com|arkoselabs|funcaptcha|geetest|captcha)/i;
  // Fields that carry a solved CAPTCHA's response. Treated as secrets: their
  // values are never returned and the Runner never fills them.
  const CAPTCHA_RESPONSE = /(g-recaptcha-response|h-captcha-response|cf-turnstile-response|captcha[-_]?(response|token|solution))/i;
  const CAPTCHA_VENDORS = [[/hcaptcha|h-captcha/i, "hCaptcha"], [/recaptcha/i, "reCAPTCHA"], [/turnstile|challenges\.cloudflare\.com/i, "Turnstile"], [/arkoselabs|funcaptcha/i, "Arkose"], [/geetest/i, "GeeTest"]];
  const clip = (s, n) => {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };
  const captchaField = (el) => !!el && !!el.tagName && CAPTCHA_RESPONSE.test([el.name, el.id].join(" "));
  // Which kind of secret a field holds: captcha, payment, code (a one-time
  // code), password, or "" for none. Values of every kind are redacted.
  const secretKind = (el) => {
    if (!el || !el.tagName) return "";
    if (captchaField(el)) return "captcha";
    const type = String(el.type || "").toLowerCase();
    const ac = String(el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/);
    const hint = [el.name, el.id, el.getAttribute("aria-label"), el.getAttribute("placeholder")].join(" ");
    if (ac.some((t) => t.startsWith("cc-")) || /(cvv|cvc|csc|card[-_ ]?num|ccnum|cc[-_]?number|cc[-_]?security[-_ ]?code)/i.test(hint)) return "payment";
    if (type !== "password" && !ac.some(t => /^(current|new)-password$/.test(t)) && /(captcha|验证码图片|图形验证码)/i.test(hint)) return "captcha_answer";
    if (ac.includes("one-time-code") || /(otp|one[-_ ]?time|verification[-_ ]?code|passcode|security[-_ ]?code|验证码|驗證碼)/i.test(hint + " " + (type === "password" ? "" : labelText(el)))) return "code";
    if (type === "password" || ac.includes("current-password") || ac.includes("new-password")) return "password";
    if (SENSITIVE_AUTOCOMPLETE.some((t) => ac.includes(t)) || SENSITIVE_NAME.test(hint)) return "password";
    return "";
  };
  const sensitive = (el) => secretKind(el) !== "";
  // Fill refuses CAPTCHA responses always, passwords and payment details from
  // the conversation always, and one-time codes only when the computer has
  // them turned off. A code the caller found (for example in the user's
  // email) is entered like any value and never recorded.
  const refuseSecret = (el) => {
    const kind = secretKind(el);
    if (kind === "captcha") throw new Error(CAPTCHA_REFUSAL);
    if (kind === "captcha_answer" && a.allow_captcha) return;
    if (kind === "captcha_answer") throw new Error("BROWSER_AUTH_REQUIRED: approve CAPTCHA for this site in Dashboard Browser authentication.");
    if (kind === "code" && a.allow_codes) return;
    // A password from the user's vault, filled by the Agent itself; the
    // caller never sees it.
    if (kind === "password" && a.secret_part === "password") return;
    if (kind === "code") throw new Error("BROWSER_AUTH_REQUIRED: one-time codes are turned off or this site has not been approved in Dashboard Browser authentication. Approve OTP for this site or ask the user to enter it.");
    if (kind) throw new Error("BLOCKED_SENSITIVE: Browser Runner never types passwords or payment details from the conversation. Ask the user to enter this field themselves.");
  };
  const visible = (el) => {
    if (!el.isConnected) return false;
    if (el.type === "file") return true; // often visually hidden behind a styled button
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    return el.getClientRects().length > 0;
  };
  const labelText = (el) => {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const root = el.getRootNode && el.getRootNode().getElementById ? el.getRootNode() : document;
      const t = by.split(/\s+/).map((id) => root.getElementById(id)).filter(Boolean).map((n) => n.innerText || n.textContent).join(" ");
      if (t.trim()) return t;
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria;
    if (el.labels && el.labels.length) {
      const t = Array.from(el.labels).map((l) => l.innerText || l.textContent).join(" ");
      if (t.trim()) return t;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "input" && ["submit", "button", "reset"].includes(String(el.type).toLowerCase())) return el.value || el.type;
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return el.getAttribute("placeholder") || el.getAttribute("title") || el.name || el.id || "";
    }
    if (tag === "img") return el.alt || el.title || "";
    return el.innerText || el.textContent || el.getAttribute("title") || "";
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.split(/\s+/)[0];
    const tag = el.tagName.toLowerCase();
    const type = String(el.type || "").toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (el.isContentEditable) return "textbox";
    if (tag === "input") {
      if (["submit", "button", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "file") return "file";
      return "textbox";
    }
    return tag;
  };
  const state = () => window.__remotearcRunner;
  const lookup = () => {
    const s = state();
    if (!s || s.sid !== a.snapshot_id) throw new Error("STALE_REF: the page changed since snapshot " + a.snapshot_id + ". Take a new browser_runner_snapshot.");
    const el = s.els[a.ref];
    if (!el || !el.isConnected) throw new Error("STALE_REF: " + a.ref + " is no longer on the page. Take a new browser_runner_snapshot.");
    return el;
  };
  const describe = (el) => clip(labelText(el), 120);
  // Open shadow roots are part of what the user sees; walk them in document
  // order. Closed roots stay private to the page.
  const walk = (root, visit, budget) => {
    for (const child of root.children || []) {
      if (budget.left-- <= 0) return;
      visit(child);
      if (child.shadowRoot) walk(child.shadowRoot, visit, budget);
      walk(child, visit, budget);
    }
  };
  const shadowRoots = () => {
    const roots = [];
    walk(document.documentElement || document, (el) => { if (el.shadowRoot) roots.push(el.shadowRoot); }, { left: 20000 });
    return roots;
  };
  // elementFromPoint stops at a shadow host; follow it into open roots.
  const deepHit = (x, y) => {
    let hit = document.elementFromPoint(x, y);
    while (hit && hit.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit;
  };
  const composedContains = (outer, inner) => {
    for (let n = inner; n; n = n.parentNode || (n instanceof ShadowRoot ? n.host : null)) if (n === outer) return true;
    return false;
  };
  // Whether the user can actually see el: rendered, big enough to interact
  // with, not parked off the page (CAPTCHA popups wait at top:-10000px) and
  // not hidden by visibility, display or opacity anywhere up the tree.
  const onPage = (el, minimum = 20) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < minimum || r.height < minimum) return false;
    const de = document.documentElement;
    const w = Math.max(de.scrollWidth, innerWidth);
    const h = Math.max(de.scrollHeight, innerHeight);
    const left = r.left + scrollX;
    const top = r.top + scrollY;
    if (left + r.width <= 0 || top + r.height <= 0 || left >= w || top >= h) return false;
    if (getComputedStyle(el).visibility !== "visible") return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement || (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null)) {
      const st = getComputedStyle(n);
      if (st.display === "none" || parseFloat(st.opacity) < 0.1) return false;
    }
    return true;
  };
  const captchaVendor = (s) => (CAPTCHA_VENDORS.find(([re]) => re.test(s)) || [null, "CAPTCHA"])[1];
  // Which part of a CAPTCHA a frame is, from its URL first and size second:
  // "challenge" is the puzzle popup, "widget" the checkbox, "invisible" a
  // background badge that only turns into a challenge when the site asks.
  const captchaPart = (src, el) => {
    if (/[#&?]frame=challenge|\/bframe|\/fc\/gc\/|enforcement/i.test(src)) return "challenge";
    if (/size=invisible|frame=checkbox-invisible/i.test(src)) return "invisible";
    if (/\/anchor|frame=checkbox|turnstile/i.test(src)) return "widget";
    const r = el.getBoundingClientRect();
    return r.width >= 250 && r.height >= 250 ? "challenge" : "widget";
  };
  // CAPTCHA parts on this document, judged only from the outside: the frames
  // may be cross-site. Approved provider frames expose visible controls in the
  // combined snapshot; response tokens stay private. Without approval, an open
  // challenge needs the user.
  const captchaParts = () => {
    const parts = [];
    const frames = [];
    walk(document.documentElement || document, (el) => { if (el.tagName === "IFRAME") frames.push(el); }, { left: 20000 });
    for (const f of frames) {
      const src = f.src || f.getAttribute("src") || "";
      if (!CAPTCHA.test(src)) continue;
      parts.push({ vendor: captchaVendor(src), part: captchaPart(src, f), shown: onPage(f) });
    }
    // A widget whose frame is not loaded, or lives in a closed shadow root.
    for (const c of document.querySelectorAll(".g-recaptcha,.h-captcha,.cf-turnstile,[data-sitekey]")) {
      if (c.querySelector("iframe")) continue;
      const invisible = /invisible/i.test(c.getAttribute("data-size") || "");
      parts.push({ vendor: captchaVendor(String(c.className) + " " + Array.from(c.attributes).map((at) => at.name).join(" ")), part: invisible ? "invisible" : "widget", shown: !invisible && onPage(c) });
    }
    return parts.slice(0, 8);
  };
  const nativeSet = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  };
  const fire = (el, names) => names.forEach((n) => el.dispatchEvent(new Event(n, { bubbles: true })));

  // Shared by snapshots and the post-action/wait scanner. Never enter CAPTCHA
  // frames or read their response tokens; only an active challenge blocks.
  const scanBlockers = () => {
    const blockers = [], attention = [];
    // Only an open challenge stops the task. Hidden, parked or invisible
    // CAPTCHA assets stay mounted after the user solves one and say nothing
    // about whether anything is left to do.
    const captcha = captchaParts();
    const shownBy = (part) => [...new Set(captcha.filter((c) => c.part === part && c.shown).map((c) => c.vendor))];
    for (const v of shownBy("challenge")) (a.allow_captcha ? attention : blockers).push({ kind: "captcha", detail: a.allow_captcha ? v + " verification is approved in Dashboard. Read the challenge frames and interact with their visible controls; request include_captcha_images for image challenges. If it cannot be completed, hand it to the user." : v + " challenge is open. Approve CAPTCHA for this site in Dashboard Browser authentication, or complete it in the Runner window." });
    for (const v of shownBy("widget")) attention.push({ kind: "captcha_widget", detail: a.allow_captcha ? v + " verification is approved; interact with its visible controls. Response tokens stay private to the page." : v + " check is shown. Approve CAPTCHA for this site in Dashboard Browser authentication, or ask the user to complete it." });
    const secret = [];
    walk(document.documentElement || document, el => { if (el.tagName === "INPUT" && onPage(el) && sensitive(el)) secret.push(el); }, { left: 20000 });
    if (secret.some((el) => secretKind(el) === "captcha_answer")) (a.allow_captcha ? attention : blockers).push({kind:"captcha",detail:a.allow_captcha ? "CAPTCHA answer entry is approved for this site." : "Approve CAPTCHA for this site in Dashboard Browser authentication, or complete it yourself."});
    if (secret.some((el) => secretKind(el) === "password")) blockers.push({ kind: "login", detail: "password field present; the user must sign in themselves" });
    if (secret.some((el) => secretKind(el) === "code")) {
      if (a.allow_codes) attention.push({ kind: "verification_code", detail: "OTP sign-in or registration is approved for this site. Get the latest unexpired code from " + (a.mailbox || "the connected app where it was sent") + " for this site and account, then fill the field marked secret: code. Do not reuse codes. The code is never recorded." });
      else blockers.push({ kind: "verification_code", detail: "one-time code requested; approve OTP for this website in Dashboard Browser authentication and enable the local code switch, or ask the user to enter it" });
    }
    return { blockers, attention, captcha };
  };
  if (op === "guard_key_focus") {
    let el=document.activeElement;
    while(el && el.shadowRoot && el.shadowRoot.activeElement)el=el.shadowRoot.activeElement;
    if(el && el.tagName==="IFRAME")throw new Error("BROWSER_AUTH_REQUIRED: keyboard input into an embedded frame requires an explicit ref from a fresh approved snapshot.");
    return true;
  }
  if (op === "frame_visible") return onPage(a.element);
  if (op === "scan_blockers") {
    const result = scanBlockers();
    const roots = [document, ...shadowRoots()];
    const busy = roots.some(root => Array.from(root.querySelectorAll('[role="progressbar"],[aria-busy="true"]')).some(el => onPage(el, 1)));
    const body = roots.map(root => root === document ? (document.body?.innerText || "") : Array.from(root.children).map(c => c.innerText || "").join(" ")).join(" ");
    const hasFile = roots.some(root => Array.from(root.querySelectorAll('input[type="file"]')).some(el => el.files?.length > 0));
    return { ...result, busy: busy || /\b(uploading|processing)\b|上传中|处理中/i.test(body), has_file: hasFile, ready: document.readyState };
  }

  if (op === "install") {
    // Keep navigation inside the one scoped tab: popups and target=_blank
    // would otherwise escape request interception.
    if (!window.__remotearcGuard) {
      window.__remotearcGuard = true;
      document.addEventListener("click", (e) => {
        const link = e.target && e.target.closest && e.target.closest("a[target]");
        if (link && link.target !== "_self") link.target = "_self";
      }, true);
      const open = window.open;
      window.open = function (url) {
        if (url) location.assign(String(url));
        return null;
      };
      window.open.__original = open;
    }
    return true;
  }

  if (op === "snapshot") {
    const maxElements = Math.max(10, Math.min(400, a.max_elements || 150));
    const selector = "a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=combobox],[role=option],[role=tab],[role=menuitem],[role=switch],[contenteditable=true],[contenteditable='']";
    const all = [];
    walk(document.documentElement || document, (el) => {
      if (!el.matches(selector) && !(a.captcha_frame && /^(IMG|CANVAS)$/.test(el.tagName))) return;
      const type = String(el.type || "").toLowerCase();
      if (type !== "hidden" && visible(el)) all.push(el);
    }, { left: 20000 });
    const prefix = a.ref_prefix || "";
    const els = {};
    const elements = [];
    let n = 0;
    for (const el of all) {
      if (elements.length >= maxElements) break;
      const ref = prefix + "e" + ++n;
      els[ref] = el;
      const tag = el.tagName.toLowerCase();
      const type = String(el.type || "").toLowerCase();
      const isSensitive = sensitive(el);
      const item = { ref, role: roleOf(el), name: describe(el) || (a.captcha_frame ? tag + " " + n : "") };
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if (type && tag === "input") item.type = type;
        if (el.required || el.getAttribute("aria-required") === "true") item.required = true;
        if (el.disabled) item.disabled = true;
        if (type === "checkbox" || type === "radio") item.checked = !!el.checked;
        else if (type === "file") {
          item.files = el.files ? el.files.length : 0;
          if (el.accept) item.accept = clip(el.accept, 120);
        } else if (tag === "select") {
          item.value = clip(el.value, 120);
          item.options = Array.from(el.options).slice(0, 60).map((o) => ({ value: clip(o.value, 80), label: clip(o.label || o.text, 80), selected: o.selected }));
        } else if (isSensitive) {
          item.value = el.value ? "[redacted]" : "";
        } else {
          item.value = clip(el.value, 200);
        }
        const invalid = el.validationMessage || (el.getAttribute("aria-invalid") === "true" ? "invalid" : "");
        if (invalid) item.error = clip(invalid, 160);
      } else if (el.isContentEditable) {
        item.value = isSensitive ? "[redacted]" : clip(el.innerText, 200);
      }
      if (tag === "a" && el.href) item.href = clip(el.href, 300);
      if (isSensitive) {
        item.sensitive = true;
        item.secret = secretKind(el);
      }
      if (el.disabled || el.getAttribute("aria-disabled") === "true") item.disabled = true;
      elements.push(item);
    }
    window.__remotearcRunner = { sid: a.snapshot_id, els };
    const { blockers, attention, captcha } = scanBlockers();
    const frames = [];
    for (const f of Array.from(document.querySelectorAll("iframe"))) {
      const src = f.src || "";
      if (CAPTCHA.test(src)) continue;
      if (src && frames.length < 10) {
        try {
          if (new URL(src).origin !== location.origin) frames.push(clip(src.split("#")[0], 300));
        } catch (_) {}
      }
    }
    let body = document.body ? document.body.innerText || "" : "";
    for (const sr of shadowRoots()) {
      const t = Array.from(sr.children).filter((c) => !/^(STYLE|SCRIPT|TEMPLATE|LINK)$/.test(c.tagName)).map((c) => c.innerText || "").join("\n").trim();
      if (t) body += "\n" + t;
    }
    const maxText = Math.max(200, Math.min(20000, a.max_text || 6000));
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).slice(0, 20).map((h) => clip(h.innerText, 120));
    return {
      url: location.href,
      title: clip(document.title, 200),
      headings,
      text: body.length > maxText ? body.slice(0, maxText) : body,
      text_truncated: body.length > maxText,
      elements,
      elements_truncated: all.length > elements.length,
      element_total: all.length,
      forms: document.forms.length,
      cross_origin_frames: frames,
      blockers,
      attention,
      captcha: captcha.length ? captcha : undefined,
    };
  }

  if (op === "effect_risk") {
    const el = lookup();
    const label = describe(el);
    const form = el.form || (el.closest && el.closest("form"));
    const type = String(el.type || "").toLowerCase();
    // What this control acts on, so a new idempotency key cannot send the same
    // thing twice while other steps of a multi-page flow stay possible.
    // Field names (never values) tell apart steps that share a URL and label.
    const scope = form || (el.closest && el.closest("fieldset, [role=form], dialog, section, main")) || document.body;
    const names = new Set();
    for (const f of scope.querySelectorAll("input, select, textarea")) {
      const n = f.name || f.id;
      if (n && String(f.type || "").toLowerCase() !== "hidden") names.add(n);
    }
    const strip = (u) => { try { const x = new URL(u, location.href); return x.origin + x.pathname; } catch (e) { return ""; } };
    const target = {
      method: form ? String(form.method || "get").toLowerCase() : "",
      action: strip(form ? form.action : location.href),
      label: label.toLowerCase().replace(/\s+/g, " ").trim(),
      fields: [...names].sort().slice(0, 50),
    };
    // Whether a click here may load another page or step, which decides how
    // long the Runner waits for one to begin. Controls that only change the
    // current view (choices, options, tabs, menus, toggles) do not.
    const link = el.closest && el.closest("a[href]");
    const href = link ? String(link.getAttribute("href") || "").trim() : "";
    const navLink = !!link && href !== "" && !/^(#|javascript:)/i.test(href);
    const buttonType = el.tagName === "BUTTON" ? String(el.getAttribute("type") || "submit").toLowerCase() : type;
    const formButton = !!form && (buttonType === "submit" || buttonType === "image");
    const role = roleOf(el);
    const toggles = ["checkbox", "radio", "option", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "switch", "combobox", "listbox", "treeitem", "textbox", "slider", "spinbutton", "label", "summary", "select"].includes(role) ||
      el.hasAttribute("aria-expanded") || el.hasAttribute("aria-haspopup") || el.hasAttribute("aria-pressed");
    const stepWords = /\b(next|continue|proceed|start|begin|sign in|log in|login|search|go|view|back|previous|review|save|submit|apply|checkout|buy|book|pay|confirm|finish|done)\b/i.test(label);
    const mayNavigate = navLink || formButton || (!toggles && stepWords);
    // A regular href is navigation even when the label says "Apply now".
    if (el.tagName === "A" && el.href && !form) return { requires_submit: false, may_navigate: mayNavigate, kind: "", target };
    const danger = /\b(submit|send|apply|finish|confirm|place order|book now|purchase|pay now|delete|publish|post|save changes|complete application)\b/i.test(label);
    // GET-form Next means navigation; a POST native submit is an external effect.
    const formSubmits = !!form && (type === "submit" || type === "image") && (form.method.toLowerCase() !== "get" || danger);
    // Sign-in and verification steps (an identifier, a password the user
    // typed, a one-time code) are repeated whenever a session expires; they
    // are never one-time submits. Strong purchase or publish words override.
    const inputs = Array.from(scope.querySelectorAll("input, select, textarea")).filter((f) => {
      const t = String(f.type || "").toLowerCase();
      return !["hidden", "submit", "button", "image", "reset"].includes(t) && visible(f);
    });
    const hint = (f) => [f.type, f.name, f.id, f.getAttribute("autocomplete"), labelText(f)].join(" ");
    const choice = (f) => /^(checkbox|radio)$/i.test(String(f.type || ""));
    const password = inputs.some((f) => String(f.type).toLowerCase() === "password");
    const code = inputs.some((f) => /one-time-code|\botp\b|verification|passcode|security code|\bcode\b/i.test(hint(f)));
    const identifier = inputs.some((f) => !choice(f)) && inputs.filter((f) => !choice(f)).length <= 2 && inputs.every((f) => choice(f) || /e-?mail|user|login|account|phone|mobile/i.test(hint(f)));
    const authWords = /\b(sign ?in|log ?in|log ?on|sign ?on|sign ?up|register|create account|send (me )?(a |the )?(code|link)|resend|verify|one-time|continue with|continue|next)\b|登录|登入|注册|註冊|验证|驗證/i.test(label);
    const authPlace = /(login|signin|sign-in|identity|auth|sso|oauth)/i.test(location.hostname + location.pathname);
    const strongFinal = /\b(pay|purchase|place order|book now|submit application|complete application|delete|publish|post)\b/i.test(label);
    const auth = !strongFinal && ((a.captcha_frame && a.allow_captcha) || password || code || (identifier && (authWords || (authPlace && !danger))));
    // final: sent once, confirmed by the caller. step: a page of a longer
    // form; it may be saved again and settles itself when the next page opens.
    const kind = auth ? "auth" : danger ? "final" : formSubmits ? "step" : "";
    return { requires_submit: !auth && (formSubmits || danger), may_navigate: mayNavigate || formSubmits || danger, kind, target };
  }

  if (op === "step_state") {
    // What tells one page of a form from the next: its field names and
    // headings. Values are never read.
    const names = new Set();
    for (const f of document.querySelectorAll("input, select, textarea")) {
      const t = String(f.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(t) || !visible(f)) continue;
      names.add(f.name || f.id || t);
    }
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, legend")).filter(visible).map((h) => clip(h.innerText, 120)).filter(Boolean);
    return { fields: [...names].sort().join("|").slice(0, 2000), headings: headings.slice(0, 8), title: clip(document.title, 200) };
  }

  if (op === "watch_logins") {
    // Tell the Agent when a sign-in form is sent, so a sign-in the user did
    // once in the Runner window can be saved to the vault on this computer.
    // Runs only in the Runner's isolated world; the page cannot call it.
    if (window.__remotearcLogins) return true;
    window.__remotearcLogins = true;
    const report = (scope) => {
      try {
        if (typeof window.__remotearcLogin !== "function") return;
        const root = scope && scope.querySelectorAll ? scope : document;
        const fields = Array.from(root.querySelectorAll("input")).filter((f) => visible(f) && f.value);
        const pw = fields.find((f) => secretKind(f) === "password");
        const id = fields.find((f) => /^(email|text|tel)$/i.test(f.type || "text") && !sensitive(f) && /e-?mail|user|login|account|phone/i.test([f.type, f.name, f.id, f.getAttribute("autocomplete"), labelText(f)].join(" ")));
        if (!pw && !id) return;
        window.__remotearcLogin(JSON.stringify({ url: location.href, username: id ? id.value : "", password: pw ? pw.value : "" }));
      } catch (_) {}
    };
    document.addEventListener("submit", (e) => report(e.target), true);
    document.addEventListener("click", (e) => {
      const b = e.isTrusted && e.target && e.target.closest && e.target.closest("button, input[type=submit], input[type=image], [role=button]");
      if (b) report(b.form || b.closest("form") || document);
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.isTrusted && e.key === "Enter" && e.target && e.target.tagName === "INPUT") report(e.target.form || document);
    }, true);
    return true;
  }

  if (op === "quiet") {
    // How long the DOM has been unchanged, so the Runner can continue as soon
    // as the page has taken in an action rather than after a fixed delay.
    let q = window.__remotearcQuiet;
    if (!q || q.doc !== document) {
      q = window.__remotearcQuiet = { doc: document, last: performance.now(), changes: 0 };
      new MutationObserver((records) => {
        q.last = performance.now();
        q.changes += records.length;
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    return { idle: Math.round(performance.now() - q.last), changes: q.changes };
  }

  const CAPTCHA_REFUSAL = "BLOCKED_CAPTCHA: response tokens are private. Use approved visible CAPTCHA controls; never read, inject or supply response tokens.";

  if (op === "locate") {
    const el = lookup();
    if (a.action === "fill") refuseSecret(el);
    // A saved password goes only into a password field, never a field whose
    // value a snapshot would show.
    if (a.secret_part === "password" && secretKind(el) !== "password") throw new Error("WRONG_FIELD: " + describe(el) + " is not a password field; fill the password only into the field marked secret: password.");
    if (el.disabled || el.getAttribute("aria-disabled") === "true") throw new Error("DISABLED: " + describe(el) + " is disabled.");
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = deepHit(x, y);
    const reachable = !!hit && (hit === el || composedContains(el, hit) || composedContains(hit, el) || (el.labels && Array.from(el.labels).some((l) => composedContains(l, hit))));
    return { x, y, width: r.width, height: r.height, reachable, label: describe(el), tag: el.tagName.toLowerCase(), type: String(el.type || "").toLowerCase(), sensitive: sensitive(el) };
  }

  if (op === "arm_click") {
    // Records whether the next trusted click actually reaches this element.
    const el = lookup();
    const s = state();
    s.clickSeen = false;
    window.addEventListener("click", (e) => {
      // composedPath sees through shadow roots; e.target is retargeted.
      const path = e.composedPath();
      if (e.isTrusted && (path.includes(el) || (el.labels && Array.from(el.labels).some((l) => path.includes(l))))) s.clickSeen = true;
    }, { capture: true, once: true });
    return true;
  }

  if (op === "click_seen") {
    const s = state();
    return !!(s && s.clickSeen);
  }

  if (op === "jsclick") {
    lookup().click();
    return true;
  }

  if (op === "prepare_fill") {
    const el = lookup();
    refuseSecret(el);
    const type = String(el.type || "").toLowerCase();
    if (["checkbox", "radio", "file", "submit", "button", "image", "reset"].includes(type) || el.tagName === "SELECT") throw new Error("WRONG_ACTION: use " + (el.tagName === "SELECT" ? "select" : type === "file" ? "action=upload" : "click/check") + " for " + describe(el) + ".");
    el.focus();
    if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (typeof el.select === "function") {
      el.select();
    }
    return true;
  }

  if (op === "finish_fill") {
    const el = lookup();
    const want = String(a.value);
    const got = el.isContentEditable ? el.innerText : el.value;
    if (got !== want && !el.isContentEditable) {
      nativeSet(el, want);
      fire(el, ["input"]);
    }
    fire(el, ["change"]);
    const now = el.isContentEditable ? el.innerText : el.value;
    // Report only whether the field holds the requested value, never the value.
    return { matched: now === want || (el.isContentEditable && now.trim() === want.trim()), length: String(now).length, maxlength: el.maxLength > 0 ? el.maxLength : null };
  }

  if (op === "select") {
    const el = lookup();
    if (el.tagName !== "SELECT") throw new Error("WRONG_ACTION: " + describe(el) + " is not a native select. Click it, take a new snapshot and click the option.");
    const want = String(a.value).trim().toLowerCase();
    const opts = Array.from(el.options);
    const pick = opts.find((o) => o.value.toLowerCase() === want) || opts.find((o) => (o.label || o.text).trim().toLowerCase() === want) || opts.find((o) => (o.label || o.text).toLowerCase().includes(want));
    if (!pick) throw new Error("NO_OPTION: no option matches " + JSON.stringify(a.value) + ". Available: " + opts.slice(0, 20).map((o) => clip(o.label || o.text, 40)).join(" | "));
    nativeSet(el, pick.value);
    fire(el, ["input", "change"]);
    return { selected: clip(pick.label || pick.text, 120), label: describe(el) };
  }

  if (op === "check") {
    const el = lookup();
    const want = !!a.checked;
    if (el.type === "checkbox" || el.type === "radio") {
      if (el.checked !== want) el.click();
      return { checked: el.checked, label: describe(el) };
    }
    const aria = el.getAttribute("aria-checked");
    if (aria !== null) {
      if ((aria === "true") !== want) el.click();
      return { checked: el.getAttribute("aria-checked") === "true", label: describe(el) };
    }
    throw new Error("WRONG_ACTION: " + describe(el) + " is not a checkbox, radio or switch.");
  }

  if (op === "focus") {
    lookup().focus();
    return true;
  }

  if (op === "file_input") {
    const el = lookup();
    if (el.tagName !== "INPUT" || String(el.type).toLowerCase() !== "file") throw new Error("WRONG_ACTION: " + describe(el) + " is not a file input. Look for the input with role \"file\" in the snapshot.");
    if (el.disabled) throw new Error("DISABLED: " + describe(el) + " is disabled.");
    return el;
  }

  if (op === "file_state") {
    const el = lookup();
    return { files: el.files ? Array.from(el.files).map((f) => ({ name: f.name, size: f.size })) : [], label: describe(el), accept: el.accept || "" };
  }

  if (op === "probe") {
    let body = document.body ? document.body.innerText || "" : "";
    if (a.text) for (const sr of shadowRoots()) body += "\n" + Array.from(sr.children).map((c) => c.innerText || "").join("\n");
    const needle = a.text ? String(a.text).toLowerCase() : "";
    return { url: location.href, ready: document.readyState, title: clip(document.title, 200), text_found: needle ? body.toLowerCase().includes(needle) : null };
  }

  throw new Error("unknown helper op " + op);
})
