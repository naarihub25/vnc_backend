const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const razorpayService = require('../src/services/razorpayService');
const emailService = require('../src/services/emailService');
const app = require('../src/app');

const address = () => ({ line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN' });

test('Razorpay online order creation, verification, and webhook update payment state', async t => {
  const previous = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret';
  t.after(() => {
    process.env.RAZORPAY_KEY_ID = previous.keyId;
    process.env.RAZORPAY_KEY_SECRET = previous.keySecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = previous.webhookSecret;
    razorpayService.setTestClient(null);
    emailService.setTestSender(null);
  });

  const users = new Map(), orders = [], sentEmails = [];
  const user = new User({ _id: new mongoose.Types.ObjectId(), name: 'Online Customer', email: 'online@example.com', phone: '+91 9876543210', role: 'guestUser', address: address(), isActive: true });
  users.set(String(user._id), user);
  t.mock.method(User, 'findById', async id => users.get(String(id)) || null);
  const product = new Product({ _id: new mongoose.Types.ObjectId(), name: 'Jewel', sku: 'JWL-1', category: new mongoose.Types.ObjectId(), productType: 'Jewels', images: [{ url: 'https://example.com/jewel.jpg' }], retailPrice: 125.5, stockQuantity: 5 });
  t.mock.method(Product, 'find', async filter => filter._id.$in.some(id => String(id) === String(product._id)) ? [product] : []);
  t.mock.method(Order.prototype, 'save', async function () {
    await this.validate();
    if (!orders.includes(this)) orders.push(this);
    return this;
  });
  t.mock.method(Order, 'findById', async id => orders.find(order => String(order._id) === String(id)) || null);
  t.mock.method(Order, 'findOne', async filter => orders.find(order => order.payment.provider === filter['payment.provider'] && order.payment.providerOrderId === filter['payment.providerOrderId']) || null);
  razorpayService.setTestClient({ orders: { create: async data => { assert.equal(orders.length, 0); return { id: 'order_test_123', amount: data.amount, currency: data.currency }; } } });
  emailService.setTestSender(async message => { sentEmails.push(message); return { messageId: String(sentEmails.length) }; });

  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.close(); server.closeAllConnections(); });
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const orderBody = { userId: String(user._id), items: [{ productId: String(product._id), quantity: 2 }] };

  const created = await fetch(base + '/payments/razorpay/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(orderBody) });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.order.paymentMethod, 'online');
  assert.equal(createdBody.data.order.payment.provider, 'razorpay');
  assert.equal(createdBody.data.razorpay.keyId, 'rzp_test_key');
  assert.equal(createdBody.data.razorpay.orderId, 'order_test_123');
  assert.equal(createdBody.data.razorpay.amount, 25100);
  assert.equal(orders[0].payment.providerOrderId, 'order_test_123');
  assert.equal(orders[0].status, 'pending');
  assert.equal(orders[0].payment.status, 'pending');
  const premature = await fetch(base + '/orders/' + orders[0]._id + '/status', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
  assert.equal(premature.status, 409);
  assert.equal(orders[0].status, 'pending');
  assert.match(sentEmails[0].subject, /Thank you for your order/);

  const postOrder = () => fetch(base + '/payments/razorpay/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(orderBody) });
  const count = orders.length;
  delete process.env.RAZORPAY_KEY_SECRET;
  const missingConfig = await postOrder();
  assert.equal(missingConfig.status, 503);
  assert.deepEqual(await missingConfig.json(), { error: 'Razorpay is not configured' });
  assert.equal(orders.length, count);
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  t.mock.method(console, 'error', () => {});
  for (const statusCode of [401, 403, 400, 429, 500, undefined]) {
    razorpayService.setTestClient({ orders: { create: async () => { throw { statusCode, error: { code: 'BAD_REQUEST_ERROR', description: 'private provider details' } }; } } });
    const failure = await postOrder();
    assert.equal(failure.status, [401, 403].includes(statusCode) ? 503 : 502);
    assert.doesNotMatch(JSON.stringify(await failure.json()), /private provider details/);
    assert.equal(orders.length, count);
    assert.equal(sentEmails.length, 1);
  }

  const paymentId = 'pay_test_123';
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`order_test_123|${paymentId}`).digest('hex');
  const verified = await fetch(base + '/payments/razorpay/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: 'order_test_123', razorpay_payment_id: paymentId, razorpay_signature: signature }) });
  assert.equal(verified.status, 200);
  assert.equal(orders[0].payment.status, 'paid');
  assert.equal(orders[0].payment.transactionId, paymentId);
  assert.equal(orders[0].status, 'approved');

  const bad = await fetch(base + '/payments/razorpay/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: 'order_test_123', razorpay_payment_id: paymentId, razorpay_signature: 'bad' }) });
  assert.equal(bad.status, 400);

  orders[0].payment.status = 'pending';
  orders[0].status = 'pending';
  const payload = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_test_123', id: 'pay_webhook_123', status: 'captured', created_at: 1790000000 } } } }));
  const webhookSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
  const webhook = await fetch(base + '/payments/razorpay/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': webhookSignature }, body: payload });
  assert.equal(webhook.status, 200);
  assert.equal(orders[0].payment.status, 'paid');
  assert.equal(orders[0].payment.transactionId, 'pay_webhook_123');
  assert.equal(orders[0].status, 'approved');
});
