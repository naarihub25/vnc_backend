const { test } = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');
const Otp = require('../src/models/OrderTrackingOtp');
const emailService = require('../src/services/emailService');
const service = require('../src/services/orderTrackingService');

test('tracking OTP existence, delivery, verification, limits and email scoping', async t => {
  const previous = [process.env.NODE_ENV, process.env.ORDER_TRACKING_DEV_OTP];
  process.env.NODE_ENV = 'development'; process.env.ORDER_TRACKING_DEV_OTP = 'true';
  t.after(() => ['NODE_ENV', 'ORDER_TRACKING_DEV_OTP'].forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  let record, exists = true, sent, mailFails = false;
  t.mock.method(Order, 'exists', async () => exists);
  t.mock.method(emailService, 'sendOrderTrackingOtp', async (email, otp) => { if (mailFails) throw new Error('SMTP failed'); sent = { email, otp }; return {}; });
  t.mock.method(Otp, 'findOneAndUpdate', async (filter, update) => {
    if (update.$set) {
      if (record && record.sentAt > filter.sentAt.$lte) throw Object.assign(new Error(), { code: 11000 });
      record = { _id: 'challenge', ...update.$set }; return record;
    }
    if (!record || record.attempts <= 0 || record.expiresAt <= new Date()) return null;
    record.attempts--; return { ...record };
  });
  t.mock.method(Otp, 'deleteOne', async filter => { const deletedCount = Number(Boolean(record && record.digest === filter.digest)); if (deletedCount) record = null; return { deletedCount }; });
  const expected = [{ _id: 'order', status: 'shipped' }];
  t.mock.method(Order, 'find', filter => {
    assert.equal(filter['customer.email'].$regex, '^person@example\\.com$');
    return { sort: () => ({ skip: () => ({ limit: () => ({ maxTimeMS: async () => expected }) }) }) };
  });
  t.mock.method(Order, 'countDocuments', () => ({ maxTimeMS: async () => 1 }));
  exists = false;
  await assert.rejects(service.requestOtp({ email: 'person@example.com' }), { status: 404 });
  assert.equal(sent, undefined);
  exists = true;
  const response = await service.requestOtp({ email: ' PERSON@example.com ' });
  assert.match(response.otp, /^\d{4}$/);
  assert.equal(sent.email, 'person@example.com'); assert.equal(sent.otp, response.otp);
  assert.notEqual(record.digest, response.otp);
  await assert.rejects(service.requestOtp({ email: sent.email }), { status: 429 });
  const wrong = response.otp === '0000' ? '0001' : '0000';
  await assert.rejects(service.ordersByEmail({ email: sent.email, otp: wrong }), { status: 401 });
  assert.equal((await service.ordersByEmail({ email: sent.email, otp: response.otp })).orders, expected);
  await assert.rejects(service.ordersByEmail({ email: sent.email, otp: response.otp }), { status: 401 });
  await service.requestOtp({ email: sent.email }); record.expiresAt = new Date(0);
  await assert.rejects(service.ordersByEmail({ email: sent.email, otp: sent.otp }), { status: 401 });
  record = null;
  await service.requestOtp({ email: sent.email });
  const incorrect = sent.otp === '0000' ? '0001' : '0000';
  for (let i = 0; i < 5; i++) await assert.rejects(service.ordersByEmail({ email: sent.email, otp: incorrect }), { status: 401 });
  await assert.rejects(service.ordersByEmail({ email: sent.email, otp: sent.otp }), { status: 401 });
  record = null; process.env.NODE_ENV = 'production';
  assert.match((await service.requestOtp({ email: sent.email })).otp, /^[0-9]{4}$/);
  record = null; process.env.ORDER_TRACKING_DEV_OTP = 'false';
  assert.equal((await service.requestOtp({ email: sent.email })).otp, undefined);
  record = null; mailFails = true;
  await assert.rejects(service.requestOtp({ email: sent.email }), { status: 503 });
  assert.equal(record, null);
});
