import type { MessageKey } from "../../../locales/locale-catalog.js";

/**
 * The four requests the home page's "Ask in chat" demo plays through the
 * ChatGPT / Claude / Cursor conversation. Prompts, progress and replies are
 * translated copy; each step's tool and arguments are the real tool and
 * operation names, shown as code in every language.
 */
export type UseCaseStep = {
  tool: string;
  arguments: Record<string, unknown>;
  working: MessageKey;
  output: MessageKey;
  duration: string;
};
export type HomeUseCase = {
  id: "slack" | "whatsapp" | "github" | "code" | "browser" | "travel" | "fleet";
  kind: "app" | "device";
  label: MessageKey;
  prompt: MessageKey;
  reply: MessageKey;
  permission: MessageKey;
  title: MessageKey;
  body: MessageKey;
  href: string;
  /** The real product the request works through, shown on its tab. */
  icon: string;
  enterprise?: boolean;
  steps: readonly UseCaseStep[];
};

const k = (key: string) => ("marketing.home.homeUseCases." + key) as MessageKey;

export const HOME_USE_CASES: readonly HomeUseCase[] = [
  {
    id: "slack",
    kind: "app",
    label: k("slackLabel"),
    prompt: k("slackPrompt"),
    reply: k("slackResult"),
    permission: k("slackPermission"),
    title: k("slackTitle"),
    body: k("slackBody"),
    href: "/integrations?provider=slack",
    icon: "/app-brands/slack.svg",
    steps: [
      {
        tool: "call_app · slack",
        arguments: {
          operation: "messages.list",
          arguments: { channel: "#support", oldest: "today" },
        },
        working: k("slackWork1"),
        output: k("slackOut1"),
        duration: "212ms",
      },
      {
        tool: "call_app · slack",
        arguments: { operation: "threads.replies", arguments: { channel: "#support", threads: 7 } },
        working: k("slackWork2"),
        output: k("slackOut2"),
        duration: "340ms",
      },
      {
        tool: "call_app · slack",
        arguments: { operation: "messages.send", arguments: { channel: "#eng-triage" } },
        working: k("slackWork3"),
        output: k("slackOut3"),
        duration: "180ms",
      },
    ],
  },
  {
    id: "whatsapp",
    kind: "app",
    label: k("whatsappLabel"),
    prompt: k("whatsappPrompt"),
    reply: k("whatsappResult"),
    permission: k("whatsappPermission"),
    title: k("whatsappTitle"),
    body: k("whatsappBody"),
    href: "/integrations?provider=whatsapp",
    icon: "/app-brands/whatsapp.svg",
    steps: [
      {
        tool: "call_app · whatsapp",
        arguments: { operation: "templates.list", arguments: {} },
        working: k("whatsappWork1"),
        output: k("whatsappOut1"),
        duration: "156ms",
      },
      {
        tool: "call_app · whatsapp",
        arguments: {
          operation: "templates.send",
          arguments: { to: "15550100", name: "delivery_update", language: "en_US" },
        },
        working: k("whatsappWork2"),
        output: k("whatsappOut2"),
        duration: "420ms",
      },
    ],
  },
  {
    id: "github",
    kind: "app",
    label: k("githubLabel"),
    prompt: k("githubPrompt"),
    reply: k("githubResult"),
    permission: k("githubPermission"),
    title: k("githubTitle"),
    body: k("githubBody"),
    href: "/integrations?provider=github",
    icon: "/app-brands/github.svg",
    steps: [
      {
        tool: "call_app · github",
        arguments: { operation: "pulls.get", arguments: { repo: "team/web", number: 128 } },
        working: k("githubWork1"),
        output: k("githubOut1"),
        duration: "188ms",
      },
      {
        tool: "call_app · github",
        arguments: { operation: "actions.list", arguments: { repo: "team/web", branch: "pr-128" } },
        working: k("githubWork2"),
        output: k("githubOut2"),
        duration: "240ms",
      },
      {
        tool: "call_app · github",
        arguments: { operation: "actions.get", arguments: { repo: "team/web", run_id: 7731 } },
        working: k("githubWork3"),
        output: k("githubOut3"),
        duration: "310ms",
      },
      {
        tool: "call_app · github",
        arguments: { operation: "comments.create", arguments: { repo: "team/web", issue: 128 } },
        working: k("githubWork4"),
        output: k("githubOut4"),
        duration: "205ms",
      },
    ],
  },
  {
    id: "code",
    kind: "device",
    label: k("codeLabel"),
    prompt: k("codePrompt"),
    reply: k("codeResult"),
    permission: k("codePermission"),
    title: k("codeTitle"),
    body: k("codeBody"),
    href: "/use-cases/remote-development",
    icon: "/platform-brands/windows.svg",
    steps: [
      {
        tool: "start_process",
        arguments: { command: "npm test", cwd: "~/projects/app" },
        working: k("codeWork1"),
        output: k("codeOut1"),
        duration: "2.1s",
      },
      {
        tool: "read_file",
        arguments: { path: "~/projects/app/src/format.ts" },
        working: k("codeWork2"),
        output: k("codeOut2"),
        duration: "21ms",
      },
      {
        tool: "edit_block",
        arguments: {
          file_path: "~/projects/app/src/format.ts",
          old_string: 'return value || "—";',
          new_string: 'return value == null ? "—" : String(value);',
        },
        working: k("codeWork3"),
        output: k("codeOut3"),
        duration: "55ms",
      },
      {
        tool: "start_process",
        arguments: { command: "npm test", cwd: "~/projects/app" },
        working: k("codeWork4"),
        output: k("codeOut4"),
        duration: "2.4s",
      },
    ],
  },
  {
    id: "browser",
    kind: "device",
    label: k("browserLabel"),
    prompt: k("browserPrompt"),
    reply: k("browserResult"),
    permission: k("browserPermission"),
    title: k("browserTitle"),
    body: k("browserBody"),
    href: "/chrome-extension",
    icon: "/platform-brands/browser.svg",
    steps: [
      {
        tool: "shared_tab_open × 3",
        arguments: { url: "https://status.vendor-b.example", active: false },
        working: k("browserWork1"),
        output: k("browserOut1"),
        duration: "1.2s",
      },
      {
        tool: "shared_tab_read × 3",
        arguments: { tab_id: "vendor-b-status" },
        working: k("browserWork2"),
        output: k("browserOut2"),
        duration: "640ms",
      },
    ],
  },
  {
    id: "travel",
    kind: "device",
    label: k("travelLabel"),
    prompt: k("travelPrompt"),
    reply: k("travelResult"),
    permission: k("travelPermission"),
    title: k("travelTitle"),
    body: k("travelBody"),
    href: "/use-cases/cross-device-handoff",
    icon: "/platform-brands/macos.svg",
    steps: [
      {
        tool: "list_devices",
        arguments: {},
        working: k("travelWork1"),
        output: k("travelOut1"),
        duration: "38ms",
      },
      {
        tool: "list_directory",
        arguments: { device: "Office Mac", path: "~/Documents/Q3" },
        working: k("travelWork2"),
        output: k("travelOut2"),
        duration: "64ms",
      },
      {
        tool: "create_file_resource",
        arguments: { device: "Office Mac", path: "~/Documents/Q3/Q3 Review.pdf" },
        working: k("travelWork3"),
        output: k("travelOut3"),
        duration: "210ms",
      },
    ],
  },
  {
    id: "fleet",
    kind: "device",
    label: k("fleetLabel"),
    prompt: k("fleetPrompt"),
    reply: k("fleetResult"),
    permission: k("fleetPermission"),
    title: k("fleetTitle"),
    body: k("fleetBody"),
    href: "/docs/device-fleet",
    icon: "/platform-brands/linux.svg",
    enterprise: true,
    steps: [
      {
        tool: "list_devices",
        arguments: {},
        working: k("fleetWork1"),
        output: k("fleetOut1"),
        duration: "52ms",
      },
      {
        tool: "fleet_run",
        arguments: {
          tool: "start_process",
          arguments: { command: "uptime && df -h /" },
          all_devices: true,
        },
        working: k("fleetWork2"),
        output: k("fleetOut2"),
        duration: "8.6s",
      },
    ],
  },
];

/** The server room the fleet request checks: 128 machines, three that need attention, two offline. */
export const FLEET_SIZE = 128;
export const FLEET_WARN = new Set([43, 77, 101]);
export const FLEET_OFFLINE = new Set([90, 91]);
