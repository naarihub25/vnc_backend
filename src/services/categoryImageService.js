const { randomUUID } = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { fail } = require('../utils/validation');

const allowedImageTypes = new Map([
  ['image/gif', 'gif'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
]);

async function upload(file) {
  const extension = allowedImageTypes.get(file?.mimetype);
  if (!extension || !Buffer.isBuffer(file?.buffer) || file.buffer.length === 0 || file.buffer.length > 5 * 1024 * 1024) {
    fail('Choose a PNG, JPEG, WebP or GIF image up to 5 MB.');
  }
  const bucket = process.env.S3_IMAGE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) fail('Image uploads are not configured.', 503);
  const key = `categories/${randomUUID()}.${extension}`;
  const client = new S3Client({ region });
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, ContentType: file.mimetype,
      ContentLength: file.buffer.length, Body: file.buffer,
    }));
    const baseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '') || `https://${bucket}.s3.${region}.amazonaws.com`;
    return { imageUrl: `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}` };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Unknown AWS upload error');
    console.error('Unable to upload category image:', error.name, error.message);
    if (error.name === 'CredentialsProviderError') fail('AWS credentials are not available to the backend server.', 503);
    fail('Unable to upload the image.', error, 500);
  } finally {
    client.destroy();
  }
}

module.exports = { upload, allowedImageTypes };
