'use strict';

const assert = require('node:assert/strict');
const { GROUPS, MARKER, buildPreviewComment } = require('./preview-comment.cjs');

const origin = 'https://pr-361-remote-arc-ui-preview.nzp.workers.dev';
const version = 'https://4348165d-remote-arc-ui-preview.nzp.workers.dev';
const body = buildPreviewComment(origin, version);

assert.equal(GROUPS.length, 6, 'group by six product modules');
assert.ok(body.startsWith(MARKER));
assert.ok(body.includes('**Immutable deployment:** ' + version + '/'));
assert.ok(body.includes(origin + '/admin-preview?section=operations'));
assert.ok(body.includes(origin + '/admin-preview?section=payments'));
assert.ok(body.includes(origin + '/overview?quota=full'));
const requiredAdmin = ['overview','leads','followups','payments','operations','health'];
for (const section of requiredAdmin) {
  assert.ok(body.includes(origin + '/admin-preview?section=' + section), section);
}
const uniquePaths = new Set();
for (const group of GROUPS) {
  assert.ok(body.includes('#### ' + group.heading));
  for (const [title, path] of group.links) {
    assert.ok(title && path.startsWith('/'), 'absolute module path expected');
    assert.ok(!uniquePaths.has(path), 'duplicate navigation link: ' + path);
    uniquePaths.add(path);
    assert.ok(body.includes('[' + title + '](' + origin + path + ')'), 'render link: ' + title);
  }
}
assert.equal((body.match(/#### /g) || []).length, 6);
assert.ok(body.includes('simulated'), 'explicit synthetic data disclosure');
assert.ok(body.includes('No real payments or account changes'));
assert.throws(() => buildPreviewComment('javascript:alert(1)'), /HTTPS/);
assert.throws(() => buildPreviewComment(origin, 'http://unsafe.test'), /HTTPS/);
assert.ok(!buildPreviewComment(origin).includes('Immutable deployment:'));
console.log('PASS: Preview index covers all six modules, six Admin sections, quotas and safe URLs (' + uniquePaths.size + ' links).');
