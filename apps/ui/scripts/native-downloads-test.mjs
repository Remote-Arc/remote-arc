import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({ load(url, context, nextLoad) {
  return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
} });
const { NativeInstall } = await import('../src/native-install.tsx');
const { I18nProvider } = await import('../src/i18n.tsx');
const previousWindow = globalThis.window;
const previousLocation = globalThis.location;
try {
  for (const locale of ['en', 'zh']) {
    globalThis.location = { origin: 'https://remotearc.app', hostname: 'remotearc.app', pathname: locale === 'zh' ? '/zh/downloads' : '/downloads', search: '' };
    globalThis.window = { location: globalThis.location };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(NativeInstall)));
    const native = [...html.matchAll(/href="(\/api\/downloads\/agent\/[^" ]+)"/g)].map(match => match[1]);
    assert.equal(new Set(native).size, 6);
    for (const href of native) assert.match(href, /^\/api\/downloads\/agent\/(darwin|windows|linux)\/(amd64|arm64)$/);
    for (const icon of ['macos', 'windows', 'linux']) assert(html.includes('/platform-brands/' + icon + '.svg'));
    assert.match(html, /releases\/latest\/download\/SHA256SUMS/);
    assert.doesNotMatch(html, /releases\/download\/remotelink-v|REMOTE ARC \d+\.\d+\.\d+/);
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
}
console.log('PASS: bilingual native download cards, platform icons and six stable-channel links without a build-pinned version.');
