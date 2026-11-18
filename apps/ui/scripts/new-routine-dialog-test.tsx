// "New routine" offers two ways to make one: a prompt for the person's own AI
// (copied, or opened in ChatGPT or Claude) and Arc. Both start from the same templates.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import {
  ROUTINE_TEMPLATES,
  aiConversationLinks,
} from "../src/features/routines/routine-templates.js";

// Node cannot load the components' stylesheets; styles are not under test.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css"))
      return { url: "data:text/javascript,export default {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { I18nProvider } = await import("../src/app/i18n.js");
const { NewRoutineDialog } = await import("../src/features/routines/new-routine-dialog.js");
const { RoutinesEmpty } = await import("../src/features/routines/routines-empty.js");
const { RoutinesPage } = await import("../src/features/routines/routines-page.js");

(globalThis as any).location = {
  hostname: "admin.remotearc.app", // Keeps client telemetry out of this isolated test.
  pathname: "/dashboard/agent/routines",
  search: "",
  href: "https://admin.remotearc.app/dashboard/agent/routines",
};
(globalThis as any).window = {
  location: (globalThis as any).location,
  addEventListener() {},
  removeEventListener() {},
  setTimeout,
  clearTimeout,
};
(globalThis as any).document = { documentElement: {}, querySelector: () => null };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const clipboard: string[] = [];
let clipboardFails = false;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      writeText: async (text: string) => {
        if (clipboardFails) throw new Error("denied");
        clipboard.push(text);
      },
    },
  },
});
await loadLocale("en", "dashboard");
await loadLocale("zh", "dashboard");
const en = createTranslator("en");
const zh = createTranslator("zh");

// Stands in for the <dialog> element so showModal and close can be counted.
const dialogCalls: string[] = [];
const createNodeMock = (element: { type: string }) =>
  element.type === "dialog"
    ? { showModal: () => dialogCalls.push("showModal"), close: () => dialogCalls.push("close") }
    : null;

const text = (node: any): string =>
  node.children.map((child: any) => (typeof child === "string" ? child : text(child))).join("");
const byText = (root: any, type: string, label: string) =>
  root.find((node: any) => node.type === type && text(node) === label);

function renderDialog(arcAvailable: boolean, language: "en" | "zh" = "en") {
  const calls: string[] = [];
  const chats: (string | undefined)[] = [];
  let renderer: any;
  act(() => {
    renderer = create(
      <I18nProvider initialLanguage={language}>
        <NewRoutineDialog
          arcAvailable={arcAvailable}
          onChat={(prompt) => {
            calls.push("chat");
            chats.push(prompt);
          }}
          onConnectAI={() => calls.push("connect")}
          onClose={() => calls.push("close")}
        />
      </I18nProvider>,
      { createNodeMock },
    );
  });
  return { renderer, root: renderer.root, calls, chats };
}

// Every template has a prompt for each way, and the one for the person's own AI names Remote Arc.
{
  for (const tr of [en, zh]) {
    for (const template of ROUTINE_TEMPLATES) {
      const ai = tr(template.aiPrompt);
      assert.notEqual(ai, template.aiPrompt, `${template.id} has an AI prompt in both languages`);
      assert.notEqual(tr(template.arcPrompt), template.arcPrompt);
      assert.match(ai, /Remote Arc/, `${template.id} tells the person's AI to use Remote Arc`);
    }
  }
  const prompt = "Watch https://shop.example/a?x=1&y=2 #now";
  const links = aiConversationLinks(prompt);
  assert.equal(new URL(links.chatgpt).origin, "https://chatgpt.com");
  assert.equal(new URL(links.chatgpt).searchParams.get("q"), prompt);
  assert.equal(
    new URL(links.claude).origin + new URL(links.claude).pathname,
    "https://claude.ai/new",
  );
  assert.equal(new URL(links.claude).searchParams.get("q"), prompt, "the prompt survives encoding");
  console.log("PASS: every template has an Arc prompt and a Remote Arc prompt for the person's AI");
}

