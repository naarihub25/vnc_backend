const mongoose = require('mongoose');
const addressSchema = require('./shared/address');
const { validPhone } = require('../utils/checkoutValidation');
const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });
const paymentSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'], default: 'pending', required: true },
  provider: { type: String, trim: true, maxlength: 100, default: null },
  providerOrderId: { type: String, trim: true, maxlength: 200, default: null },
  transactionId: { type: String, trim: true, maxlength: 200, default: null },
  paidAt: { type: Date, default: null },
}, { _id: false });
const logisticsSchema = new mongoose.Schema({
  logisticsId: { type: String, trim: true, maxlength: 100, default: '' },
  logisticsName: { type: String, trim: true, maxlength: 100, default: '' },
  trackingUrl: { type: String, trim: true, maxlength: 500, default: '' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });
const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true, validate: validPhone },
  },
  shippingAddress: { type: addressSchema, required: true },
  items: { type: [itemSchema], required: true, validate: value => Array.isArray(value) && value.length >= 1 && value.length <= 100 },
  currency: { type: String, required: true },
  subtotal: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['cod', 'online'], required: true },
  payment: { type: paymentSchema, required: true, default: () => ({}) },
  status: { type: String, enum: ['pending', 'approved', 'shipped', 'delivered', 'returned', 'cancelled'], default: 'pending', required: true },
  statusReason: { type: String, trim: true, maxlength: 500, default: '' },
  logistics: { type: logisticsSchema, default: () => ({}) },
}, { timestamps: true, toJSON: { transform(doc, result) { delete result.__v; return result; } } });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1, _id: -1 });
orderSchema.index({ paymentMethod: 1, 'payment.status': 1, createdAt: -1 });
module.exports = mongoose.model('Order', orderSchema);
