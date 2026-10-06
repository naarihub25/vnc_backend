const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const base = () => ({ name: ' Wooden Building Blocks ', sku: ' toy-001 ', category: new mongoose.Types.ObjectId(), productType: 'Building Blocks', retailPrice: 499.99, images: [{ url: 'https://example.com/front.jpg', alt: 'Front view' }] });

test('product schema supports retail, wholesale and shared category/image data', async () => {
  const retail = new Product(base());
  await retail.validate();
  assert.equal(retail.name, 'Wooden Building Blocks');
  assert.equal(retail.sku, 'TOY-001');
  assert.equal(retail.slug, 'wooden-building-blocks');
  assert.equal(retail.isRetail, true);
  assert.equal(retail.isWholesale, false);
  assert.equal(retail.isTrending, false);
  assert.equal(retail.isRecommended, false);
  assert.equal(retail.currency, 'INR');
  assert.equal(retail.hsnCode, '');
  assert.equal(retail.cgst, 0);
  assert.equal(retail.sgst, 0);
  assert.equal(retail.images[0].url, 'https://example.com/front.jpg');
  assert.equal(retail.images[0]._id, undefined);
  await new Product({ ...base(), isWholesale: true, wholesalePrice: 350, minWholesaleQty: 10 }).validate();
  await new Product({ ...base(), isRetail: false, retailPrice: undefined, isWholesale: true, wholesalePrice: 350, minWholesaleQty: 5 }).validate();
  const images = Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/${i}.jpg` }));
  const product = new Product({ ...base(), images });
  await product.validate();
  assert.deepEqual(product.images.map(image => image.url), images.map(image => image.url));
});

test('product schema rejects missing identity, invalid images and invalid channel pricing', async () => {
  const invalid = [
    { name: '' }, { sku: '' }, { category: undefined }, { category: 'invalid' }, { productType: '' },
    { images: [] }, { images: null }, { images: Array.from({ length: 6 }, () => ({ url: 'https://example.com/a.jpg' })) },
    { images: [{ url: 'javascript:alert(1)' }] }, { images: [{}] },
    { retailPrice: undefined }, { retailPrice: -1 }, { retailPrice: 1.234 },
    { isWholesale: true }, { isWholesale: true, wholesalePrice: 300 },
    { isWholesale: true, wholesalePrice: 300, minWholesaleQty: 0 },
    { isWholesale: true, wholesalePrice: 300, minWholesaleQty: 1.5 },
    { isWholesale: true, wholesalePrice: -1, minWholesaleQty: 5 },
    { isRetail: false, isWholesale: false }, { stockQuantity: -1 }, { stockQuantity: 1.5 },
  ];
  for (const patch of invalid) await assert.rejects(new Product({ ...base(), ...patch }).validate(), undefined, JSON.stringify(patch));
});
