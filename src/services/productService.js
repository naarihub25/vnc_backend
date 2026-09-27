const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { fail, validateBody } = require('../utils/validation');
const fields = ['name', 'slug', 'sku', 'category', 'productType', 'description', 'images', 'currency', 'isRetail', 'retailPrice', 'isWholesale', 'wholesalePrice', 'minWholesaleQty', 'stockQuantity', 'isActive', 'isTrending', 'isRecommended'];
function validate(body, creating = false) {
  validateBody(body, fields);
  if (!Object.keys(body).length) fail('No product fields supplied');
  if (creating) for (const key of ['name', 'sku', 'category', 'productType', 'images']) if (body[key] === undefined) fail(`${key} is required`);
  for (const key of ['name', 'slug', 'sku', 'productType', 'description', 'currency']) {
    if (body[key] !== undefined && typeof body[key] !== 'string') fail(`${key} must be a string`);
  }
  if (body.category !== undefined && (typeof body.category !== 'string' || !mongoose.isObjectIdOrHexString(body.category))) fail('Invalid category ID');
  for (const key of ['isRetail', 'isWholesale', 'isActive', 'isTrending', 'isRecommended']) if (body[key] !== undefined && typeof body[key] !== 'boolean') fail(`${key} must be a boolean`);
  for (const key of ['retailPrice', 'wholesalePrice', 'minWholesaleQty', 'stockQuantity']) {
    if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(body[key]))) fail(`${key} must be a number`);
  }
  if (body.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) fail('Invalid product slug');
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5) fail('A product must have between 1 and 5 images');
    for (const image of body.images) {
      validateBody(image, ['url', 'alt']);
      if (typeof image.url !== 'string' || !image.url.trim() || !Category.validImageUrl(image.url.trim())) fail('Image must have an HTTP or HTTPS URL');
      if (image.alt !== undefined && typeof image.alt !== 'string') fail('Image alt must be a string');
    }
  }
}
async function requireCategory(id) {
  if (!await Category.exists({ _id: id })) fail('Category not found', 404);
}
async function create(body) {
  validate(body, true);
  await requireCategory(body.category);
  return Product.create(body);
}
async function list(query) {
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const filter = {};
  if (query.category !== undefined) {
    if (typeof query.category !== 'string' || !mongoose.isObjectIdOrHexString(query.category)) fail('Invalid category ID');
    filter.category = query.category;
  }
  for (const key of ['isRetail', 'isWholesale', 'isActive', 'isTrending', 'isRecommended']) {
    if (query[key] !== undefined) {
      if (!['true', 'false'].includes(query[key])) fail(`${key} must be true or false`);
      // Older products without merchandising flags behave as false.
      filter[key] = ['isTrending', 'isRecommended'].includes(key) && query[key] === 'false' ? { $ne: true } : query[key] === 'true';
    }
  }
  if (query.productType !== undefined) {
    if (typeof query.productType !== 'string' || !query.productType.trim() || query.productType.length > 100) fail('Invalid productType');
    filter.productType = query.productType.trim();
  }
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);
  return { products, total, page, limit };
}
async function get(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid product ID');
  const product = await Product.findById(id);
  if (!product) fail('Product not found', 404);
  return product;
}
async function update(id, body) {
  validate(body);
  const product = await get(id);
  await requireCategory(body.category || product.category);
  // Document save validates the merged retail/wholesale settings and image count.
  for (const key of fields) if (body[key] !== undefined) product[key] = body[key];
  await product.save();
  return product;
}
async function remove(id) {
  const product = await get(id);
  await Product.deleteOne({ _id: product._id });
}
module.exports = { create, list, get, update, remove };
