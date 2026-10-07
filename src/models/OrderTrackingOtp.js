const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  digest: { type: String, required: true },
  salt: { type: String, required: true },
  attempts: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  sentAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('OrderTrackingOtp', schema);
