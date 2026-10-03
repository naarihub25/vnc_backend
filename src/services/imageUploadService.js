const { randomUUID } = require('node:crypto');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const presigner = require('@aws-sdk/s3-request-presigner');
const { fail } = require('../utils/validation');

const allowedImageTypes = new Map([
  ['image/gif', 'gif'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
]);

async function prepareUpload(body, prefix) {
  const contentType = body?.contentType;
  const fileSize = body?.fileSize;
  const extension = allowedImageTypes.get(contentType);
  if (!extension || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
    fail('Choose a PNG, JPEG, WebP or GIF image up to 5 MB.');
  }
  const bucket = process.env.S3_IMAGE_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) fail('Image uploads are not configured.', 503);

  const key = `${prefix}/${randomUUID()}.${extension}`;
  const client = new S3Client({ region });
  try {
    const uploadUrl = await presigner.getSignedUrl(client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 300 });
    const baseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '') || `https://${bucket}.s3.${region}.amazonaws.com`;
    return { uploadUrl, imageUrl: `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}` };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Unknown AWS signing error');
    console.error(`Unable to sign ${prefix} image upload:`, error.name, error.message);
    if (error.name === 'CredentialsProviderError') fail('AWS credentials are not available to the backend server.', 503);
    fail('Unable to prepare the image upload.', 500);
  } finally {
    client.destroy();
  }
}

module.exports = { prepareUpload };
