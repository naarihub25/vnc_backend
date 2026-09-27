const Category = require('../models/Category');
const Product = require('../models/Product');
const { fail } = require('../utils/validation');

async function search(query) {
  if (typeof query.q !== 'string' || query.q.trim().length < 2 || query.q.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(query.q)) fail('q must contain 2–100 characters');
  const q = query.q.trim();
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if ((query.page !== undefined && typeof query.page !== 'string') || (query.limit !== undefined && typeof query.limit !== 'string') || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const filter = { isActive: true };
  for (const key of ['isRetail', 'isWholesale', 'isTrending', 'isRecommended']) {
    if (query[key] !== undefined) {
      if (!['true', 'false'].includes(query[key])) fail(`${key} must be true or false`);
      filter[key] = ['isTrending', 'isRecommended'].includes(key) && query[key] === 'false' ? { $ne: true } : query[key] === 'true';
    }
  }
  // Treat user input as a literal substring, never as executable regex syntax.
  const match = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const categories = await Category.aggregate([
    { $match: { isActive: true, $or: [{ name: match }, { slug: match }] } },
    { $graphLookup: { from: Category.collection.name, startWith: '$_id', connectFromField: '_id', connectToField: 'parentCategory', as: 'descendants', restrictSearchWithMatch: { isActive: true } } },
    { $project: { _id: 1, 'descendants._id': 1 } },
  ]).option({ maxTimeMS: 5000 });
  const categoryIds = [...new Map(categories.flatMap(category => [category, ...category.descendants]).map(category => [String(category._id), category._id])).values()];
  filter.$or = ['name', 'slug', 'sku', 'productType', 'description'].map(key => ({ [key]: match }));
  if (categoryIds.length) filter.$or.push({ category: { $in: categoryIds } });
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(5000),
    Product.countDocuments(filter).maxTimeMS(5000),
  ]);
  return { products, total, page, limit, query: q };
}
module.exports = { search };
