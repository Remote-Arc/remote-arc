'use strict';

// Single source of truth for GitHub PR preview navigation. Only routes backed by
// apps/ui/src/main.tsx and dashboard-workspaces.ts should appear here.
const GROUPS = [
  {
    heading: '01 · Website & Documentation',
    links: [
      ['Homepage', '/'],
      ['Arc product', '/arc'],
      ['Use cases', '/use-cases'],
      ['Integrations', '/integrations'],
      ['Pricing', '/pricing'],
      ['Documentation', '/docs'],
      ['Downloads', '/downloads'],
      ['Releases', '/releases'],
      ['Roadmap', '/roadmap'],
    ],
  },
  {
    heading: '02 · Installation & Onboarding',
    links: [
      ['Pair a device', '/device?code=DEMO-CODE'],
      ['Review permissions', '/device?code=DEMO-CODE&demo=permissions'],
      ['Connect MCP', '/device?code=DEMO-CODE&demo=ready'],
      ['ChatGPT setup', '/install/chatgpt'],
      ['Claude setup', '/install/claude'],
      ['Gemini setup', '/install/gemini'],
      ['Cursor setup', '/install/cursor'],
      ['Chrome Companion', '/chrome-extension'],
    ],
  },
  {
    heading: '03 · Connect Workspace',
    links: [
      ['Overview', '/dashboard/connect/overview'],
      ['Devices & tools', '/dashboard/connect/devices'],
      ['Connect AI clients', '/dashboard/connect/clients'],
      ['Connected apps', '/dashboard/connect/apps'],
      ['Permissions & security', '/dashboard/connect/security'],
      ['Account settings', '/dashboard/connect/settings'],
    ],
  },
  {
    heading: '04 · Arc Agent Workspace',
    links: [
      ['Chat', '/dashboard/agent/chat'],
      ['Tasks & automations', '/dashboard/agent/tasks'],
      ['Activity', '/dashboard/agent/activity'],
      ['Skills', '/dashboard/agent/skills'],
      ['Connected apps', '/dashboard/agent/apps'],
      ['Devices', '/dashboard/agent/devices'],
      ['Teammates', '/dashboard/agent/teams'],
      ['Memory', '/dashboard/agent/settings?section=memory'],
      ['Workspace settings', '/dashboard/agent/settings'],
    ],
  },
  {
    heading: '05 · Plans, Checkout & Quotas',
    links: [
      ['Plans & usage', '/dashboard/connect/settings?section=billing'],
      ['Arc billing', '/dashboard/agent/settings?section=billing'],
      ['Checkout demo', '/checkout?demo=new'],
      ['Quota warning · 87%', '/overview'],
      ['Quota exhausted · 100%', '/overview?quota=full'],
    ],
  },
  {
    heading: '06 · Admin Console · simulated data',
    links: [
      ['Admin overview', '/admin-preview?section=overview'],
      ['Leads & feedback', '/admin-preview?section=leads'],
      ['User follow-ups', '/admin-preview?section=followups'],
      ['Payments & offers', '/admin-preview?section=payments'],
      ['Users & operations · usage diagnostics', '/admin-preview?section=operations'],
      ['Service health', '/admin-preview?section=health'],
      ['Monitor', '/monitor'],
    ],
  },
];

const MARKER = '<!-- remote-arc-ui-preview -->';

function buildPreviewComment(previewUrl, uniqueUrl = '') {
  const preview = new URL(previewUrl);
  if (preview.protocol !== 'https:') throw new Error('HTTPS preview URL required');
  const base = preview.origin;
  const lines = [
    MARKER,
    '### Remote Arc UI Preview · Module Index',
    '',
    '**Preview environment:** ' + base,
    '',
    'Use the links below to review the UI by product module. The Admin preview uses synthetic accounts and metrics.',
  ];
  for (const group of GROUPS) {
    lines.push('', '#### ' + group.heading, '');
    for (const [name, path] of group.links) {
      lines.push('- [' + name + '](' + base + path + ')');
    }
  }
  if (uniqueUrl) {
    const unique = new URL(uniqueUrl);
    if (unique.protocol !== 'https:') throw new Error('HTTPS deployment URL required');
    lines.push('', '**Immutable deployment:** ' + unique.href);
  }
  lines.push(
    '',
    '> **Preview only:** Dashboard and Admin data are simulated. Onboarding, Arc, checkout and billing are demonstrations; real OAuth, D1, MCP, Stripe, user accounts and devices are not connected. No real payments or account changes take place.',
  );
  return lines.join('\n');
}

module.exports = { buildPreviewComment, GROUPS, MARKER };
