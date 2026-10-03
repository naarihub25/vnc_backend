const { test } = require('node:test');
const assert = require('node:assert/strict');
const { S3Client } = require('@aws-sdk/client-s3');
const app = require('../src/app');

test('category backend upload sends file bytes to S3 and returns only imageUrl', async t => {
  const keys = ['S3_IMAGE_BUCKET', 'AWS_REGION', 'S3_PUBLIC_BASE_URL'];
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  process.env.S3_IMAGE_BUCKET = 'test-bucket';
  process.env.AWS_REGION = 'ap-south-1';
  delete process.env.S3_PUBLIC_BASE_URL;
  let failure;
  const sent = [];
  t.mock.method(S3Client.prototype, 'send', async command => {
    if (failure) throw failure;
    sent.push(command.input);
    return {};
  });
  t.mock.method(console, 'error', () => {});
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${server.address().port}/api/categories/image-upload-url`;
  async function upload({ type = 'image/png', size = 8, field = 'file', count = 1 } = {}) {
    const form = new FormData();
    for (let i = 0; i < count; i++) form.append(field, new Blob([Buffer.alloc(size, 7)], { type }), 'original.png');
    return fetch(url, { method: 'POST', body: form });
  }
  for (const [type, extension] of [['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]) {
    const result = await upload({ type });
    assert.equal(result.status, 200);
    const input = sent.at(-1);
    assert.equal(input.Bucket, 'test-bucket');
    assert.equal(input.ContentType, type);
    assert.equal(input.ContentLength, 8);
    assert.deepEqual(input.Body, Buffer.alloc(8, 7));
    assert.match(input.Key, new RegExp(`^categories/[a-f0-9-]+\\.${extension}$`));
    assert.deepEqual(await result.json(), { imageUrl: `https://test-bucket.s3.ap-south-1.amazonaws.com/${input.Key}` });
  }
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com///';
  const custom = await upload({ size: 5 * 1024 * 1024 });
  assert.equal(custom.status, 200);
  assert.deepEqual(await custom.json(), { imageUrl: `https://cdn.example.com/${sent.at(-1).Key}` });
  assert.equal(new Set(sent.map(input => input.Key)).size, sent.length);
  const before = sent.length;
  for (const options of [{ size: 0 }, { size: 5 * 1024 * 1024 + 1 }, { type: 'image/svg+xml' }, { field: 'image' }, { count: 2 }, { count: 0 }]) {
    assert.equal((await upload(options)).status, 400);
  }
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: 'image/png', fileSize: 8 }) })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'broken' })).status, 400);
  assert.equal(sent.length, before);
  delete process.env.S3_IMAGE_BUCKET;
  assert.equal((await upload()).status, 503);
  process.env.S3_IMAGE_BUCKET = 'test-bucket';
  failure = Object.assign(new Error('private credentials details'), { name: 'CredentialsProviderError' });
  assert.equal((await upload()).status, 503);
  failure = new Error('private S3 details');
  const failed = await upload();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Unable to upload the image.' });
  const wrongMethod = await fetch(url);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
});
