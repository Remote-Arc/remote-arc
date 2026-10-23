import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({ load(url, context, nextLoad) {
  return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
} });
// Deliberately differ from the development package version. Public downloads
// must follow the stable build value, including on future candidate branches.
globalThis.__REMOTEARC_CLI_VERSION__ = '0.5.99';
const { NativeInstall } = await import('../src/native-install.tsx');
const { I18nProvider } = await import('../src/i18n.tsx');
const previousWindow = globalThis.window;
const previousLocation = globalThis.location;
try {
  for (const locale of ['en', 'zh']) {
    globalThis.location = { origin: 'https://remotearc.app', hostname: 'remotearc.app', pathname: locale === 'zh' ? '/zh/downloads' : '/downloads', search: '' };
    globalThis.window = { location: globalThis.location };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(NativeInstall)));
    assert.match(html, /REMOTE ARC 0\.5\.99/);
    const native = [...html.matchAll(/href="([^"]*\/releases\/download\/remotelink-v[^" ]+\/remotelink-v[^" ]+)"/g)].map(match => match[1]);
    assert.equal(new Set(native).size, 6);
    for (const href of native) assert.match(href, /\/remotelink-v0\.5\.99\/remotelink-v0\.5\.99-(darwin|windows|linux)-(amd64|arm64)(\.exe)?$/);
    assert.doesNotMatch(html, /remotelink-v0\.6\.2|REMOTE ARC 0\.6\.2/);
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
  delete globalThis.__REMOTEARC_CLI_VERSION__;
}
console.log('PASS: bilingual public download badges and all six binaries follow the stable build release, independently of the development package.');
