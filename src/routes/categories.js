const router = require('express').Router();
const controller = require('../controllers/categoryController');
const multer = require('multer');
const { allowedImageTypes } = require('../services/categoryImageService');
const receiveImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, callback) {
    callback(allowedImageTypes.has(file.mimetype) ? null : new Error('Unsupported image type'), allowedImageTypes.has(file.mimetype));
  },
}).single('file');
router.post('/image-upload-url', (req, res, next) => {
  receiveImage(req, res, error => {
    if (error) return res.status(400).json({ error: 'Send one PNG, JPEG, WebP or GIF image up to 5 MB in the file field.' });
    next();
  });
}, controller.imageUploadUrl);
router.all('/image-upload-url', (req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed.' }));
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
