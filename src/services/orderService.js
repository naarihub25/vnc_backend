const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const emailService = require('./emailService');
const { fail, validateBody } = require('../utils/validation');
const { validPhone } = require('../utils/checkoutValidation');
function validateOrderItems(body) {
  if (typeof body.userId !== 'string' || !mongoose.isObjectIdOrHexString(body.userId)) fail('A valid userId is required');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) fail('Order must contain 1–100 items');
  const seen = new Set();
  for (const item of body.items) {
    validateBody(item, ['productId', 'quantity']);
    if (typeof item.productId !== 'string' || !mongoose.isObjectIdOrHexString(item.productId)) fail('Invalid productId');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000000000) fail('Invalid quantity');
    const key = item.productId.toLowerCase();
    if (seen.has(key)) fail('Combine duplicate products into one item');
    seen.add(key);
  }
}
async function buildOrderData(body) {
  validateOrderItems(body);
  const user = await User.findById(body.userId);
  if (!user) fail('Guest user not found', 404);
  if (user.role !== 'guestUser' || user.isActive !== true) fail('Checkout requires an active guest user', 403);
  if (!user.address || !validPhone(user.phone) || !user.email) fail('Guest contact and delivery address are required');
  const products = await Product.find({ _id: { $in: body.items.map(item => item.productId) } });
  const byId = new Map(products.map(product => [String(product._id), product]));
  let currency, subtotalCents = 0;
  const items = body.items.map(item => {
    const product = byId.get(item.productId.toLowerCase());
    if (!product) fail('Product not found', 404);
    if (!product.isActive || !product.isRetail) fail('A product is unavailable for guest checkout', 409);
    if (product.stockQuantity < item.quantity) fail('Insufficient stock', 409);
    if (!Number.isFinite(product.retailPrice) || product.retailPrice < 0) fail('Product retail price is unavailable', 409);
    if (currency && currency !== product.currency) fail('All products must use the same currency');
    currency = product.currency;
    const unitCents = Math.round(product.retailPrice * 100);
    const lineCents = unitCents * item.quantity;
    subtotalCents += lineCents;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(subtotalCents)) fail('Order amount is too large');
    return { product: product._id, name: product.name, sku: product.sku, quantity: item.quantity, unitPrice: unitCents / 100, lineTotal: lineCents / 100 };
  });
  return { user, items, currency, subtotal: subtotalCents / 100 };
}
async function create(body) {
  validateBody(body, ['userId', 'items', 'paymentMethod']);
  if (!['cod', 'online'].includes(body.paymentMethod)) fail('paymentMethod is required and must be cod or online');
  if (body.paymentMethod === 'online') fail('Use the Razorpay create-order API for online payments.');
  const { user, items, currency, subtotal } = await buildOrderData(body);
  const order = await Order.create({ user: user._id, customer: { name: user.name, email: user.email, phone: user.phone }, shippingAddress: user.address.toObject(), items, currency, subtotal, status: 'pending', paymentMethod: body.paymentMethod, payment: { status: 'pending' } });
  emailService.sendOrderCreatedEmail(order).catch(error => {
    console.error(`Order created email failed for ${order._id}: ${error.message}`);
  });
  return { flag: true, data: order };
}
function dateBoundary(value, name, end = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${name} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`Invalid ${name}`);
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
async function list(query) {
  const allowed = ['page', 'limit', 'status', 'paymentMethod', 'paymentStatus', 'userId', 'q', 'fromDate', 'toDate', 'sortBy', 'sortOrder'];
  if (Object.keys(query).some(key => !allowed.includes(key))) fail('Unsupported order filter');
  for (const value of Object.values(query)) if (typeof value !== 'string') fail('Order filters must be single values');
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const filter = {};
  for (const [key, path, values] of [
    ['status', 'status', Order.schema.path('status').enumValues],
    ['paymentMethod', 'paymentMethod', Order.schema.path('paymentMethod').enumValues],
    ['paymentStatus', 'payment.status', Order.schema.path('payment').schema.path('status').enumValues],
  ]) {
    if (query[key] !== undefined) {
      if (!values.includes(query[key])) fail(`Invalid ${key}`);
      filter[path] = query[key];
    }
  }
  if (query.userId !== undefined) {
    if (!mongoose.isObjectIdOrHexString(query.userId)) fail('Invalid userId');
    filter.user = query.userId;
  }
  if (query.fromDate !== undefined || query.toDate !== undefined) {
    filter.createdAt = {};
    if (query.fromDate !== undefined) filter.createdAt.$gte = dateBoundary(query.fromDate, 'fromDate');
    if (query.toDate !== undefined) filter.createdAt.$lt = dateBoundary(query.toDate, 'toDate', true);
    if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) fail('fromDate must not be after toDate');
  }
  if (query.q !== undefined) {
    const q = query.q.trim();
    if (!q || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q)) fail('q must contain 1–100 characters');
    const match = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = ['customer.name', 'customer.email', 'customer.phone'].map(key => ({ [key]: match }));
    if (mongoose.isObjectIdOrHexString(q)) filter.$or.push({ _id: q });
  }
  const sortBy = query.sortBy || 'createdAt', sortOrder = query.sortOrder || 'desc';
  if (!['createdAt', 'subtotal'].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) fail('Invalid sort options');
  const direction = sortOrder === 'asc' ? 1 : -1;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ [sortBy]: direction, _id: direction }).skip((page - 1) * limit).limit(limit).maxTimeMS(5000),
    Order.countDocuments(filter).maxTimeMS(5000),
  ]);
  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
}
async function get(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid order ID');
  const order = await Order.findById(id);
  if (!order) fail('Order not found', 404);
  return { flag: true, data: order };
}
async function updateStatus(id, body) {
  validateBody(body, ['status', 'reason', 'logistics']);
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid order ID');
  const allowed = Order.schema.path('status').enumValues;
  if (!allowed.includes(body.status)) fail('Invalid status');
  if (body.reason !== undefined && typeof body.reason !== 'string') fail('Reason must be a string');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (['returned', 'cancelled'].includes(body.status) && !reason) fail('Reason is required when an order is returned or cancelled');
  if (reason.length > 500) fail('Reason must be 500 characters or fewer');
  const hasLogistics = body.logistics !== undefined;
  let logistics = {};
  if (hasLogistics) {
    validateBody(body.logistics, ['logisticsId', 'logisticsName', 'trackingUrl', 'notes']);
    for (const key of ['logisticsId', 'logisticsName', 'trackingUrl', 'notes']) {
      if (body.logistics[key] !== undefined && typeof body.logistics[key] !== 'string') fail(`${key} must be a string`);
      logistics[key] = typeof body.logistics[key] === 'string' ? body.logistics[key].trim() : '';
    }
  }
  if (body.status === 'shipped' && !hasLogistics) fail('Logistics ID and logistics name are required when an order is shipped');
  if (['shipped', 'delivered'].includes(body.status) && hasLogistics) {
    if (!logistics.logisticsId || !logistics.logisticsName) fail('Logistics ID and logistics name are required when an order is shipped');
    if (logistics.logisticsId.length > 100 || logistics.logisticsName.length > 100) fail('Logistics ID and logistics name must be 100 characters or fewer');
    if (logistics.trackingUrl.length > 500 || logistics.notes.length > 500) fail('Tracking URL and logistics notes must be 500 characters or fewer');
    if (logistics.trackingUrl && !/^https?:\/\/\S+$/i.test(logistics.trackingUrl)) fail('Tracking URL must start with http:// or https://');
  }
  const order = await Order.findById(id);
  if (!order) fail('Order not found', 404);
  if (order.paymentMethod === 'online' && order.payment.status !== 'paid' && ['approved', 'shipped', 'delivered', 'returned'].includes(body.status)) fail('Online payment must be completed before approving or fulfilling the order', 409);
  order.status = body.status;
  order.statusReason = ['returned', 'cancelled'].includes(body.status) ? reason : '';
  if (body.status === 'shipped') order.logistics = logistics;
  else if (body.status === 'delivered' && hasLogistics) order.logistics = logistics;
  else if (!['shipped', 'delivered'].includes(body.status)) order.logistics = {};
  if (body.status === 'delivered' && order.paymentMethod === 'cod') {
    order.payment.status = 'paid';
    if (!order.payment.paidAt) order.payment.paidAt = new Date();
  }
  await order.save();
  emailService.sendOrderStatusEmail(order).catch(error => {
    console.error(`Order status email failed for ${order._id}: ${error.message}`);
  });
  return { flag: true, data: order };
}
module.exports = { create, list, get, updateStatus, buildOrderData };
