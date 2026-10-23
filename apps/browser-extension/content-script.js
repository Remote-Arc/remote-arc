(() => {
  if (globalThis.__remoteArcBrowserInstalled) return;
  globalThis.__remoteArcBrowserInstalled = true;

  const clean = (value, max = 4000) =>
    String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };

  // The text a person would read for a control: its own label first, then
  // what it shows. Every lookup is guarded so unusual pages cannot break a
  // snapshot.
  const labelText = (element) => {
    try {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy && typeof document.getElementById === "function") {
        const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
        if (clean(text)) return clean(text, 240);
      }
      const labels = element.labels;
      if (labels && labels.length) return clean(Array.from(labels).map((l) => l.textContent).join(" "), 240);
      const wrapping = typeof element.closest === "function" ? element.closest("label") : null;
      if (wrapping) return clean(wrapping.textContent, 240);
    } catch {
      // fall through to the element's own text
    }
    return "";
  };

  const accessibleName = (element) =>
    clean(
      element.getAttribute("aria-label") ||
      labelText(element) ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.innerText ||
      element.textContent ||
      element.getAttribute("value") ||
      "",
      240,
    );

  const roleFor = (element) => {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea" || element.isContentEditable) return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (["checkbox", "radio"].includes(type)) return type;
      return "textbox";
    }
    return tag;
  };

  // password / payment / file are never filled through Remote Arc. A
  // one-time code may be filled through shared_tab_act when the user allows
  // codes (the default), like Browser Runner.
  const secretKind = (element) => {
    if (!(element instanceof HTMLInputElement)) return "";
    const type = (element.type || "text").toLowerCase();
    if (type === "password") return "password";
    if (type === "file") return "file";
    const tokens = String(element.autocomplete || "").toLowerCase().split(/\s+/);
    if (tokens.some((t) => t === "current-password" || t === "new-password")) return "password";
    if (tokens.some((t) => t.startsWith("cc-"))) return "payment";
    if (tokens.includes("one-time-code")) return "code";
    return "";
  };

  const isSensitiveField = (element) => secretKind(element) !== "";

  const fillable = (element) => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return !element.disabled;
    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      return !element.disabled && !["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image"].includes(type);
    }
    return Boolean(element.isContentEditable);
  };

  const canFill = (element) => !isSensitiveField(element) && fillable(element);

  let snapshotSequence = 0;
  let activeSnapshotId = null;
  const snapshotElements = new Map();

  const nextSnapshotId = () => {
    snapshotSequence += 1;
    return `s${Date.now().toString(36)}-${snapshotSequence.toString(36)}`;
  };

  // Facts that help pick the right control; never a field's value.
  function details(element) {
    const out = {};
    try {
      const label = labelText(element);
      if (label) out.label = label;
      if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes((element.type || "").toLowerCase())) out.checked = Boolean(element.checked);
      if (element instanceof HTMLSelectElement && element.options) {
        out.options = Array.from(element.options).slice(0, 40).map((o) => clean(o.textContent, 120));
      }
      if (element.required || element.getAttribute("aria-required") === "true") out.required = true;
      const expanded = element.getAttribute("aria-expanded");
      if (expanded !== null) out.expanded = expanded === "true";
      const secret = secretKind(element);
      if (secret) out.secret = secret;
    } catch {
      // details are optional
    }
    return out;
  }

  function snapshot() {
    const snapshotId = nextSnapshotId();
    activeSnapshotId = snapshotId;
    snapshotElements.clear();

    let next = 1;
    const selector = "a[href],button,input,textarea,select,[contenteditable]:not([contenteditable='false']),[role],[tabindex],[onclick]";
    const interactiveElements = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      if (element instanceof HTMLInputElement && (element.type || "").toLowerCase() === "hidden") continue;
      const ref = "e" + next++;
      const type = element.getAttribute("type") || undefined;
      snapshotElements.set(ref, element);
      interactiveElements.push({
        ref,
        role: roleFor(element),
        name: accessibleName(element),
        ...(type ? { type } : {}),
        disabled: Boolean(element.disabled),
        canClick: !Boolean(element.disabled),
        canFill: canFill(element),
        sensitive: isSensitiveField(element),
        ...details(element),
      });
      if (interactiveElements.length >= 250) break;
    }

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .slice(0, 80)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: clean(el.textContent, 500) }));

    return {
      snapshotId,
      url: location.href,
      origin: location.origin,
      title: document.title,
      headings,
      text: clean(document.body?.innerText || "", 50000),
      interactiveElements,
    };
  }

  function links() {
    return Array.from(document.querySelectorAll("a[href]"))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .slice(0, 300)
      .map((el) => ({ text: accessibleName(el), href: el.href }));
  }

  function table(index = 0) {
    const tables = Array.from(document.querySelectorAll("table")).filter((el) => visible(el));
    const target = tables[index];
    if (!target) return { tableIndex: index, rows: [], error: "table not found" };
    const rows = Array.from(target.querySelectorAll("tr")).slice(0, 100).map((row) =>
      Array.from(row.querySelectorAll("th,td")).slice(0, 30).map((cell) => clean(cell.textContent, 1000))
    );
    return { tableIndex: index, tableCount: tables.length, rows };
  }

  function resolveElement(snapshotId, ref) {
    if (!snapshotId || snapshotId !== activeSnapshotId) {
      throw new Error("Snapshot is stale. Call browser_read_page again before interacting.");
    }
    const element = snapshotElements.get(String(ref || ""));
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      throw new Error("Element ref is stale. Call browser_read_page again.");
    }
    if (!visible(element)) {
      throw new Error("Element is no longer visible. Call browser_read_page again.");
    }
    if (element.disabled) {
      throw new Error("Element is disabled.");
    }
    return element;
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  // Rich editors (comment boxes, posts) keep their own model of the text and
  // only follow edits they see as typing; insertText is what they listen to.
  function typeInto(element, value) {
    element.focus();
    let inserted = false;
    try {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      inserted = document.execCommand("insertText", false, value);
    } catch {
      inserted = false;
    }
    if (!inserted || clean(element.textContent, 20000) !== clean(value, 20000)) {
      element.textContent = value;
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function setValue(element, value) {
    if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find(
        (item) => item.value === value || clean(item.textContent, 500) === clean(value, 500),
      ) || Array.from(element.options).find((item) => clean(item.textContent, 500).toLowerCase() === clean(value, 500).toLowerCase());
      if (!option) throw new Error("No matching select option.");
      element.focus();
      setNativeValue(element, option.value);
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      setNativeValue(element, value);
    } else if (element.isContentEditable) {
      typeInto(element, value);
      return;
    }
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillElement(snapshotId, ref, rawValue, allowCodes = false) {
    const element = resolveElement(snapshotId, ref);
    const secret = secretKind(element);
    if (secret && !(secret === "code" && allowCodes)) {
      throw new Error("Remote Arc blocks filling password, one-time-code, payment, and file fields.");
    }
    if (!fillable(element)) {
      throw new Error("Element cannot be filled. Use browser_click for buttons, checkboxes, or radio controls.");
    }

    const value = String(rawValue ?? "").slice(0, 20000);
    setValue(element, value);

    return {
      ok: true,
      action: "fill",
      ref,
      role: roleFor(element),
      name: accessibleName(element),
      length: value.length,
      url: location.href,
    };
  }

  function prepareClick(snapshotId, ref) {
    const element = resolveElement(snapshotId, ref);
    if (element instanceof HTMLInputElement && (element.type || "").toLowerCase() === "file") {
      throw new Error("Remote Arc does not open local file pickers.");
    }

    activeSnapshotId = null;
    snapshotElements.clear();

    return {
      result: {
        ok: true,
        action: "click",
        ref,
        role: roleFor(element),
        name: accessibleName(element),
        url: location.href,
      },
      run: () => {
        element.focus();
        element.click();
      },
    };
  }

  // ---- shared_tab_act -------------------------------------------------

  // Words that make a click an external, one-time action: sent once and
  // settled by the caller. English, Chinese and common checkout wording.
  const FINAL_WORDS = /\b(submit|send|apply|finish|confirm|place (your )?order|order now|book now|buy now|purchase|pay( now)?|checkout now|delete|remove account|publish|post|tweet|reply|comment|save changes|complete application)\b|提交|发送|发布|发表|评论|回复|支付|付款|购买|下单|立即购买|确认订单|确认支付|预订|预定|删除|投递|申请职位|确认购票|立即预订/i;
  const STRONG_FINAL = /\b(pay|purchase|place (your )?order|book now|buy now|submit application|complete application|delete|publish|post|comment|reply)\b|支付|付款|购买|下单|发布|发表|评论|删除/i;
  const AUTH_WORDS = /\b(sign ?in|log ?in|log ?on|sign ?on|send (me )?(a |the )?(code|link)|resend|verify|one-time|continue with|continue|next)\b|登录|登陆|获取验证码|发送验证码|下一步/i;
  const STEP_WORDS = /\b(next|continue|proceed|start|begin|sign in|log in|login|search|go|view|back|previous|review|save|submit|apply|checkout|buy|book|pay|confirm|finish|done)\b|下一步|继续|搜索|查看|返回|保存|结算|登录/i;

  // What a click or Enter on element does: kind "final" (one-time external
  // effect), "auth" (sign-in, repeatable), "step" (a page of a longer form)
  // or "" (navigation or view change). target identifies the form and button
  // (field names, never values) so one action cannot be sent twice.
  function effectOf(element, enter = false) {
    const form = element.form || (typeof element.closest === "function" ? element.closest("form") : null);
    let control = element;
    if (enter && form) {
      control = form.querySelector("button[type=submit], input[type=submit], button:not([type])") || element;
    }
    const label = clean(accessibleName(control), 240);
    const type = String(control.type || "").toLowerCase();
    const scope = form || (typeof control.closest === "function" && control.closest("fieldset, [role=form], dialog, [role=dialog], section, main")) || document.body;
    const inputs = Array.from(scope.querySelectorAll ? scope.querySelectorAll("input, select, textarea, [contenteditable]:not([contenteditable='false'])") : [])
      .filter((f) => !["hidden", "submit", "button", "image", "reset"].includes(String(f.type || "").toLowerCase()));
    const names = [...new Set(inputs.map((f) => f.name || f.id).filter(Boolean))].sort().slice(0, 50);
    const strip = (u) => { try { const x = new URL(u, location.href); return x.origin + x.pathname; } catch { return ""; } };
    const target = JSON.stringify({
      method: form ? String(form.method || "get").toLowerCase() : "",
      action: strip(form ? form.action : location.href),
      label: label.toLowerCase(),
      fields: names,
    });
    const link = typeof control.closest === "function" ? control.closest("a[href]") : null;
    const href = link ? String(link.getAttribute("href") || "").trim() : "";
    const navLink = Boolean(link) && href !== "" && !/^(#|javascript:)/i.test(href);
    const buttonType = control.tagName === "BUTTON" ? String(control.getAttribute("type") || "submit").toLowerCase() : type;
    const formButton = Boolean(form) && (buttonType === "submit" || buttonType === "image");
    const role = roleFor(control);
    const toggles = ["checkbox", "radio", "option", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "switch", "combobox", "listbox", "treeitem", "textbox", "slider", "spinbutton", "label", "summary", "select"].includes(role) ||
      control.hasAttribute("aria-expanded") || control.hasAttribute("aria-haspopup") || control.hasAttribute("aria-pressed");
    const mayNavigate = navLink || formButton || enter || (!toggles && STEP_WORDS.test(label));
    if (control.tagName === "A" && control.href && !form && !toggles) {
      return { kind: "", may_navigate: mayNavigate, target, label };
    }
    if (toggles && !enter) return { kind: "", may_navigate: false, target, label };
    const danger = FINAL_WORDS.test(label);
    const formSubmits = Boolean(form) && (formButton || enter) && (String(form.method || "get").toLowerCase() !== "get" || danger);
    const hint = (f) => [f.type, f.name, f.id, f.getAttribute && f.getAttribute("autocomplete"), labelText(f)].join(" ");
    const choice = (f) => /^(checkbox|radio)$/i.test(String(f.type || ""));
    const shown = inputs.filter((f) => { try { return visible(f); } catch { return true; } });
    const password = shown.some((f) => secretKind(f) === "password");
    const code = shown.some((f) => /one-time-code|\botp\b|verification|passcode|security code|\bcode\b|验证码/i.test(hint(f)));
    const typed = shown.filter((f) => !choice(f));
    const identifier = typed.length > 0 && typed.length <= 2 && typed.every((f) => /e-?mail|user|login|account|phone|mobile|手机|邮箱|账号/i.test(hint(f)));
    const authPlace = /(login|signin|sign-in|identity|auth|sso|oauth|passport)/i.test(location.hostname + location.pathname);
    const auth = !STRONG_FINAL.test(label) && (password || code || (identifier && !danger && (AUTH_WORDS.test(label) || authPlace)));
    const kind = auth ? "auth" : danger ? "final" : formSubmits ? "step" : "";
    return { kind, may_navigate: mayNavigate || formSubmits || danger, target, label };
  }

  const KEYS = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Space: { key: " ", code: "Space", keyCode: 32 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  };

  const tabbable = () => Array.from(document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1']),[contenteditable]:not([contenteditable='false'])"))
    .filter((el) => !el.disabled && (el.type || "").toLowerCase() !== "hidden" && visible(el));

  function dispatchKey(target, name) {
    const k = KEYS[name];
    const init = { key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode, bubbles: true, cancelable: true, composed: true };
    const proceed = target.dispatchEvent(new KeyboardEvent("keydown", init));
    if (k.key.length === 1 || name === "Enter") target.dispatchEvent(new KeyboardEvent("keypress", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
    return proceed;
  }

  function press(element, name) {
    if (!KEYS[name]) throw new Error("Unsupported key: " + name);
    const target = element || document.activeElement || document.body;
    if (element) element.focus();
    const proceed = dispatchKey(target, name);
    if (!proceed) return;
    // Default actions a script cannot get from a synthetic key event.
    if (name === "Enter") {
      const form = target.form || (typeof target.closest === "function" ? target.closest("form") : null);
      if (form && !(target instanceof HTMLTextAreaElement) && !target.isContentEditable) {
        const submitter = form.querySelector("button[type=submit], input[type=submit], button:not([type])");
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitter || undefined);
        else form.submit();
      } else if (target.tagName === "A" || target.tagName === "BUTTON" || target.getAttribute("role") === "button") {
        target.click();
      }
    } else if (name === "Space" && (target.tagName === "BUTTON" || ["checkbox", "radio"].includes(String(target.type || "").toLowerCase()) || target.getAttribute("role") === "button")) {
      target.click();
    } else if (name === "Tab") {
      const list = tabbable();
      const i = list.indexOf(document.activeElement);
      list[(i + 1) % list.length]?.focus();
    } else if (["PageDown", "PageUp", "Home", "End"].includes(name) && !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      const by = { PageDown: innerHeight * 0.9, PageUp: -innerHeight * 0.9 }[name];
      if (by) scrollBy(0, by);
      else scrollTo(0, name === "Home" ? 0 : document.documentElement.scrollHeight);
    }
  }

  function scroll(element, direction) {
    if (element) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    const by = { down: innerHeight * 0.9, up: -innerHeight * 0.9 }[direction || "down"];
    if (by !== undefined) scrollBy(0, by);
    else scrollTo(0, direction === "top" ? 0 : document.documentElement.scrollHeight);
  }

  function checkElement(element, want) {
    const isBox = element instanceof HTMLInputElement && ["checkbox", "radio"].includes((element.type || "").toLowerCase());
    const current = isBox ? element.checked : element.getAttribute("aria-checked") === "true";
    if (current === want) return false;
    if (!want && isBox && element.type.toLowerCase() === "radio") throw new Error("A radio button is cleared by choosing another option.");
    element.click();
    return true;
  }

  function actOne(args) {
    const action = String(args.action || "");
    const allowCodes = args.allow_codes !== false;
    if (action === "fill") {
      return fillElement(args.snapshot_id, args.ref, args.value, allowCodes);
    }
    if (action === "select") {
      const element = resolveElement(args.snapshot_id, args.ref);
      if (!(element instanceof HTMLSelectElement)) throw new Error("Element is not a native select. Click it to open its options, then click the option.");
      setValue(element, String(args.value ?? ""));
      return { ok: true, action, ref: args.ref, name: accessibleName(element), selected: clean(element.selectedOptions?.[0]?.textContent, 200) };
    }
    if (action === "check" || action === "uncheck") {
      const element = resolveElement(args.snapshot_id, args.ref);
      const changed = checkElement(element, action === "check");
      return { ok: true, action, ref: args.ref, name: accessibleName(element), changed };
    }
    if (action === "scroll") {
      const element = args.ref ? resolveElement(args.snapshot_id, args.ref) : null;
      scroll(element, args.value);
      return { ok: true, action, ref: args.ref || null };
    }
    throw new Error("Unsupported action: " + action);
  }

  function fillForm(args) {
    const fields = Array.isArray(args.fields) ? args.fields.slice(0, 40) : [];
    const results = fields.map((field) => {
      try {
        const action = field.action || "fill";
        if (!["fill", "select", "check", "uncheck"].includes(action)) throw new Error("fill_form only fills, selects, checks or unchecks.");
        const out = actOne({ ...field, action, snapshot_id: args.snapshot_id, allow_codes: args.allow_codes });
        return { ref: field.ref, ok: true, ...(out.selected ? { selected: out.selected } : {}) };
      } catch (error) {
        return { ref: field.ref, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    return { ok: results.every((r) => r.ok), action: "fill_form", fields: results, url: location.href };
  }

  // Resolves once the page has stopped changing for quietMs, or after
  // limitMs, so the next snapshot shows the result of the action.
  function quiet(quietMs = 150, limitMs = 2000) {
    return new Promise((resolve) => {
      const started = Date.now();
      let last = Date.now();
      let mutations = 0;
      const observer = new MutationObserver((list) => { mutations += list.length; last = Date.now(); });
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      const tick = () => {
        const now = Date.now();
        if (now - last >= quietMs || now - started >= limitMs) {
          observer.disconnect();
          resolve({ waited_ms: now - started, mutations });
        } else {
          setTimeout(tick, 40);
        }
      };
      setTimeout(tick, Math.min(quietMs, 60));
    });
  }

  function respond(sendResponse, work) {
    Promise.resolve()
      .then(work)
      .then(sendResponse, (error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.source !== "remote-arc-browser") return;
      const args = message.arguments || {};
      if (message.tool === "browser_read_page") sendResponse(snapshot());
      else if (message.tool === "browser_get_selected_text") sendResponse({ text: clean(getSelection()?.toString() || "", 20000), url: location.href });
      else if (message.tool === "browser_extract_links") sendResponse({ url: location.href, links: links() });
      else if (message.tool === "browser_extract_table") sendResponse({ url: location.href, ...table(Number(args.table_index || 0)) });
      else if (message.tool === "browser_fill") {
        sendResponse(fillElement(args.snapshot_id, args.ref, args.value));
      } else if (message.tool === "browser_click") {
        const prepared = prepareClick(args.snapshot_id, args.ref);
        sendResponse(prepared.result);
        setTimeout(prepared.run, 0);
      } else if (message.tool === "ra_back") {
        if (history.length < 2) throw new Error("There is no earlier page in this tab.");
        sendResponse({ ok: true });
        setTimeout(() => history.back(), 0);
      } else if (message.tool === "ra_ping") {
        sendResponse({ ok: true, url: location.href });
      } else if (message.tool === "ra_state") {
        const text = args.text ? clean(document.body?.innerText || "", 200000).toLowerCase().includes(clean(args.text, 2000).toLowerCase()) : undefined;
        sendResponse({ url: location.href, title: document.title, ready: document.readyState, ...(text === undefined ? {} : { has_text: text }) });
      } else if (message.tool === "ra_effect") {
        const element = args.ref ? resolveElement(args.snapshot_id, args.ref) : (document.activeElement || document.body);
        sendResponse(effectOf(element, args.key === "Enter"));
      } else if (message.tool === "ra_act") {
        const action = String(args.action || "");
        if (action === "click") {
          const prepared = prepareClick(args.snapshot_id, args.ref);
          sendResponse(prepared.result);
          setTimeout(prepared.run, 0);
        } else if (action === "press") {
          if (!KEYS[String(args.key || "")]) throw new Error("Unsupported key: " + args.key);
          const element = args.ref ? resolveElement(args.snapshot_id, args.ref) : null;
          sendResponse({ ok: true, action, key: args.key, ref: args.ref || null, url: location.href });
          setTimeout(() => press(element, String(args.key || "")), 0);
        } else if (action === "fill_form") {
          sendResponse(fillForm(args));
        } else {
          sendResponse(actOne(args));
        }
      } else if (message.tool === "ra_quiet") {
        respond(sendResponse, () => quiet(Number(args.quiet_ms || 150), Number(args.limit_ms || 2000)));
      } else sendResponse({ error: "unsupported browser tool" });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  });
})();
