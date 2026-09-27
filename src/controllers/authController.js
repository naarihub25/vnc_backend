const authService = require('../services/authService');

async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}
async function login(req, res) {
  res.json(await authService.login(req.body));
}
async function adminLogin(req, res) {
  res.json(await authService.login(req.body, true));
}
module.exports = { register, login, adminLogin };
