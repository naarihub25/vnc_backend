const mongoose = require('mongoose');

function makeSlug(name) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function validImageUrl(value) {
  if (value === '') return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 120,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers and hyphens'] },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  imageUrl: { type: String, trim: true, maxlength: 2048, default: '', validate: { validator: validImageUrl, message: 'Enter an HTTP or HTTPS image URL' } },
  sortOrder: { type: Number, default: 0, min: 0, max: 1000000, validate: Number.isInteger },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, toJSON: { transform(doc, result) { delete result.__v; return result; } } });
categorySchema.pre('validate', function () {
  if (this.isNew && !this.slug && this.name) this.slug = makeSlug(this.name);
});
categorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });
categorySchema.index({ parentCategory: 1, isActive: 1, sortOrder: 1 });
const Category = mongoose.model('Category', categorySchema);
module.exports = Category;
module.exports.makeSlug = makeSlug;
module.exports.validImageUrl = validImageUrl;
