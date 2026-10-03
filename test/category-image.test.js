const { test } = require('node:test');
const assert = require('node:assert/strict');
const presigner = require('@aws-sdk/s3-request-presigner');
const app = require('../src/app');

for (const prefix of ['products']) test(`${prefix} image upload HTTP contract and signing errors`, async t => {
  const keys = ['S3_IMAGE_BUCKET', 'AWS_REGION', 'S3_PUBLIC_BASE_URL'];
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  process.env.S3_IMAGE_BUCKET = 'test-bucket';
  process.env.AWS_REGION = 'ap-south-1';
  delete process.env.S3_PUBLIC_BASE_URL;
  const signed = [];
  let signingError;
  t.mock.method(presigner, 'getSignedUrl', async (client, command, options) => {
    if (signingError) throw signingError;
    signed.push(command.input);
    assert.equal(options.expiresIn, 300);
    return 'https://example.com/signed-put';
  });
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${server.address().port}/api/${prefix}/image-upload-url`;
  const call = body => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (const [contentType, extension] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]) {
    const res = await call({ contentType, fileSize: 5242880 });
    assert.equal(res.status, 200);
    const data = await res.json();
    const input = signed.at(-1);
    assert.equal(input.Bucket, 'test-bucket');
    assert.equal(input.ContentType, contentType);
    assert.ok(input.Key.startsWith(`${prefix}/`) && input.Key.endsWith(`.${extension}`));
    assert.equal(data.imageUrl, `https://test-bucket.s3.ap-south-1.amazonaws.com/${input.Key}`);
    assert.equal(data.uploadUrl, 'https://example.com/signed-put');
  }
  const valid = { contentType: 'image/png', fileSize: 1 };
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/images///';
  const custom = await (await call(valid)).json();
  assert.equal(custom.imageUrl, `https://cdn.example.com/images/${signed.at(-1).Key}`);
  await call(valid);
  assert.equal(new Set(signed.map(input => input.Key)).size, signed.length);
  for (const body of [{}, { ...valid, contentType: 'image/svg+xml' }, { ...valid, contentType: 'constructor' }, ...[0, -1, 1.5, 5242881, '10', null].map(fileSize => ({ ...valid, fileSize }))]) {
    assert.equal((await call(body)).status, 400);
  }
  delete process.env.S3_IMAGE_BUCKET;
  assert.equal((await call(valid)).status, 503);
  process.env.S3_IMAGE_BUCKET = 'test-bucket';
  signingError = Object.assign(new Error('missing credentials'), { name: 'CredentialsProviderError' });
  assert.equal((await call(valid)).status, 503);
  signingError = new Error('private failure details');
  const failed = await call(valid);
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Unable to prepare the image upload.' });
  const wrongMethod = await fetch(url);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
});
