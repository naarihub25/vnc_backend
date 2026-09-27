const service = require('../services/razorpayService');

async function createOrder(req, res) {
  res.status(201).json(await service.createRazorpayOrder(req.body));
}

async function verifyPayment(req, res) {
  res.json(await service.verifyPayment(req.body));
}

async function webhook(req, res) {
  res.json(await service.handleWebhook(req.body, req.get('x-razorpay-signature')));
}

module.exports = { createOrder, verifyPayment, webhook };
