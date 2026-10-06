const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const app = require('../src/app');

test('product CRUD, channel filters, validation, and category protection (in-memory repository)', async t => {
  const category = new Category({ _id: new mongoose.Types.ObjectId(), name: 'Toys', slug: 'toys' });
  const categoryId = String(category._id);
  const records = new Map();
  const filtered = filter => [...records.values()].filter(p => Object.entries(filter).every(([key, value]) => (value && typeof value === 'object' && '$ne' in value ? p[key] !== value.$ne : String(p[key]) === String(value))));
  const attach = product => {
    product.save = async () => {
      await product.validate();
      if ([...records.values()].some(p => String(p._id) !== String(product._id) && (p.sku === product.sku || p.slug === product.slug))) throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.set(String(product._id), product.toObject());
      return product;
    };
    return product;
  };
  t.mock.method(Product, 'create', async body => attach(new Product(body)).save());
  t.mock.method(Product, 'findById', async id => records.has(String(id)) ? attach(Product.hydrate(records.get(String(id)))) : null);
  t.mock.method(Product, 'find', filter => ({ sort: () => ({ skip: offset => ({ limit: async limit => filtered(filter).slice(offset, offset + limit).map(p => Product.hydrate(p)) }) }) }));
  t.mock.method(Product, 'countDocuments', async filter => filtered(filter).length);
  t.mock.method(Product, 'exists', async filter => filtered(filter)[0] || null);
  t.mock.method(Product, 'deleteOne', async filter => records.delete(String(filter._id)));
  t.mock.method(Category, 'exists', async filter => filter._id && String(filter._id) === categoryId ? { _id: category._id } : null);
  t.mock.method(Category, 'findById', async id => String(id) === categoryId ? category : null);
  t.mock.method(Category, 'deleteOne', async () => ({ deletedCount: 1 }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = 'GET', body) {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }
  const body = { name: 'Building Blocks', sku: 'toy-001', category: categoryId, productType: 'Blocks', images: [{ url: 'https://example.com/front.jpg' }], retailPrice: 499, hsnCode: ' 0101 ', cgst: 9, sgst: 9 };
  const created = await call('/products', 'POST', body);
  assert.equal(created.status, 201);
  assert.equal(created.body.product.sku, 'TOY-001');
  assert.equal(created.body.product.slug, 'building-blocks');
  assert.equal(created.body.product.__v, undefined);
  assert.equal(created.body.product.isTrending, false);
  assert.equal(created.body.product.isRecommended, false);
  assert.equal(created.body.product.hsnCode, '0101');
  assert.equal(created.body.product.cgst, 9);
  assert.equal(created.body.product.sgst, 9);
  const id = created.body.product._id;
  const taxUpdate = await call('/products/' + id, 'PATCH', { cgst: 2.5, sgst: 2.5 });
  assert.equal(taxUpdate.status, 200);
  assert.equal(taxUpdate.body.product.hsnCode, '0101');
  assert.equal((await call('/products/' + id)).body.product.cgst, 2.5);
  assert.equal((await call('/products')).body.products[0].sgst, 2.5);
  for (const patch of [{ hsnCode: 101 }, { hsnCode: null }, { hsnCode: '12AB' }, { hsnCode: '123' }, { hsnCode: '1234567890' }, { cgst: '9' }, { cgst: null }, { cgst: -1 }, { sgst: 101 }, { sgst: 1.234 }]) {
    assert.equal((await call('/products', 'POST', { ...body, ...patch })).status, 400);
    assert.equal((await call('/products/' + id, 'PATCH', patch)).status, 400);
  }
  assert.equal((await call('/products/' + id)).body.product.cgst, 2.5);
  const cleared = await call('/products/' + id, 'PATCH', { hsnCode: '', cgst: 0, sgst: 0 });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.product.hsnCode, '');
  assert.equal(cleared.body.product.cgst, 0);
  for (const key of ['hsnCode', 'cgst', 'sgst']) delete records.get(id)[key];
  const legacy = (await call('/products/' + id)).body.product;
  assert.equal(legacy.hsnCode, '');
  assert.equal(legacy.cgst, 0);
  assert.equal(legacy.sgst, 0);
  assert.equal((await call('/products', 'POST', body)).status, 409);
  for (const patch of [{ images: [] }, { images: [{ url: 'javascript:alert(1)' }] }, { images: Array.from({ length: 6 }, () => body.images[0]) }, { category: null }, { retailPrice: '499' }, { isWholesale: 'true' }, { unexpected: true }, { isTrending: 'true' }, { isRecommended: null }, { isWholesale: true }, { stockQuantity: 1.5 }]) {
    assert.equal((await call('/products', 'POST', { ...body, ...patch })).status, 400);
  }
  assert.equal((await call('/products', 'POST', { ...body, category: '000000000000000000000000' })).status, 404);
  assert.equal((await call('/products/' + id)).status, 200);
  assert.equal((await call('/products?isTrending=false')).body.total, 1);
  const featured = await call('/products/' + id, 'PATCH', { isTrending: true, isRecommended: true });
  assert.equal(featured.status, 200);
  assert.equal(featured.body.product.isTrending, true);
  assert.equal(featured.body.product.isRecommended, true);
  assert.equal((await call('/products?isTrending=true&isRecommended=true&isActive=true')).body.total, 1);
  assert.equal((await call('/products?isTrending=false')).body.total, 0);
  assert.equal((await call('/products/' + id, 'PATCH', { isTrending: false })).status, 200);
  assert.equal((await call('/products?isTrending=true')).body.total, 0);
  assert.equal((await call('/products?isRecommended=true')).body.total, 1);
  // Legacy records without these fields are not marked as featured.
  delete records.get(id).isTrending;
  assert.equal((await call('/products?isTrending=false')).body.total, 1);

  assert.equal((await call('/products/bad')).status, 400);
  assert.equal((await call('/products/000000000000000000000000')).status, 404);
  assert.equal((await call('/products/' + id, 'PATCH', { isWholesale: true })).status, 400);
  assert.equal((await call('/products/' + id)).body.product.isWholesale, false);
  const updated = await call('/products/' + id, 'PATCH', { name: 'Updated Blocks', isWholesale: true, wholesalePrice: 300, minWholesaleQty: 10 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.product.slug, 'building-blocks');
  assert.equal(updated.body.product.minWholesaleQty, 10);
  assert.equal((await call('/products?isWholesale=true&category=' + categoryId)).body.total, 1);
  assert.equal((await call('/products?isWholesale=false')).body.total, 0);
  assert.equal((await call('/products?productType=Blocks&limit=1')).body.products.length, 1);
  for (const query of ['?limit=101', '?page=0', '?isRetail=bad', '?isTrending=bad', '?isRecommended=1', '?category=bad']) assert.equal((await call('/products' + query)).status, 400);
  assert.equal((await call('/products/' + id, 'PATCH', { isRetail: false, isWholesale: false })).status, 400);
  assert.equal((await call('/products/' + id, 'PATCH', { category: '000000000000000000000000' })).status, 404);
  const images = [{ url: 'https://example.com/side.jpg' }, { url: 'https://example.com/front.jpg' }];
  assert.equal((await call('/products/' + id, 'PATCH', { images })).body.product.images[0].url, images[0].url);
  assert.equal((await call('/products/' + id, 'PATCH', {})).status, 400);
  assert.equal((await call('/categories/' + categoryId, 'DELETE')).status, 409);
  assert.equal((await call('/products/' + id, 'DELETE')).status, 204);
  assert.equal((await call('/products/' + id)).status, 404);
  assert.equal((await call('/categories/' + categoryId, 'DELETE')).status, 204);
});
