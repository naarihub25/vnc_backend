const { test } = require('node:test');
const assert = require('node:assert/strict');
const Banner = require('../src/models/Banner');
const app = require('../src/app');
const body = () => ({ title: ' Gifts Sale ', images: [{ url: 'https://example.com/gifts.jpg', alt: 'Gifts' }], redirectUrl: '/categories/gifts', position: 'carousal' });

test('banner schema enforces required fields, positions, and URL formats', async () => {
  const banner = new Banner(body());
  await banner.validate();
  assert.equal(banner.title, 'Gifts Sale');
  assert.equal(banner.isActive, true);
  assert.equal(banner.sortOrder, 0);
  for (const patch of [{ title: '' }, { images: [] }, { images: null }, { redirectUrl: 'javascript:alert(1)' }, { redirectUrl: '//example.com' }, { redirectUrl: '/\\example.com' }, { position: 'other' }]) {
    await assert.rejects(new Banner({ ...body(), ...patch }).validate());
  }
});

test('public banner CRUD, dropdown and website filtering (in-memory repository)', async t => {
  const records = new Map();
  const filtered = filter => [...records.values()].filter(b => Object.entries(filter).every(([key, value]) => b[key] === value));
  const attach = banner => {
    banner.save = async () => { await banner.validate(); records.set(String(banner._id), banner.toObject()); return banner; };
    return banner;
  };
  t.mock.method(Banner, 'create', async data => attach(new Banner(data)).save());
  t.mock.method(Banner, 'findById', async id => records.has(String(id)) ? attach(Banner.hydrate(records.get(String(id)))) : null);
  t.mock.method(Banner, 'find', filter => ({ sort: () => ({ skip: offset => ({ limit: async limit => filtered(filter).sort((a,b) => a.sortOrder - b.sortOrder).slice(offset, offset + limit).map(b => Banner.hydrate(b)) }) }) }));
  t.mock.method(Banner, 'countDocuments', async filter => filtered(filter).length);
  t.mock.method(Banner, 'deleteOne', async filter => records.delete(String(filter._id)));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/banners`;
  async function call(path = '', method = 'GET', data) {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }
  const options = await call('/positions');
  assert.equal(options.status, 200);
  assert.deepEqual(options.body.positions, [{ value: 'carousal', label: 'Carousel' }, { value: 'offerBanner', label: 'Offer Banner' }]);
  const created = await call('', 'POST', body());
  assert.equal(created.status, 201);
  assert.equal(created.body.banner.__v, undefined);
  const id = created.body.banner._id;
  await call('', 'POST', { ...body(), title: 'Offer', position: 'offerBanner', sortOrder: 2 });
  await call('', 'POST', { ...body(), title: 'Inactive', isActive: false });
  assert.equal((await call('?position=carousal&isActive=true')).body.total, 1);
  assert.equal((await call('?position=offerBanner')).body.total, 1);
  assert.equal((await call('?isActive=false')).body.total, 1);
  assert.equal((await call('?limit=1')).body.banners.length, 1);
  assert.equal((await call('/' + id)).status, 200);
  const images = [{ url: 'https://example.com/new.jpg' }, { url: 'https://example.com/second.jpg' }];
  const updated = await call('/' + id, 'PATCH', { images, redirectUrl: 'https://example.com/offers', position: 'offerBanner', isActive: false });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.banner.images[0].url, images[0].url);
  assert.equal(updated.body.banner.redirectUrl, 'https://example.com/offers');
  assert.equal((await call('?position=carousal&isActive=true')).body.total, 0);
  for (const patch of [{ title: null }, { images: [] }, { images: [{ url: 'data:image/png;base64,abc' }] }, { images: [{ url: 'https://example.com/a.jpg', unknown: true }] }, { redirectUrl: 'javascript:alert(1)' }, { redirectUrl: '//example.com' }, { position: 'carousel' }, { isActive: 'true' }, { sortOrder: 0.5 }, { unknown: true }]) {
    assert.equal((await call('', 'POST', { ...body(), ...patch })).status, 400);
  }
  assert.equal((await call('', 'POST', {})).status, 400);
  assert.equal((await call('/' + id, 'PATCH', {})).status, 400);
  for (const path of ['?page=0', '?limit=101', '?position=wrong', '?isActive=1', '/bad']) assert.equal((await call(path)).status, 400);
  assert.equal((await call('/000000000000000000000000')).status, 404);
  assert.equal((await call('/' + id, 'DELETE')).status, 204);
  assert.equal((await call('/' + id)).status, 404);
});
