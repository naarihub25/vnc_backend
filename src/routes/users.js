const express = require('express');
const { rateLimit } = require('express-rate-limit');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const router = express.Router();
const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    ...(res.locals.isLogin ? { flag: false, data: null } : {}),
    error: 'Too many authentication attempts. Try again later.',
  }) });

router.post('/auth/register', limit, authController.register);
router.post('/auth/login', limit, authController.login);
router.post('/admin/login', limit, authController.adminLogin);
router.post('/users', userController.create);
router.post('/users/guest', limit, require('../controllers/guestController').create);
router.get('/users', userController.list);
router.get('/users/:id', userController.get);
router.patch('/users/:id', userController.update);
router.delete('/users/:id', userController.remove);

module.exports = router;
