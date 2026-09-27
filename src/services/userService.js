const mongoose = require('mongoose');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { fail, validateBody, validateFields } = require('../utils/validation');
const { validateAddress } = require('../utils/checkoutValidation');

async function createUser(body, admin = false) {
  validateBody(body, admin ? ['name', 'phone', 'email', 'password', 'role', 'isActive'] : ['name', 'phone', 'email', 'password', 'role']);
  validateFields(body, true);
  if (!admin && body.role === 'admin') fail('Admin registration is not allowed', 403);
  return User.create({ name: body.name, phone: body.phone, email: body.email, role: body.role || 'retailUser',
    isActive: admin ? body.isActive : true, passwordHash: await hashPassword(body.password) });
}

async function listUsers(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('Invalid pagination');
  const [users, total] = await Promise.all([User.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments()]);
  return { users, total, page, limit };
}

async function getUser(userId) {
  if (!mongoose.isObjectIdOrHexString(userId)) fail('Invalid user ID');
  const user = await User.findById(userId);
  if (!user) fail('User not found', 404);
  return user;
}

async function updateUser(userId, body) {
  const user = await getUser(userId);
  validateBody(body, ['name', 'phone', 'email', 'password', 'role', 'isActive', 'address']);
  if (body.address !== undefined) validateAddress(body.address);
  if (!Object.keys(body).length) fail('No updates supplied');
  validateFields(body);
  for (const key of ['name', 'phone', 'email', 'role', 'isActive', 'address']) if (body[key] !== undefined) user[key] = body[key];
  if (body.password !== undefined) user.passwordHash = await hashPassword(body.password);
  await user.save();
  return user;
}

async function deleteUser(userId) {
  const user = await getUser(userId);
  await User.deleteOne({ _id: user._id });
}

module.exports = { createUser, listUsers, getUser, updateUser, deleteUser };
