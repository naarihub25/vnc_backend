require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
require('./models/User');
require('./models/Product');

async function start() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }
  await connectDB();
  await mongoose.model('User').init();
  await mongoose.model('Category').init();
  await mongoose.model('Product').init();
  await mongoose.model('Banner').init();
  await mongoose.model('Order').init();
  await mongoose.model('OrderTrackingOtp').init();
  console.log('MongoDB connected');
  const server = app.listen(port, () => console.log(`API listening on port ${port}`));
  server.on('error', () => {
    console.error('HTTP server failed to start');
    process.exit(1);
  });

  function shutdown() {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timeout);
      process.exit(0);
    });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function redactError(value) {
  let message = String(value || 'Unknown startup error');
  // Connection errors may include a URI containing database credentials.
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[REDACTED_MONGODB_URI]');
  for (const secret of [process.env.MONGODB_URI]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message;
}

start().catch((error) => {
  console.error(`Startup failed: ${redactError(error.message)}`);
  // Mongoose's generic selection error hides the useful per-server cause.
  if (error.reason?.servers) {
    for (const [host, server] of error.reason.servers) {
      if (server.error) {
        console.error(`MongoDB server ${host}: ${redactError(server.error.message)}`);
        if (server.error.cause) {
          console.error(`Cause: ${redactError(server.error.cause.message)}`);
        }
      }
    }
  }
  if (error.code === 8000 || error.code === 18) {
    console.error('Check the MongoDB username, password, and authSource in MONGODB_URI. URL-encode special characters in credentials.');
  }
  process.exit(1);
});
