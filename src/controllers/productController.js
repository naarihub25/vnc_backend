const imageService = require('../services/productImageService');
const service = require('../services/productService');
const searchService = require('../services/productSearchService');
async function create(req, res) { res.status(201).json({ product: await service.create(req.body) }); }
async function list(req, res) { res.json(await service.list(req.query)); }
async function get(req, res) { res.json({ product: await service.get(req.params.id) }); }
async function update(req, res) { res.json({ product: await service.update(req.params.id, req.body) }); }
async function remove(req, res) { await service.remove(req.params.id); res.status(204).end(); }
async function search(req, res) { res.json(await searchService.search(req.query)); }
async function imageUploadUrl(req, res, next) {
  try { res.json(await imageService.upload(req.files)); }
  catch (error) {
    if ([400, 500, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}
module.exports = { imageUploadUrl, create, list, get, update, remove, search };
