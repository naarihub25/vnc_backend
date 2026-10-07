const imageService = require('../services/bannerImageService');
const service = require('../services/bannerService');
async function create(req, res) { res.status(201).json({ banner: await service.create(req.body) }); }
async function list(req, res) { res.json(await service.list(req.query)); }
async function get(req, res) { res.json({ banner: await service.get(req.params.id) }); }
async function update(req, res) { res.json({ banner: await service.update(req.params.id, req.body) }); }
async function remove(req, res) { await service.remove(req.params.id); res.status(204).end(); }
function positions(req, res) { res.json({ positions: service.positions() }); }
async function imageUploadUrl(req, res, next) {
  try { res.json(await imageService.upload(req.files)); }
  catch (error) {
    if ([400, 500, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}
module.exports = { imageUploadUrl, create, list, get, update, remove, positions };
