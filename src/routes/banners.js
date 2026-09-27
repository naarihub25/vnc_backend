const router = require('express').Router();
const controller = require('../controllers/bannerController');
router.get('/positions', controller.positions);
router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid banner data' });
  if (err.name === 'VersionError') return res.status(409).json({ error: 'Banner changed. Reload and retry.' });
  next(err);
});
module.exports = router;
