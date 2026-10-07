const router = require('express').Router();
const controller = require('../controllers/productController');
const multer = require('multer');
const { allowedImageTypes } = require('../services/categoryImageService');
const receiveImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 0, parts: 6 },
  fileFilter(req, file, callback) {
    callback(allowedImageTypes.has(file.mimetype) ? null : new Error('Unsupported image type'), allowedImageTypes.has(file.mimetype));
  },
}).array('files', 5);
router.post('/image-upload-url', (req, res, next) => {
  receiveImages(req, res, error => {
    if (error) return res.status(400).json({ error: 'Send 1–5 PNG, JPEG, WebP or GIF images up to 5 MB each in the files field.' });
    next();
  });
}, controller.imageUploadUrl);
router.all('/image-upload-url', (req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed.' }));
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
