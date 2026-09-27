const mongoose = require('mongoose');
const positions = ['carousal', 'offerBanner'];
function validImageUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}
function validRedirectUrl(value) {
  if (typeof value !== 'string' || !value || /[\s\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  return /^https?:\/\//i.test(value) && validImageUrl(value);
}
const imageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true, maxlength: 2048, validate: { validator: validImageUrl, message: 'Image must have an HTTP or HTTPS URL' } },
  alt: { type: String, trim: true, maxlength: 200, default: '' },
}, { _id: false });
const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  images: { type: [imageSchema], required: true, validate: { validator: images => Array.isArray(images) && images.length >= 1, message: 'At least one image is required' } },
  redirectUrl: { type: String, required: true, trim: true, maxlength: 2048, validate: { validator: validRedirectUrl, message: 'Redirect URL must be an HTTP/HTTPS URL or a site path starting with /' } },
  position: { type: String, enum: positions, required: true },
  isActive: { type: Boolean, default: true, required: true },
  sortOrder: { type: Number, default: 0, required: true, min: 0, max: 1000000, validate: Number.isInteger },
}, { timestamps: true, optimisticConcurrency: true, toJSON: { transform(doc, result) { delete result.__v; return result; } } });
bannerSchema.index({ position: 1, isActive: 1, sortOrder: 1 });
module.exports = mongoose.model('Banner', bannerSchema);
module.exports.positions = positions;
module.exports.validImageUrl = validImageUrl;
module.exports.validRedirectUrl = validRedirectUrl;
