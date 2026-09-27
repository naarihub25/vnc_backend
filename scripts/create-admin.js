require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const connectDB = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { validateFields } = require('../src/utils/validation');
(async () => {
  const body = { name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
  validateFields(body, true);
  await connectDB();
  await User.init();
  await User.create({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: 'admin' });
  console.log('Admin created. Sign in with POST /api/admin/login.');
})().catch(error => {
  console.error(error.code === 11000 ? 'That email already exists; no account was changed.' : 'Admin creation failed. Check ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD and database connectivity.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
