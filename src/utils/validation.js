function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function validateBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('A JSON object is required');
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('Unsupported fields in request');
}
function validateFields(body, creating = false) {
  if (body.phone !== undefined && (typeof body.phone !== 'string' || body.phone.trim().length > 30)) {
    fail('Phone must be a string of at most 30 characters');
  }
  if (creating || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) fail('Name must contain 1–100 characters');
  }
  if (creating || body.email !== undefined) {
    if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) fail('Enter a valid email address');
  }
  if (creating || body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) fail('Password must contain 12–128 characters');
  }
  if (body.role !== undefined && !['admin', 'retailUser', 'wholesaleUser'].includes(body.role)) fail('Invalid role');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') fail('isActive must be a boolean');
}
module.exports = { fail, validateBody, validateFields };
