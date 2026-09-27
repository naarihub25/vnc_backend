const router = require('express').Router();
const controller = require('../controllers/productController');
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/search', controller.search);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 50) return res.status(503).json({ error: 'Search timed out. Try a more specific search.' });
  if (err.code === 11000) return res.status(409).json({ error: 'Product SKU or slug already exists' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: 'Invalid product data', details: Object.values(err.errors).map(error => error.message) });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid product data' });
  if (err.name === 'VersionError') return res.status(409).json({ error: 'Product changed. Reload and retry.' });
  next(err);
});
module.exports = router;
