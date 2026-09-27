const userService = require('../services/userService');

async function create(req, res) {
  res.status(201).json({ user: await userService.createUser(req.body, true) });
}
async function list(req, res) {
  res.json(await userService.listUsers(req.query));
}
async function get(req, res) {
  res.json({ user: await userService.getUser(req.params.id) });
}
async function update(req, res) {
  res.json({ user: await userService.updateUser(req.params.id, req.body) });
}
async function remove(req, res) {
  await userService.deleteUser(req.params.id);
  res.status(204).end();
}
module.exports = { create, list, get, update, remove };