// With Arc: both ways, opened as a modal, starting from the blank template.
{
  dialogCalls.length = 0;
  const { renderer, root, calls, chats } = renderDialog(true);
  assert.deepEqual(dialogCalls, ["showModal"], "the dialog opens as a modal");
  const ways = root.findAll((node: any) => typeof node.type === "string" && node.props["data-way"]);
  assert.deepEqual(
    ways.map((node: any) => node.props["data-way"]),
    ["ai", "arc"],
    "your own AI comes first, then Arc",
  );
  const prompt = root.find((node: any) => node.type === "blockquote");
  assert.equal(text(prompt), en("routines.templates.generalAiPrompt"));
  const chatgpt = root.find((node: any) => node.props["data-ai"] === "chatgpt");
  const claude = root.find((node: any) => node.props["data-ai"] === "claude");
  assert.equal(new URL(chatgpt.props.href).searchParams.get("q"), text(prompt));
  assert.equal(new URL(claude.props.href).searchParams.get("q"), text(prompt));
  assert.equal(chatgpt.props.target, "_blank");
  assert.match(chatgpt.props.rel, /noopener/);

  act(() => byText(root, "button", en("routines.newDialog.startInArc")).props.onClick());
  assert.deepEqual(calls, ["close", "chat"], "starting in Arc closes the dialog first");
  assert.deepEqual(chats, [en("routines.page.newRoutinePrompt")]);
  act(() => renderer.unmount());
  assert.deepEqual(dialogCalls, ["showModal", "close"], "unmounting closes the modal");
  console.log("PASS: with Arc the dialog offers your own AI first and Arc second");
}

// Choosing a template changes the prompt, both links and what Arc is asked.
{
  const { renderer, root, chats } = renderDialog(true);
  const nightly = byText(root, "button", en("routines.empty.nightlyTests"));
  act(() => nightly.props.onClick());
  assert.equal(
    byText(root, "button", en("routines.empty.nightlyTests")).props["aria-pressed"],
    true,
  );
  assert.equal(
    byText(root, "button", en("routines.templates.general")).props["aria-pressed"],
    false,
  );
  const expected = en("routines.templates.nightlyTestsAiPrompt");
  assert.equal(text(root.find((node: any) => node.type === "blockquote")), expected);
  const chatgpt = root.find((node: any) => node.props["data-ai"] === "chatgpt");
  assert.equal(new URL(chatgpt.props.href).searchParams.get("q"), expected);
  act(() => byText(root, "button", en("routines.newDialog.startInArc")).props.onClick());
  assert.deepEqual(chats, [en("routines.empty.nightlyTestsPrompt")]);
  act(() => renderer.unmount());
  console.log("PASS: the chosen template drives the copied prompt, both links and the Arc prompt");
}

// Copying, and opening a conversation, put the prompt on the clipboard and say what happens next.
{
  clipboard.length = 0;
  const { renderer, root } = renderDialog(true);
  const status = () => text(root.find((node: any) => node.props.role === "status"));
  assert.equal(status(), "");
  await act(async () =>
    byText(root, "button", en("routines.newDialog.copyPrompt")).props.onClick(),
  );
  assert.deepEqual(clipboard, [en("routines.templates.generalAiPrompt")]);
  assert.ok(byText(root, "button", en("routines.newDialog.copied")), "the button says Copied");
  assert.equal(status(), en("routines.newDialog.copiedDetail"));

  await act(async () => byText(root, "button", en("routines.empty.hostCheck")).props.onClick());
  assert.equal(status(), "", "a different template is not shown as copied");
  await act(async () =>
    root.find((node: any) => node.props["data-ai"] === "claude").props.onClick(),
  );
  assert.equal(clipboard.at(-1), en("routines.templates.hostCheckAiPrompt"));
  assert.equal(status(), en("routines.newDialog.copiedDetail"));
  act(() => renderer.unmount());

  clipboardFails = true;
  const refused = renderDialog(true);
  await act(async () =>
    byText(refused.root, "button", en("routines.newDialog.copyPrompt")).props.onClick(),
  );
  assert.equal(
    text(refused.root.find((node: any) => node.props.role === "status")),
    "",
    "a refused clipboard is not reported as copied",
  );
  assert.ok(
    refused.root.find((node: any) => node.type === "blockquote"),
    "the prompt stays readable",
  );
  clipboardFails = false;
  act(() => refused.renderer.unmount());
  console.log(
    "PASS: copying or opening a conversation copies the prompt and a refused copy claims nothing",
  );
}

