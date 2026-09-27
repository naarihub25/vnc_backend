const router = require('express').Router();
const controller = require('../controllers/categoryController');
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/parents', controller.parents);
router.get('/:id/subcategories', controller.subcategories);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
// Keep category-specific database errors separate from user errors.
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 11000) return res.status(409).json({ error: 'Category slug already exists' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid category data' });
  next(err);
});
module.exports = router;
