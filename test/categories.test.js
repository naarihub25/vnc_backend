const { test } = require('node:test');
const assert = require('node:assert/strict');
const Category = require('../src/models/Category');
const app = require('../src/app');
const Product = require('../src/models/Product');

test('category model generates slugs and validates fields', async () => {
  const category = new Category({ name: ' Kids Toys ' });
  await category.validate();
  assert.equal(category.name, 'Kids Toys');
  assert.equal(category.slug, 'kids-toys');
  assert.equal(category.isActive, true);
  assert.equal(category.sortOrder, 0);
  assert.equal(category.parentCategory, null);
  for (const body of [{}, { name: 'Test', imageUrl: 'javascript:alert(1)' }, { name: 'Test', sortOrder: 1.5 }]) {
    await assert.rejects(new Category(body).validate());
  }
});

test('public category CRUD, filtering, and validation (in-memory repository)', async t => {
  const records = new Map();
  t.mock.method(Product, 'exists', async () => null);
  const filtered = filter => [...records.values()].filter(c => (filter.isActive === undefined || c.isActive === filter.isActive) && (filter.parentCategory === undefined || String(c.parentCategory) === String(filter.parentCategory)));
  t.mock.method(Category, 'findById', async id => records.get(String(id)) || null);
  t.mock.method(Category, 'create', async body => {
    const category = new Category(body);
    await category.validate();
    if ([...records.values()].some(c => c.slug === category.slug)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    category.save = async () => { await category.validate(); return category; };
    records.set(String(category._id), category);
    return category;
  });
  t.mock.method(Category, 'find', filter => ({ sort: () => ({ select: () => ({ lean: async () => filtered(filter).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(c => ({ _id: c._id, name: c.name })) }), skip: offset => ({ limit: async limit => filtered(filter).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).slice(offset, offset + limit) }) }) }));
  t.mock.method(Category, 'countDocuments', async filter => filtered(filter).length);
  t.mock.method(Category, 'exists', async filter => filtered(filter)[0] || null);
  t.mock.method(Category, 'deleteOne', async filter => records.delete(String(filter._id)));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/categories`;
  async function call(path = '', method = 'GET', body) {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }
  assert.deepEqual((await call('/parents')).body, { categories: [] });
  const created = await call('', 'POST', { name: 'Kids Toys', sortOrder: 2 });
  assert.equal(created.status, 201);
  assert.equal(created.body.category.slug, 'kids-toys');
  const id = created.body.category._id;
  const duplicate = await call('', 'POST', { name: 'Kids Toys' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'Category slug already exists');
  await call('', 'POST', { name: 'Jewels', sortOrder: 1 });
  await call('', 'POST', { name: 'Gifts', isActive: false });
  const list = await call('?isActive=true&limit=1');
  assert.equal(list.body.total, 2);
  assert.equal(list.body.categories.length, 1);
  assert.equal(list.body.categories[0].name, 'Jewels');
  assert.equal((await call('?isActive=false')).body.total, 1);
  assert.equal((await call()).body.total, 3);
  assert.equal((await call('/' + id)).status, 200);
  const updated = await call('/' + id, 'PATCH', { name: 'Children Toys', isActive: false });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.category.slug, 'kids-toys');
  assert.equal((await call('/' + id, 'PATCH', { slug: 'children-toys' })).body.category.slug, 'children-toys');
  for (const body of [{}, { name: '' }, { name: 'Test', sortOrder: -1 }, { name: 'Test', isActive: 'true' }, { name: 'Test', slug: 'BAD SLUG' }, { name: 'Test', imageUrl: 'javascript:alert(1)' }, { name: 'Test', unknown: true }]) {
    assert.equal((await call('', 'POST', body)).status, 400);
  }
  for (const query of ['?page=0', '?limit=101', '?isActive=invalid']) assert.equal((await call(query)).status, 400);
  assert.equal((await call('/bad')).status, 400);
  assert.equal((await call('/000000000000000000000000')).status, 404);
  assert.equal((await call('/' + id, 'PATCH', {})).status, 400);
  const child = await call('', 'POST', { name: 'Building Blocks', parentCategory: id });
  assert.equal(child.status, 201);
  const childId = child.body.category._id;
  assert.equal(child.body.category.parentCategory, id);
  const parents = await call('/parents');
  assert.equal(parents.status, 200);
  assert.deepEqual(parents.body.categories.map(c => c.name), ['Jewels']);
  assert.deepEqual(Object.keys(parents.body.categories[0]).sort(), ['_id', 'name']);
  const grandchild = await call('', 'POST', { name: 'Wooden Blocks', parentCategory: childId });
  assert.equal(grandchild.status, 201);
  assert.equal((await call('?parentCategory=null')).body.total, 3);
  assert.equal((await call('?parentCategory=' + id)).body.total, 1);
  assert.equal((await call('/' + id + '/subcategories')).body.categories[0]._id, childId);
  assert.equal((await call('/' + id + '/subcategories?isActive=false')).body.total, 0);
  assert.equal((await call('', 'POST', { name: 'Invalid Parent', parentCategory: 'bad' })).status, 400);
  assert.equal((await call('', 'POST', { name: 'Missing Parent', parentCategory: '000000000000000000000000' })).status, 404);
  assert.equal((await call('/' + id, 'PATCH', { parentCategory: id })).status, 400);
  assert.equal((await call('/' + id, 'PATCH', { parentCategory: grandchild.body.category._id })).status, 400);
  assert.equal((await call('/' + id, 'DELETE')).status, 409);
  assert.equal((await call('/' + childId, 'PATCH', { parentCategory: null })).status, 200);
  assert.equal((await call('/' + id + '/subcategories')).body.total, 0);
  assert.equal((await call('/' + id, 'DELETE')).status, 204);
  assert.equal((await call('/' + id)).status, 404);
});
