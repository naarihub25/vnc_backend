const { fail, validateBody } = require('./validation');
function validPhone(phone) {
  return typeof phone === 'string' && /^[+\d\s().-]+$/.test(phone) && /^\d{7,15}$/.test(phone.replace(/\D/g, ''));
}
function validateAddress(address) {
  validateBody(address, ['line1', 'line2', 'city', 'state', 'postalCode', 'country']);
  for (const [key, max] of [['line1', 200], ['city', 100], ['state', 100], ['postalCode', 20], ['country', 2]]) {
    if (typeof address[key] !== 'string' || !address[key].trim() || address[key].trim().length > max) fail(`Address ${key} is required and must be at most ${max} characters`);
  }
  if (!/^[a-zA-Z]{2}$/.test(address.country.trim())) fail('Country must be a two-letter code, for example IN');
  if (address.line2 !== undefined && (typeof address.line2 !== 'string' || address.line2.trim().length > 200)) fail('Invalid address line2');
}
module.exports = { validPhone, validateAddress };
