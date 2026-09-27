const router = require('express').Router();
const controller = require('../controllers/orderController');
router.post('/', controller.create);
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
