const checkout = require('./checkout');
const banners = require('./banners');
const products = require('./products');
const categories = require('./categories');
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const errors = {
  400: response('Invalid request', ref('Error')),
  401: response('Invalid credentials', ref('Error')),
  404: response('User not found', ref('Error')),
  409: response('Email already registered', ref('Error')),
  429: response('Too many authentication attempts', ref('Error')),
  500: response('Internal server error', ref('Error')),
};
const fields = {
  phone: { type: 'string', maxLength: 30, default: '', example: '+91 9876543210', description: 'Optional. Send an empty string to clear it.' },
  name: { type: 'string', minLength: 1, maxLength: 100, example: 'Example Customer' },
  email: { type: 'string', format: 'email', maxLength: 254, example: 'customer@example.com' },
  password: { type: 'string', format: 'password', minLength: 12, maxLength: 128, writeOnly: true, example: 'example-password-123' },
  role: { type: 'string', enum: ['admin', 'retailUser', 'wholesaleUser'], default: 'retailUser' },
  isActive: { type: 'boolean', default: true },
};
function operation(summary, tag, { body, result = 'UserResponse', status = 200, public: isPublic = false, description, parameters } = {}) {
  return { summary, tags: [tag], ...(description ? { description } : {}), ...(isPublic ? { security: [] } : {}),
    ...(parameters ? { parameters } : {}),
    ...(body ? { requestBody: { required: true, content: json(ref(body)) } } : {}),
    responses: { ...Object.fromEntries(Object.entries(errors).map(([code, value]) => [code, body === 'Login' ? response(value.description, ref('LoginError')) : value])), [status]: response(status === 204 ? 'Success (no response body)' : 'Success', status === 204 ? undefined : ref(result)) },
  };
}
const updateDescription = 'Edit name, phone, email, password, role, or isActive for any user. No authentication or current password is required.';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'VNUC API', version: '1.0.0', description: 'All APIs are public. Login verifies credentials and returns a user without creating a session. Registration and login share a limit of 20 requests per IP per 15 minutes.' },
  servers: [{ url: '/', description: 'Current API server' }],
  security: [],
  tags: [{ name: 'Guest checkout' }, { name: 'Orders' }, { name: 'Banners' }, { name: 'Products' }, { name: 'Categories' }, { name: 'Authentication' }, { name: 'Users' }, { name: 'Health' }],
  components: {
    schemas: {
      ...categories.schemas,
      ...products.schemas,
      ...banners.schemas,
      ...checkout.schemas,
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      User: { type: 'object', properties: { _id: { type: 'string', example: '507f1f77bcf86cd799439011' }, name: fields.name, phone: fields.phone, email: fields.email, role: { ...fields.role, enum: ['admin', 'retailUser', 'wholesaleUser', 'guestUser'] }, address: ref('Address'), isActive: fields.isActive, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
      LoginResponse: { type: 'object', required: ['flag', 'data'], properties: { flag: { type: 'boolean', enum: [true] }, data: ref('User') } },
      LoginError: { type: 'object', required: ['flag', 'data', 'error'], properties: { flag: { type: 'boolean', enum: [false] }, data: { type: 'object', nullable: true, example: null }, error: { type: 'string', example: 'Invalid email or password' } } },
      UserResponse: { type: 'object', properties: { user: ref('User') } },
      Register: { type: 'object', additionalProperties: false, required: ['name', 'email', 'password'], properties: { name: fields.name, phone: fields.phone, email: fields.email, password: fields.password, role: { ...fields.role, enum: ['retailUser', 'wholesaleUser'] } } },
      CreateUser: { type: 'object', additionalProperties: false, required: ['name', 'email', 'password'], properties: fields },
      Login: { type: 'object', additionalProperties: false, required: ['email', 'password'], properties: { email: fields.email, password: { type: 'string', format: 'password', minLength: 1, maxLength: 128, example: 'example-password-123' } } },
      UpdateUser: { type: 'object', additionalProperties: false, minProperties: 1, properties: { ...fields, address: ref('Address') }, example: { name: 'Updated Customer' } },
      UserList: { type: 'object', properties: { users: { type: 'array', items: ref('User') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } },
      Health: { type: 'object', properties: { status: { type: 'string', enum: ['ok', 'unavailable'] }, database: { type: 'string', enum: ['connected', 'disconnected'] } } },
      AdminHealth: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
    },
  },
  paths: {
    ...categories.paths,
    ...products.paths,
    ...banners.paths,
    ...checkout.paths,
    '/api/auth/register': { post: operation('Register retail or wholesale user', 'Authentication', { public: true, body: 'Register', result: 'UserResponse', status: 201 }) },
    '/api/auth/login': { post: operation('Website user login', 'Authentication', { public: true, body: 'Login', result: 'LoginResponse', description: 'Only active users can log in. Inactive users or invalid credentials return HTTP 401 with flag false and data null.' }) },
    '/api/admin/login': { post: operation('Admin login', 'Authentication', { public: true, body: 'Login', result: 'LoginResponse', description: 'Only active users can log in. Inactive users or invalid credentials return HTTP 401 with flag false and data null.' }) },
    '/api/users': {
      post: operation('Create a user', 'Users', { body: 'CreateUser', status: 201 }),
      get: operation('List users', 'Users', { result: 'UserList', parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ] }),
    },
    '/api/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }, example: '507f1f77bcf86cd799439011' }],
      get: operation('Get user', 'Users'),
      patch: operation('Edit user', 'Users', { body: 'UpdateUser', description: updateDescription }),
      delete: operation('Permanently delete user', 'Users', { status: 204, description: 'Permanently removes the user record.' }),
    },
    '/api/health': { get: { ...operation('Database readiness', 'Health', { public: true, result: 'Health' }), responses: { 200: response('Database connected', ref('Health')), 503: response('Database disconnected', ref('Health')) } } },
    '/api/admin/health': { get: operation('Admin health', 'Health', { result: 'AdminHealth' }) },
  },
};
