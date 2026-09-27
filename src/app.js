const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.locals.isLogin = req.method === 'POST' && /^\/api\/(auth|admin)\/login\/?$/i.test(req.path);
  next();
});
app.use('/api/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api-docs/openapi.json', (req, res) => res.json(openapi));
app.use('/api-docs', helmet.contentSecurityPolicy({ directives: {
  // Allow local HTTP documentation in development, including Safari.
  'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
} }), swaggerUi.serve, swaggerUi.setup(null, {
  customSiteTitle: 'VNUC API documentation',
  swaggerOptions: { url: '/api-docs/openapi.json', validatorUrl: null },
}));

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
  });
});

app.get('/api/admin/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments/razorpay', require('./routes/razorpay'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid user data' });
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    ...(res.locals.isLogin ? { flag: false, data: null } : {}),
    error: status === 500 ? 'Internal server error' : err.type === 'entity.parse.failed' ? 'Invalid request' : err.message,
  });
});

module.exports = app;
