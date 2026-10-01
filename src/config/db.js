const mongoose = require('mongoose');

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vnuc', {
    dbName: process.env.MONGODB_DB || 'vnuc',
    serverSelectionTimeoutMS: 10000,
  });
}

module.exports = connectDB;
