const nodemailer = require('nodemailer');

let transporter;
let testSender;

function configured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransporter() {
  if (!configured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return transporter;
}

function statusSubject(order) {
  return `Your order ${order._id} is ${order.status}`;
}

function statusText(order) {
  const lines = [
    `Hello ${order.customer.name},`,
    '',
    `Your order ${order._id} status is now ${order.status}.`,
  ];
  if (order.status === 'shipped' || order.status === 'delivered') {
    if (order.logistics?.logisticsName) lines.push(`Logistics partner: ${order.logistics.logisticsName}`);
    if (order.logistics?.logisticsId) lines.push(`Logistics ID: ${order.logistics.logisticsId}`);
    if (order.logistics?.trackingUrl) lines.push(`Tracking URL: ${order.logistics.trackingUrl}`);
  }
  if (order.statusReason) lines.push(`Reason: ${order.statusReason}`);
  lines.push('', 'Thank you for shopping with VNUC.');
  return lines.join('\n');
}

function statusHtml(order) {
  const logistics = order.status === 'shipped' || order.status === 'delivered'
    ? [
      order.logistics?.logisticsName && `<p><strong>Logistics partner:</strong> ${order.logistics.logisticsName}</p>`,
      order.logistics?.logisticsId && `<p><strong>Logistics ID:</strong> ${order.logistics.logisticsId}</p>`,
      order.logistics?.trackingUrl && `<p><strong>Tracking URL:</strong> <a href="${order.logistics.trackingUrl}">${order.logistics.trackingUrl}</a></p>`,
    ].filter(Boolean).join('')
    : '';
  return [
    `<p>Hello ${order.customer.name},</p>`,
    `<p>Your order <strong>${order._id}</strong> status is now <strong>${order.status}</strong>.</p>`,
    logistics,
    order.statusReason ? `<p><strong>Reason:</strong> ${order.statusReason}</p>` : '',
    '<p>Thank you for shopping with VNUC.</p>',
  ].filter(Boolean).join('');
}

function money(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function itemLines(order) {
  return order.items.map(item => `${item.name} (${item.sku}) x ${item.quantity} - ${money(item.lineTotal, order.currency)}`);
}

function addressLines(address) {
  return [
    address?.line1,
    address?.line2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter(Boolean);
}

function orderCreatedSubject(order) {
  return `Thank you for your order ${order._id}`;
}

function orderCreatedText(order) {
  return [
    `Hello ${order.customer.name},`,
    '',
    'Thank you for your order. We have received it and will update you as the order moves ahead.',
    '',
    `Order ID: ${order._id}`,
    `Order Status: ${order.status}`,
    `Payment Method: ${order.paymentMethod.toUpperCase()}`,
    '',
    'Items:',
    ...itemLines(order).map(line => `- ${line}`),
    '',
    `Subtotal: ${money(order.subtotal, order.currency)}`,
    '',
    'Delivery Address:',
    ...addressLines(order.shippingAddress),
    '',
    'Thank you for shopping with VNUC.',
  ].join('\n');
}

function orderCreatedHtml(order) {
  const items = order.items.map(item => `<li>${item.name} (${item.sku}) x ${item.quantity} - ${money(item.lineTotal, order.currency)}</li>`).join('');
  const address = addressLines(order.shippingAddress).join('<br>');
  return [
    `<p>Hello ${order.customer.name},</p>`,
    '<p>Thank you for your order. We have received it and will update you as the order moves ahead.</p>',
    `<p><strong>Order ID:</strong> ${order._id}<br><strong>Order Status:</strong> ${order.status}<br><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>`,
    `<p><strong>Items:</strong></p><ul>${items}</ul>`,
    `<p><strong>Subtotal:</strong> ${money(order.subtotal, order.currency)}</p>`,
    `<p><strong>Delivery Address:</strong><br>${address}</p>`,
    '<p>Thank you for shopping with VNUC.</p>',
  ].join('');
}

async function sendOrderStatusEmail(order) {
  if (!order?.customer?.email) return { skipped: true, reason: 'missing-customer-email' };
  const message = {
    from: process.env.SMTP_FROM,
    to: order.customer.email,
    subject: statusSubject(order),
    text: statusText(order),
    html: statusHtml(order),
  };
  if (testSender) return testSender(message, order);
  const mailer = getTransporter();
  if (!mailer) return { skipped: true, reason: 'smtp-not-configured' };
  return mailer.sendMail(message);
}

async function sendOrderCreatedEmail(order) {
  if (!order?.customer?.email) return { skipped: true, reason: 'missing-customer-email' };
  const message = {
    from: process.env.SMTP_FROM,
    to: order.customer.email,
    subject: orderCreatedSubject(order),
    text: orderCreatedText(order),
    html: orderCreatedHtml(order),
  };
  if (testSender) return testSender(message, order);
  const mailer = getTransporter();
  if (!mailer) return { skipped: true, reason: 'smtp-not-configured' };
  return mailer.sendMail(message);
}

async function sendAdminOrderCreatedEmail(order) {
  const recipient = process.env.ADMIN_ORDER_EMAIL?.trim();
  if (!recipient) return { skipped: true, reason: 'admin-email-not-configured' };
  const message = {
    from: process.env.SMTP_FROM,
    to: recipient,
    subject: `New VNUC order ${order._id}`,
    text: [
      'A new order has been created.', '',
      `Order ID: ${order._id}`,
      `Order Status: ${order.status}`,
      `Payment Method: ${order.paymentMethod.toUpperCase()}`,
      `Payment Status: ${order.payment.status}`,
      '', `Customer: ${order.customer.name}`,
      `Email: ${order.customer.email}`, `Phone: ${order.customer.phone}`,
      '', 'Items:', ...itemLines(order).map(line => `- ${line}`),
      '', `Subtotal: ${money(order.subtotal, order.currency)}`,
      '', 'Delivery Address:', ...addressLines(order.shippingAddress),
    ].join('\n'),
  };
  if (testSender) return testSender(message, order);
  const mailer = getTransporter();
  if (!mailer) return { skipped: true, reason: 'smtp-not-configured' };
  return mailer.sendMail(message);
}

async function sendOrderTrackingOtp(email, otp) {
  const message = { from: process.env.SMTP_FROM, to: email,
    subject: 'Your VNUC order tracking OTP',
    text: `Your order tracking OTP is ${otp}. It expires in 5 minutes. Do not share this code.`,
  };
  if (testSender) return testSender(message);
  const mailer = getTransporter();
  if (!mailer) return { skipped: true };
  return mailer.sendMail(message);
}

function setTestSender(sender) {
  testSender = sender;
}

module.exports = { sendAdminOrderCreatedEmail, sendOrderTrackingOtp, sendOrderStatusEmail, sendOrderCreatedEmail, setTestSender };
