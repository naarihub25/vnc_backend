const { randomUUID } = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { allowedImageTypes } = require('./categoryImageService');
const { fail } = require('../utils/validation');

async function upload(files, prefix) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) fail('Send between 1 and 5 images in the files field.');
  // Validate the entire batch before sending any file to S3.
  for (const file of files) {
    if (!allowedImageTypes.has(file.mimetype) || !Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > 5 * 1024 * 1024) {
      fail('Choose PNG, JPEG, WebP or GIF images up to 5 MB each.');
    }
  }
  const bucket = process.env.S3_IMAGE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) fail('Image uploads are not configured.', 503);
  const baseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '') || `https://${bucket}.s3.${region}.amazonaws.com`;
  const client = new S3Client({ region });
  const images = [];
  try {
    for (const file of files) {
      const key = `${prefix}/${randomUUID()}.${allowedImageTypes.get(file.mimetype)}`;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key,
        ContentType: file.mimetype, ContentLength: file.buffer.length, Body: file.buffer }));
      images.push({ url: `${baseUrl}/${key}`, alt: '' });
    }
    return { images };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Unknown AWS upload error');
    console.error(`Unable to upload ${prefix} images:`, error.name, error.message);
    if (error.name === 'CredentialsProviderError') fail('AWS credentials are not available to the backend server.', 503);
    fail(`Unable to upload the ${prefix === 'products' ? 'product' : 'banner'} images.`, 500);
  } finally {
    client.destroy();
  }
}

module.exports = { upload };
