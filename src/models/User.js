const mongoose = require('mongoose');
const addressSchema = require('./shared/address');
const { validPhone } = require('../utils/checkoutValidation');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30, default: '', required() { return this.role === 'guestUser'; },
      validate: { validator(value) { return this.role !== 'guestUser' || validPhone(value); }, message: 'Guest phone must contain 7–15 digits' } },
    address: { type: addressSchema, required() { return this.role === 'guestUser'; } },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    isActive: { type: Boolean, default: true },
    role: { type: String, enum: ['admin', 'retailUser', 'wholesaleUser', 'guestUser'], default: 'retailUser', required: true },
    passwordHash: { type: String, required() { return this.role !== 'guestUser'; }, select: false },
  },
  { timestamps: true },
);

userSchema.set('toJSON', { transform(doc, result) {
  delete result.passwordHash;
  delete result.tokenVersion;
  delete result.__v;
  return result;
} });

module.exports = mongoose.model('User', userSchema);