// Without Arc only your own AI is offered; connecting and closing work.
{
  const { renderer, root, calls } = renderDialog(false);
  const ways = root.findAll((node: any) => typeof node.type === "string" && node.props["data-way"]);
  assert.deepEqual(
    ways.map((node: any) => node.props["data-way"]),
    ["ai"],
  );
  assert.equal(
    root.findAll(
      (node: any) => node.type === "button" && text(node) === en("routines.newDialog.startInArc"),
    ).length,
    0,
  );
  act(() => byText(root, "button", en("routines.empty.connectAi")).props.onClick());
  assert.deepEqual(calls, ["close", "connect"]);

  const dialog = root.find((node: any) => node.type === "dialog");
  let prevented = false;
  act(() => dialog.props.onCancel({ preventDefault: () => (prevented = true) }));
  assert.equal(prevented, true, "Escape is handled by React state, not the native close");
  act(() => dialog.props.onClick({ target: "panel", currentTarget: "dialog" }));
  assert.deepEqual(calls, ["close", "connect", "close"], "a click inside the panel keeps it open");
  act(() => dialog.props.onClick({ target: "dialog", currentTarget: "dialog" }));
  assert.deepEqual(calls, ["close", "connect", "close", "close"], "a backdrop click closes it");
  act(() => renderer.unmount());
  console.log(
    "PASS: without Arc only your own AI is offered, and connect, Escape and backdrop close it",
  );
}

// Chinese copy renders in the dialog.
{
  const { renderer, root } = renderDialog(true, "zh");
  assert.ok(byText(root, "h2", zh("routines.newDialog.title")));
  assert.equal(
    text(root.find((node: any) => node.type === "blockquote")),
    zh("routines.templates.generalAiPrompt"),
  );
  act(() => renderer.unmount());
  console.log("PASS: the dialog renders its Chinese copy");
}

// The empty state offers a prompt to copy, and its templates still start Arc.
{
  const calls: string[] = [];
  let renderer: any;
  act(() => {
    renderer = create(
      <I18nProvider initialLanguage="en">
        <RoutinesEmpty
          arcAvailable
          onChat={(prompt) => calls.push("chat:" + prompt)}
          onConnectAI={() => calls.push("connect")}
          onNewRoutine={() => calls.push("new")}
        />
      </I18nProvider>,
    );
  });
  act(() => byText(renderer.root, "button", en("routines.empty.getPrompt")).props.onClick());
  const template = renderer.root.find(
    (node: any) => node.type === "button" && text(node).startsWith(en("routines.empty.priceWatch")),
  );
  act(() => template.props.onClick());
  assert.deepEqual(calls, ["new", "chat:" + en("routines.empty.priceWatchPrompt")]);
  assert.equal(
    renderer.root.findAll(
      (node: any) =>
        node.type === "button" && text(node).startsWith(en("routines.templates.general")),
    ).length,
    0,
    "the blank template is the Start a conversation button, not a card",
  );
  act(() => renderer.unmount());
  console.log("PASS: the empty state opens the prompt dialog and its templates still start Arc");
}

// On the page, New routine opens the dialog instead of going straight to Arc.
{
  (globalThis as any).fetch = async (url: string) => {
    assert.equal(url, "/api/automations");
    return new Response(JSON.stringify({ automations: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const chats: (string | undefined)[] = [];
  let renderer: any;
  await act(async () => {
    renderer = create(
      <I18nProvider initialLanguage="en">
        <RoutinesPage
          arcAvailable={false}
          devices={[]}
          onChat={(prompt) => chats.push(prompt)}
          onConnectAI={() => {}}
        />
      </I18nProvider>,
      { createNodeMock },
    );
  });
  const dialogs = () => renderer.root.findAll((node: any) => node.type === "dialog");
  assert.equal(dialogs().length, 0);
  const header = renderer.root.findByType("header");
  await act(async () => byText(header, "button", en("routines.page.newRoutine")).props.onClick());
  assert.equal(dialogs().length, 1, "New routine opens the dialog");
  assert.deepEqual(chats, [], "New routine no longer goes straight to Arc");
  await act(async () =>
    renderer.root
      .find((node: any) => node.props["aria-label"] === en("routines.newDialog.close"))
      .props.onClick(),
  );
  assert.equal(dialogs().length, 0, "the close button closes it");
  act(() => renderer.unmount());
  console.log("PASS: New routine on the page opens the dialog, even where Arc is off");
}
