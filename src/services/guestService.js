const User = require('../models/User');
const { fail, validateBody, validateFields } = require('../utils/validation');
const { validPhone, validateAddress } = require('../utils/checkoutValidation');
async function create(body) {
  validateBody(body, ['name', 'email', 'phone', 'address']);
  for (const key of ['name', 'email', 'phone', 'address']) if (body[key] === undefined) fail(`${key} is required`);
  validateFields({ name: body.name, email: body.email, phone: body.phone });
  if (!validPhone(body.phone)) fail('A valid phone number with 7–15 digits is required');
  validateAddress(body.address);
  // Never overwrite or convert an existing account merely because its email matches.
  const user = await User.create({ name: body.name, email: body.email, phone: body.phone, address: body.address, role: 'guestUser', isActive: true });
  return { flag: true, data: user };
}
module.exports = { create };
