const { randomInt, randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const Order = require('../models/Order');
const Otp = require('../models/OrderTrackingOtp');
const emailService = require('./emailService');
const { fail, validateBody } = require('../utils/validation');

function emailValue(value) {
  if (typeof value !== 'string' || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) fail('Enter a valid email address');
  return value.trim().toLowerCase();
}
function digest(salt, otp) { return createHash('sha256').update(`${salt}:${otp}`).digest('hex'); }
function filter(email) {
  return { 'customer.email': { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
}
async function requestOtp(body) {
  validateBody(body, ['email']);
  const email = emailValue(body.email);
  if (!await Order.exists(filter(email))) fail('No orders found for this email', 404);
  const now = new Date();
  const otp = String(randomInt(0, 10000)).padStart(4, '0');
  const salt = randomBytes(32).toString('hex');
  const values = { email, digest: digest(salt, otp), salt, attempts: 5, sentAt: now, expiresAt: new Date(now.getTime() + 300000) };
  try {
    // Unique email index makes concurrent resend requests obey the cooldown.
    await Otp.findOneAndUpdate({ email, sentAt: { $lte: new Date(now.getTime() - 60000) } }, { $set: values }, { upsert: true, new: true });
  } catch (error) {
    if (error.code === 11000) fail('Wait 60 seconds before requesting another OTP', 429);
    throw error;
  }
  const expose = process.env.ORDER_TRACKING_DEV_OTP === 'true';
  try {
    const result = await emailService.sendOrderTrackingOtp(email, otp);
    if (result?.skipped && !expose) throw new Error('SMTP unavailable');
  } catch {
    await Otp.deleteOne({ email, digest: values.digest });
    fail('Unable to send OTP email. Please try again later.', 503);
  }
  return { message: 'OTP generated. Check your email.', expiresIn: 300, ...(expose ? { otp } : {}) };
}
async function ordersByEmail(body) {
  validateBody(body, ['email', 'otp', 'page', 'limit']);
  const email = emailValue(body.email);
  if (typeof body.otp !== 'string' || !/^[0-9]{4}$/.test(body.otp)) fail('OTP must be a four-digit string');
  const page = body.page ?? 1, limit = body.limit ?? 20;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const challenge = await Otp.findOneAndUpdate({ email, expiresAt: { $gt: new Date() }, attempts: { $gt: 0 } }, { $inc: { attempts: -1 } }, { new: true });
  if (!challenge || !timingSafeEqual(Buffer.from(challenge.digest, 'hex'), Buffer.from(digest(challenge.salt, body.otp), 'hex'))) fail('Invalid or expired OTP', 401);
  const consumed = await Otp.deleteOne({ _id: challenge._id, digest: challenge.digest });
  if (!consumed.deletedCount) fail('Invalid or expired OTP', 401);
  const match = filter(email);
  const [orders, total] = await Promise.all([
    Order.find(match).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(5000),
    Order.countDocuments(match).maxTimeMS(5000),
  ]);
  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
}
module.exports = { requestOtp, ordersByEmail };
