const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const app = require('../src/app');
const id = () => new mongoose.Types.ObjectId();
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(condition => matches(doc, condition));
    if (value && typeof value === 'object') {
      if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(doc[key] || '');
      if ('$in' in value) return value.$in.some(item => String(item) === String(doc[key]));
      if ('$ne' in value) return doc[key] !== value.$ne;
    }
    return doc[key] === value;
  });
}

test('global product search combines category descendants and product matches safely', async t => {
  const root = { _id: id(), name: 'Kids Toys', slug: 'kids-toys', isActive: true };
  const child = { _id: id(), name: 'Blocks', slug: 'blocks', parentCategory: root._id, isActive: true };
  const grandchild = { _id: id(), name: 'Wooden', parentCategory: child._id, isActive: true };
  const inactive = { _id: id(), name: 'Hidden', parentCategory: root._id, isActive: false };
  const categories = [root, child, grandchild, inactive];
  const product = (name, category, extra = {}) => ({ _id: id(), name, category, isActive: true, isRetail: true, isWholesale: false, createdAt: new Date(), ...extra });
  const products = [
    product('Classic Set', child._id), product('Wooden Set', grandchild._id, { isWholesale: true }),
    product('Kids Toys Bag', id(), { isTrending: true }), product('Kids Toys Inactive', child._id, { isActive: false }),
    product('Hidden Set', inactive._id), product('Ring', id(), { description: 'A sparkling jewel', sku: 'JEW-001' }),
    product('Literal .* product', id()),
  ];
  let timeout = false;
  let lastFilter;
  t.mock.method(Category, 'aggregate', pipeline => ({ option: async options => {
    assert.equal(options.maxTimeMS, 5000);
    if (timeout) throw Object.assign(new Error('timeout'), { code: 50 });
    assert.equal(pipeline[1].$graphLookup.from, Category.collection.name);
    assert.equal(pipeline[1].$graphLookup.connectToField, 'parentCategory');
    assert.deepEqual(pipeline[1].$graphLookup.restrictSearchWithMatch, { isActive: true });
    return categories.filter(c => matches(c, pipeline[0].$match)).map(c => {
      const descendants = [];
      const visit = parent => { for (const item of categories.filter(x => x.isActive && String(x.parentCategory) === String(parent))) { descendants.push(item); visit(item._id); } };
      visit(c._id);
      return { ...c, descendants };
    });
  } }));
  t.mock.method(Product, 'find', filter => {
    lastFilter = filter;
    return { sort: order => { assert.deepEqual(order, { createdAt: -1, _id: -1 }); return { skip: offset => ({ limit: limit => ({ maxTimeMS: async () => products.filter(p => matches(p, filter)).slice(offset, offset + limit) }) }) }; } };
  });
  t.mock.method(Product, 'countDocuments', filter => ({ maxTimeMS: async () => { assert.deepEqual(filter, lastFilter); return products.filter(p => matches(p, filter)).length; } }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/products/search`;
  async function call(query) { const r = await fetch(base + query); return { status: r.status, body: await r.json() }; }
  const result = await call('?q=KIDS%20TOYS');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.products.map(p => p.name), ['Classic Set', 'Wooden Set', 'Kids Toys Bag']);
  assert.equal(result.body.total, 3);
  assert.equal((await call('?q=kids%20toys&page=2&limit=2')).body.products.length, 1);
  assert.equal((await call('?q=blocks')).body.total, 2);
  assert.equal((await call('?q=kids%20toys&isWholesale=true')).body.total, 1);
  assert.equal((await call('?q=kids%20toys&isTrending=true')).body.total, 1);
  assert.equal((await call('?q=kids%20toys&isTrending=false')).body.total, 2);
  assert.equal((await call('?q=jewel')).body.products[0].name, 'Ring');
  assert.equal((await call('?q=jew-001')).body.total, 1);
  assert.equal((await call('?q=.*')).body.total, 1);
  assert.equal((await call('?q=doesnotexist')).body.total, 0);
  for (const query of ['', '?q=', '?q=a', '?q=%20%20', '?q=x&q=y', '?q=%00ab', '?q=' + 'x'.repeat(101), '?q=toys&page=0', '?q=toys&limit=101', '?q=toys&isWholesale=bad']) {
    assert.equal((await call(query)).status, 400, query);
  }
  timeout = true;
  assert.equal((await call('?q=toys')).status, 503);
});
