const imageUploadService = require('./imageUploadService');

function prepareUpload(body) { return imageUploadService.prepareUpload(body, 'products'); }

module.exports = { prepareUpload };
