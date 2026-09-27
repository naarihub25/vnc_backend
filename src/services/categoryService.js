const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { fail, validateBody } = require('../utils/validation');
const fields = ['name', 'slug', 'description', 'imageUrl', 'sortOrder', 'isActive', 'parentCategory'];
function validate(body, creating = false) {
  validateBody(body, fields);
  if (!Object.keys(body).length) fail('No category fields supplied');
  if (body.parentCategory !== undefined && body.parentCategory !== null && !mongoose.isObjectIdOrHexString(body.parentCategory)) fail('Invalid parent category ID');
  if (creating || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) fail('Name must contain 1–100 characters');
  }
  if (body.slug !== undefined && (typeof body.slug !== 'string' || body.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug))) fail('Invalid category slug');
  for (const [key, max] of [['description', 2000], ['imageUrl', 2048]]) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max)) fail(`Invalid ${key}`);
  }
  if (body.imageUrl !== undefined && !Category.validImageUrl(body.imageUrl.trim())) fail('Enter an HTTP or HTTPS image URL');
  if (body.sortOrder !== undefined && (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 1000000)) fail('sortOrder must be an integer between 0 and 1000000');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') fail('isActive must be a boolean');
}
async function validateParent(parentId, categoryId) {
  const visited = new Set(categoryId ? [String(categoryId)] : []);
  let currentId = parentId;
  while (currentId) {
    const key = String(currentId);
    if (visited.has(key)) fail('A category cannot be its own parent or a descendant of itself');
    visited.add(key);
    const parent = await Category.findById(currentId);
    if (!parent) fail('Parent category not found', 404);
    currentId = parent.parentCategory;
  }
}
async function create(body) {
  validate(body, true);
  await validateParent(body.parentCategory);
  const slug = body.slug || Category.makeSlug(body.name);
  if (!slug) fail('Provide a slug containing lowercase letters or numbers');
  return Category.create({ ...body, slug });
}
async function list(query) {
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const filter = {};
  if (query.parentCategory !== undefined) {
    if (query.parentCategory === 'null') filter.parentCategory = null;
    else {
      if (!mongoose.isObjectIdOrHexString(query.parentCategory)) fail('Invalid parent category ID');
      filter.parentCategory = query.parentCategory;
    }
  }
  if (query.isActive !== undefined) {
    if (!['true', 'false'].includes(query.isActive)) fail('isActive must be true or false');
    filter.isActive = query.isActive === 'true';
  }
  const [categories, total] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1, name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    Category.countDocuments(filter),
  ]);
  return { categories, total, page, limit };
}
async function get(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid category ID');
  const category = await Category.findById(id);
  if (!category) fail('Category not found', 404);
  return category;
}
async function update(id, body) {
  validate(body);
  const category = await get(id);
  if (body.parentCategory !== undefined) await validateParent(body.parentCategory, id);
  for (const key of fields) if (body[key] !== undefined) category[key] = body[key];
  await category.save();
  return category;
}
async function remove(id) {
  const category = await get(id);
  if (await Category.exists({ parentCategory: category._id })) fail('Move or delete subcategories before deleting this category', 409);
  if (await Product.exists({ category: category._id })) fail('Move or delete products before deleting this category', 409);
  await Category.deleteOne({ _id: category._id });
}
async function subcategories(id, query) {
  await get(id);
  return list({ ...query, parentCategory: id });
}
async function parents() {
  return Category.find({ parentCategory: null, isActive: true })
    .sort({ sortOrder: 1, name: 1, _id: 1 }).select('_id name').lean();
}
module.exports = { create, list, get, update, remove, subcategories, parents };
