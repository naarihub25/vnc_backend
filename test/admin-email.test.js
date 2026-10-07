const { test } = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../src/services/emailService');
const orderService = require('../src/services/orderService');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const mongoose = require('mongoose');

test('admin notification content, optional configuration, and independent delivery after COD save', async t => {
  const previous = process.env.ADMIN_ORDER_EMAIL;
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_ORDER_EMAIL; else process.env.ADMIN_ORDER_EMAIL = previous; emailService.setTestSender(null); });
  const order = { _id: 'order123', status: 'pending', paymentMethod: 'online', payment: { status: 'pending' }, customer: { name: 'Buyer', email: 'buyer@example.com', phone: '9876543210' }, items: [{ name: 'Toy', sku: 'T1', quantity: 1, lineTotal: 10 }], subtotal: 10, currency: 'INR', shippingAddress: { line1: 'Main Road', city: 'Bengaluru' } };
  const sent = [];
  emailService.setTestSender(async message => { sent.push(message); });
  delete process.env.ADMIN_ORDER_EMAIL;
  assert.equal((await emailService.sendAdminOrderCreatedEmail(order)).skipped, true);
  process.env.ADMIN_ORDER_EMAIL = 'admin@example.com';
  await emailService.sendAdminOrderCreatedEmail(order);
  assert.equal(sent[0].to, 'admin@example.com');
  assert.match(sent[0].text, /Payment Status: pending/);
  assert.match(sent[0].text, /buyer@example.com/);
  assert.match(sent[0].text, /Toy \(T1\) x 1/);
  assert.match(sent[0].text, /Main Road/);
  const userId = new mongoose.Types.ObjectId(), productId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', async () => ({ _id: userId, role: 'guestUser', isActive: true, ...order.customer, address: { toObject: () => order.shippingAddress } }));
  t.mock.method(Product, 'find', async () => [{ _id: productId, name: 'Toy', sku: 'T1', isActive: true, isRetail: true, retailPrice: 10, currency: 'INR', stockQuantity: 10 }]);
  let saved = false;
  t.mock.method(Order, 'create', async data => { saved = true; return { _id: 'order123', ...data }; });
  t.mock.method(console, 'error', () => {});
  const delivered = [];
  emailService.setTestSender(async message => {
    assert.equal(saved, true);
    delivered.push(message.to);
    if (message.to === 'admin@example.com') throw new Error('SMTP rejected admin');
  });
  await orderService.create({ userId: String(userId), items: [{ productId: String(productId), quantity: 1 }], paymentMethod: 'cod' });
  assert.deepEqual(delivered.sort(), ['admin@example.com', 'buyer@example.com']);
});
