const User = require('../models/User');
const userService = require('./userService');
const { verifyPassword } = require('../utils/password');
const { fail, validateBody } = require('../utils/validation');

async function register(body) {
  return { user: await userService.createUser(body) };
}

async function login(body, admin = false) {
  validateBody(body, ['email', 'password']);
  const { email, password } = body;
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || !password || password.length > 128) fail('Email and password are required');
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  // Perform the same expensive password check for unknown accounts.
  const dummy = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
  const valid = await verifyPassword(password, user?.passwordHash || dummy);
  if (!valid || user?.isActive !== true || (admin ? user.role !== 'admin' : !['retailUser', 'wholesaleUser'].includes(user.role))) {
    fail('Invalid email or password', 401);
  }
  return { flag: true, data: user };
}

module.exports = { register, login };
