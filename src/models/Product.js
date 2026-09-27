const mongoose = require('mongoose');
const { makeSlug } = require('./Category');

const imageSchema = new mongoose.Schema({
  url: {
    type: String, required: true, trim: true, maxlength: 2048,
    validate: {
      validator(value) {
        try { return ['http:', 'https:'].includes(new URL(value).protocol); }
        catch { return false; }
      },
      message: 'Image must have an HTTP or HTTPS URL',
    },
  },
  alt: { type: String, trim: true, maxlength: 200, default: '' },
}, { _id: false });

function validPrice(value) {
  return value == null || (Number.isFinite(value) && value >= 0 && value <= 1000000000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.0001);
}
const productSchema = new mongoose.Schema({
  // Identity and classification: one category or subcategory per product.
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 240,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid product slug'] },
  sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 100 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  productType: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 10000, default: '' },
  // Array order is display order; images[0] is the main product image.
  images: {
    type: [imageSchema], required: true,
    validate: { validator: value => Array.isArray(value) && value.length >= 1 && value.length <= 5,
      message: 'A product must have between 1 and 5 images' },
  },
  currency: { type: String, trim: true, uppercase: true, default: 'INR', required: true, match: /^[A-Z]{3}$/ },
  isRetail: { type: Boolean, default: true, required: true },
  retailPrice: { type: Number, required() { return this.isRetail; },
    validate: { validator: validPrice, message: 'Retail price must be between 0 and 1000000000 with at most 2 decimal places' } },
  isWholesale: { type: Boolean, default: false, required: true },
  wholesalePrice: { type: Number, required() { return this.isWholesale; },
    validate: { validator: validPrice, message: 'Wholesale price must be between 0 and 1000000000 with at most 2 decimal places' } },
  minWholesaleQty: { type: Number, required() { return this.isWholesale; }, min: 1, max: 1000000000,
    validate: { validator: Number.isInteger, message: 'Minimum wholesale quantity must be a whole number' } },
  stockQuantity: { type: Number, default: 0, required: true, min: 0, max: 1000000000,
    validate: { validator: Number.isInteger, message: 'Stock quantity must be a whole number' } },
  isActive: { type: Boolean, default: true, required: true },
  isTrending: { type: Boolean, default: false, required: true },
  isRecommended: { type: Boolean, default: false, required: true },
}, { timestamps: true, optimisticConcurrency: true, toJSON: { transform(doc, result) { delete result.__v; return result; } } });

productSchema.pre('validate', function () {
  if (this.isNew && !this.slug && this.name) this.slug = makeSlug(this.name);
  if (!this.isRetail && !this.isWholesale) this.invalidate('isRetail', 'Enable retail, wholesale, or both');
});
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isRetail: 1, isActive: 1 });
productSchema.index({ isWholesale: 1, isActive: 1 });
module.exports = mongoose.model('Product', productSchema);
