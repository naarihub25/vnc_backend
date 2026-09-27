const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('Swagger UI serves assets and same-origin API documentation without authentication', async t => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base + '/api-docs/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /swagger-ui/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
    assert.equal((await fetch(base + '/api-docs/' + asset)).status, 200);
  }
  const spec = await (await fetch(base + '/api-docs/openapi.json')).json();
  assert.equal(spec.openapi, '3.0.3');
  assert.equal(spec.servers[0].url, '/');
  assert.equal(spec.components.securitySchemes, undefined);
  assert.deepEqual(spec.paths['/api/admin/login'].post.security, []);
  assert.deepEqual(spec.security, []);
  assert.ok(spec.paths['/api/users/{id}'].patch.requestBody);
  assert.ok(spec.paths['/api/users/{id}'].delete.responses['204']);
  assert.equal(spec.paths['/api/users/me'], undefined);
  assert.equal(spec.paths['/api/auth/logout'], undefined);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const resolved = value.$ref.slice(2).split('/').reduce((obj, key) => obj?.[key], spec);
      assert.ok(resolved, `Missing reference ${value.$ref}`);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(spec);
});
