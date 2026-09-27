const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const { fail, validateBody } = require('../utils/validation');
const fields = ['title', 'images', 'redirectUrl', 'position', 'isActive', 'sortOrder'];
function validate(body, creating = false) {
  validateBody(body, fields);
  if (!Object.keys(body).length) fail('No banner fields supplied');
  if (creating) for (const key of ['title', 'images', 'redirectUrl', 'position']) if (body[key] === undefined) fail(`${key} is required`);
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200)) fail('Title must contain 1–200 characters');
  if (body.redirectUrl !== undefined && (typeof body.redirectUrl !== 'string' || body.redirectUrl.length > 2048 || !Banner.validRedirectUrl(body.redirectUrl.trim()))) fail('Invalid redirect URL');
  if (body.position !== undefined && !Banner.positions.includes(body.position)) fail('Position must be carousal or offerBanner');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') fail('isActive must be a boolean');
  if (body.sortOrder !== undefined && (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 1000000)) fail('Invalid sortOrder');
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || !body.images.length) fail('At least one image is required');
    for (const image of body.images) {
      validateBody(image, ['url', 'alt']);
      if (typeof image.url !== 'string' || !image.url.trim() || image.url.length > 2048 || !Banner.validImageUrl(image.url.trim())) fail('Image must have an HTTP or HTTPS URL');
      if (image.alt !== undefined && (typeof image.alt !== 'string' || image.alt.length > 200)) fail('Invalid image alt text');
    }
  }
}
async function create(body) { validate(body, true); return Banner.create(body); }
async function list(query) {
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const filter = {};
  if (query.position !== undefined) {
    if (!Banner.positions.includes(query.position)) fail('Invalid banner position');
    filter.position = query.position;
  }
  if (query.isActive !== undefined) {
    if (!['true', 'false'].includes(query.isActive)) fail('isActive must be true or false');
    filter.isActive = query.isActive === 'true';
  }
  const [banners, total] = await Promise.all([
    Banner.find(filter).sort({ sortOrder: 1, createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit),
    Banner.countDocuments(filter),
  ]);
  return { banners, total, page, limit };
}
async function get(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid banner ID');
  const banner = await Banner.findById(id);
  if (!banner) fail('Banner not found', 404);
  return banner;
}
async function update(id, body) {
  validate(body);
  const banner = await get(id);
  for (const key of fields) if (body[key] !== undefined) banner[key] = body[key];
  await banner.save();
  return banner;
}
async function remove(id) { const banner = await get(id); await Banner.deleteOne({ _id: banner._id }); }
function positions() { return [{ value: 'carousal', label: 'Carousel' }, { value: 'offerBanner', label: 'Offer Banner' }]; }
module.exports = { create, list, get, update, remove, positions };
