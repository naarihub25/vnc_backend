const service = require('../services/guestService');
async function create(req, res) { res.status(201).json(await service.create(req.body)); }
module.exports = { create };
