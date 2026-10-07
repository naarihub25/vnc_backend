const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const orderService = require('./orderService');
const emailService = require('./emailService');
const { fail, validateBody } = require('../utils/validation');

let client;
let testClient;

function keyId() {
  return process.env.RAZORPAY_KEY_ID;
}

function keySecret() {
  return process.env.RAZORPAY_KEY_SECRET;
}

function webhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET;
}

function getClient() {
  if (!keyId() || !keySecret()) fail('Razorpay is not configured', 503);
  if (testClient) return testClient;
  if (!client) client = new Razorpay({ key_id: keyId(), key_secret: keySecret() });
  return client;
}

function amountPaise(order) {
  const paise = Math.round(Number(order.subtotal) * 100);
  if (!Number.isSafeInteger(paise) || paise < 100) fail('Order amount is invalid for online payment');
  return paise;
}

function verifySignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function createRazorpayOrder(body) {
  validateBody(body, ['userId', 'items']);
  const { user, items, currency, subtotal } = await orderService.buildOrderData(body);
  if (currency !== 'INR') fail('Razorpay online payment currently supports INR only');
  const paymentClient = getClient();
  const amount = amountPaise({ subtotal });
  const order = new Order({
    user: user._id,
    customer: { name: user.name, email: user.email, phone: user.phone },
    shippingAddress: user.address.toObject(),
    items,
    currency,
    subtotal,
    status: 'pending',
    paymentMethod: 'online',
    payment: { status: 'pending', provider: 'razorpay' },
  });
  await order.validate(); // Validate in memory; do not persist until Razorpay succeeds.
  let razorpayOrder;
  try {
    razorpayOrder = await paymentClient.orders.create({
    amount,
    currency,
    receipt: String(order._id),
    notes: { localOrderId: String(order._id), customerEmail: order.customer.email },
  });
  } catch (error) {
    // Log only diagnostic codes, never credentials, headers or customer data.
    const statusCode = Number(error?.statusCode);
    const rawCode = error?.error?.code || error?.code;
    const code = typeof rawCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(rawCode) ? rawCode : 'UNKNOWN';
    console.error('Razorpay order creation failed', { localOrderId: String(order._id), statusCode: Number.isFinite(statusCode) ? statusCode : null, code });
    if (statusCode === 401 || statusCode === 403) fail('Razorpay authentication failed. Check the server API key configuration.', 503);
    fail('Unable to create the Razorpay order. Please try again later.', 502);
  }
  if (!razorpayOrder?.id || razorpayOrder.amount !== amount || razorpayOrder.currency !== currency) fail('Invalid response from Razorpay. Please try again later.', 502);
  order.payment.providerOrderId = razorpayOrder.id;
  await order.save();
  emailService.sendAdminOrderCreatedEmail(order).catch(error => {
    console.error(`Admin order notification failed for ${order._id}: ${error.message}`);
  });
  emailService.sendOrderCreatedEmail(order).catch(error => {
    console.error(`Order created email failed for ${order._id}: ${error.message}`);
  });
  return { flag: true, data: { order, razorpay: { keyId: keyId(), orderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency } } };
}

async function verifyPayment(body) {
  validateBody(body, ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']);
  for (const key of ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']) if (typeof body[key] !== 'string' || !body[key].trim()) fail(`${key} is required`);
  if (!keySecret()) fail('Razorpay is not configured', 503);
  if (!verifySignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) fail('Invalid Razorpay payment signature', 400);
  const order = await Order.findOne({ 'payment.provider': 'razorpay', 'payment.providerOrderId': body.razorpay_order_id });
  if (!order) fail('Order not found', 404);
  order.payment.status = 'paid';
  order.payment.transactionId = body.razorpay_payment_id;
  if (!order.payment.paidAt) order.payment.paidAt = new Date();
  if (order.status === 'pending') order.status = 'approved';
  await order.save();
  emailService.sendOrderStatusEmail(order).catch(error => {
    console.error(`Order status email failed for ${order._id}: ${error.message}`);
  });
  return { flag: true, data: order };
}

function validateWebhook(rawBody, signature) {
  if (!webhookSecret()) fail('Razorpay webhook is not configured', 503);
  if (typeof signature !== 'string' || !signature) fail('Missing Razorpay webhook signature', 400);
  const expected = crypto.createHmac('sha256', webhookSecret()).update(rawBody).digest('hex');
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) fail('Invalid Razorpay webhook signature', 400);
}

async function handleWebhook(rawBody, signature) {
  validateWebhook(rawBody, signature);
  const event = JSON.parse(rawBody.toString('utf8'));
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return { received: true };
  const order = await Order.findOne({ 'payment.provider': 'razorpay', 'payment.providerOrderId': payment.order_id });
  if (!order) return { received: true };
  if (event.event === 'payment.captured' || payment.status === 'captured') {
    order.payment.status = 'paid';
    order.payment.transactionId = payment.id || order.payment.transactionId;
    if (!order.payment.paidAt) order.payment.paidAt = new Date((payment.created_at || Math.floor(Date.now() / 1000)) * 1000);
    if (order.status === 'pending') order.status = 'approved';
  } else if ((event.event === 'payment.failed' || payment.status === 'failed') && order.payment.status !== 'paid') {
    order.payment.status = 'failed';
    order.payment.transactionId = payment.id || order.payment.transactionId;
  }
  await order.save();
  return { received: true };
}

function setTestClient(value) {
  testClient = value;
}

module.exports = { createRazorpayOrder, verifyPayment, handleWebhook, setTestClient };
