const service = require('./multipleImageService');
function upload(files) { return service.upload(files, 'banners'); }
module.exports = { upload };
