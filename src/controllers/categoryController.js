const imageService = require('../services/categoryImageService');
const service = require('../services/categoryService');
async function create(req, res) { res.status(201).json({ category: await service.create(req.body) }); }
async function list(req, res) { res.json(await service.list(req.query)); }
async function get(req, res) { res.json({ category: await service.get(req.params.id) }); }
async function update(req, res) { res.json({ category: await service.update(req.params.id, req.body) }); }
async function remove(req, res) { await service.remove(req.params.id); res.status(204).end(); }
async function subcategories(req, res) { res.json(await service.subcategories(req.params.id, req.query)); }
async function parents(req, res) { res.json({ categories: await service.parents() }); }
async function imageUploadUrl(req, res, next) {
  try { res.json(await imageService.upload(req.file)); }
  catch (error) {
    if ([400, 500, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}
module.exports = { imageUploadUrl, create, list, get, update, remove, subcategories, parents };
