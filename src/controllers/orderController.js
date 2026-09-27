const service = require('../services/orderService');
const invoiceService = require('../services/invoiceService');
async function create(req, res) { res.status(201).json(await service.create(req.body)); }
async function list(req, res) { res.json(await service.list(req.query)); }
async function get(req, res) { res.json(await service.get(req.params.id)); }
async function updateStatus(req, res) { res.json(await service.updateStatus(req.params.id, req.body)); }
async function downloadInvoice(req, res) {
  const { filename } = await invoiceService.invoiceDetails(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await invoiceService.streamInvoice(req.params.id, res);
}
module.exports = { create, list, get, updateStatus, downloadInvoice };
