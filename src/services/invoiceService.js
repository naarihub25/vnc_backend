const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const { fail } = require('../utils/validation');

const approvedStatuses = ['approved', 'shipped', 'delivered', 'returned', 'cancelled'];

function money(value, currency) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

function line(doc, label, value, y) {
  doc.font('Helvetica-Bold').text(label, 40, y, { continued: true });
  doc.font('Helvetica').text(` ${value || '-'}`);
}

function addressText(address) {
  return [
    address?.line1,
    address?.line2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter(Boolean).join('\n');
}

async function getApprovedOrder(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail('Invalid order ID');
  const order = await Order.findById(id);
  if (!order) fail('Order not found', 404);
  if (!approvedStatuses.includes(order.status)) fail('Invoice is available only after order approval', 409);
  return order;
}

async function invoiceDetails(id) {
  const order = await getApprovedOrder(id);
  return {
    filename: `invoice-${String(order._id)}.pdf`,
    order,
  };
}

async function streamInvoice(id, writable) {
  const order = await getApprovedOrder(id);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(writable);

  doc.font('Helvetica-Bold').fontSize(20).text('VNUC Order Invoice', 40, 40);
  doc.font('Helvetica').fontSize(10).text('Printable copy for courier packing', 40, 66);
  doc.fontSize(10).text(`Invoice Date: ${new Date().toISOString().slice(0, 10)}`, 390, 42, { width: 160, align: 'right' });
  doc.text(`Order ID: ${order._id}`, 300, 58, { width: 250, align: 'right' });

  doc.moveTo(40, 92).lineTo(555, 92).stroke();
  line(doc, 'Status:', order.status, 108);
  line(doc, 'Payment:', `${order.paymentMethod.toUpperCase()} / ${order.payment?.status || 'pending'}`, 126);
  if (order.statusReason) line(doc, 'Reason:', order.statusReason, 144);

  doc.font('Helvetica-Bold').fontSize(12).text('Customer', 40, 178);
  doc.font('Helvetica').fontSize(10).text(`${order.customer.name}\n${order.customer.phone}\n${order.customer.email}`, 40, 198, { width: 220 });
  doc.font('Helvetica-Bold').fontSize(12).text('Ship To', 300, 178);
  doc.font('Helvetica').fontSize(10).text(addressText(order.shippingAddress), 300, 198, { width: 240 });

  doc.font('Helvetica-Bold').fontSize(12).text('Logistics', 40, 285);
  doc.font('Helvetica').fontSize(10).text([
    `Logistics ID: ${order.logistics?.logisticsId || '-'}`,
    `Logistics Name: ${order.logistics?.logisticsName || '-'}`,
    `Tracking URL: ${order.logistics?.trackingUrl || '-'}`,
    `Notes: ${order.logistics?.notes || '-'}`,
  ].join('\n'), 40, 305, { width: 500 });

  const tableTop = 400;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Product', 40, tableTop);
  doc.text('SKU', 250, tableTop);
  doc.text('Qty', 340, tableTop, { width: 40, align: 'right' });
  doc.text('Unit', 390, tableTop, { width: 70, align: 'right' });
  doc.text('Total', 475, tableTop, { width: 80, align: 'right' });
  doc.moveTo(40, tableTop + 16).lineTo(555, tableTop + 16).stroke();

  let y = tableTop + 28;
  doc.font('Helvetica').fontSize(9);
  for (const item of order.items) {
    if (y > 730) {
      doc.addPage();
      y = 50;
    }
    doc.text(item.name, 40, y, { width: 200 });
    doc.text(item.sku, 250, y, { width: 80 });
    doc.text(String(item.quantity), 340, y, { width: 40, align: 'right' });
    doc.text(money(item.unitPrice, order.currency), 390, y, { width: 70, align: 'right' });
    doc.text(money(item.lineTotal, order.currency), 475, y, { width: 80, align: 'right' });
    y += Math.max(22, doc.heightOfString(item.name, { width: 200 }) + 8);
  }

  doc.moveTo(360, y + 8).lineTo(555, y + 8).stroke();
  doc.font('Helvetica-Bold').fontSize(11).text('Subtotal', 390, y + 20, { width: 70, align: 'right' });
  doc.text(money(order.subtotal, order.currency), 475, y + 20, { width: 80, align: 'right' });
  doc.font('Helvetica').fontSize(9).text('Use this PDF as the printable admin copy for packing and courier handoff.', 40, 790, { width: 500 });

  doc.end();
}

module.exports = { invoiceDetails, streamInvoice };
