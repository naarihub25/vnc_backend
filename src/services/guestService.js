const User = require('../models/User');
const { fail, validateBody, validateFields } = require('../utils/validation');
const { validPhone, validateAddress } = require('../utils/checkoutValidation');
async function create(body) {
  validateBody(body, ['name', 'email', 'phone', 'address']);
  for (const key of ['name', 'email', 'phone', 'address']) if (body[key] === undefined) fail(`${key} is required`);
  validateFields({ name: body.name, email: body.email, phone: body.phone });
  if (!validPhone(body.phone)) fail('A valid phone number with 7–15 digits is required');
  validateAddress(body.address);
  const email = body.email.trim().toLowerCase();
  async function reuse(user) {
    if (user.role !== 'guestUser') fail('Email belongs to a registered account', 409);
    if (!user.isActive) fail('Guest account is inactive', 403);
    user.name = body.name;
    user.phone = body.phone;
    user.address = body.address;
    await user.save();
    return user;
  }
  let user = await User.findOne({ email }).select('-passwordHash');
  if (user) user = await reuse(user);
  else {
    try {
      user = await User.create({ name: body.name, email, phone: body.phone, address: body.address, role: 'guestUser', isActive: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Another checkout may have created the same email after our lookup.
      user = await User.findOne({ email }).select('-passwordHash');
      if (!user) throw error;
      user = await reuse(user);
    }
  }
  return { flag: true, data: user };
}
module.exports = { create };
