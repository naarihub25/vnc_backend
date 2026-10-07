const router = require('express').Router();
const controller = require('../controllers/orderController');
const tracking = require('../services/orderTrackingService');
const { rateLimit } = require('express-rate-limit');
const trackingLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many order tracking attempts. Please try again later.' } });
function trackingHandler(action) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await action(req.body)); }
    catch (error) {
      if (error.status === 503) return res.status(503).json({ error: error.message });
      next(error);
    }
  };
}
router.post('/tracking/request-otp', trackingLimit, trackingHandler(tracking.requestOtp));
router.post('/by-email', trackingLimit, trackingHandler(tracking.ordersByEmail));
router.post('/',  controller.create);
router.get('/', controller.list);
router.patch('/:id/status', controller.updateStatus);
router.get('/:id/invoice', controller.downloadInvoice);
router.get('/:id', controller.get);
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 50) return res.status(503).json({ error: 'Order query timed out. Narrow the filters and retry.' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid checkout data' });
  next(err);
});
module.exports = router;
