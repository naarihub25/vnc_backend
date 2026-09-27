const router = require('express').Router();
const controller = require('../controllers/razorpayController');

router.post('/orders', controller.createOrder);
router.post('/verify', controller.verifyPayment);
router.post('/webhook', controller.webhook);

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'SyntaxError') return res.status(400).json({ error: 'Invalid Razorpay webhook payload' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid Razorpay payment data' });
  next(err);
});

module.exports = router;
