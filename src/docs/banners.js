const ref = name => ({ $ref: `#/components/schemas/${name}` });
const properties = {
  title: { type: 'string', minLength: 1, maxLength: 200, example: 'Festive Gifts Sale' },
  images: { type: 'array', minItems: 1, description: 'Image display order follows array order. PATCH replaces the complete array. URLs only, not file uploads.', items: { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string', format: 'uri', maxLength: 2048, example: 'https://example.com/banners/gifts.jpg' }, alt: { type: 'string', maxLength: 200, example: 'Festive gifts collection' } } } },
  redirectUrl: { type: 'string', maxLength: 2048, example: '/categories/gifts', description: 'HTTP/HTTPS URL or site-relative path starting with /. Shared by all images in this banner.' },
  position: { type: 'string', enum: ['carousal', 'offerBanner'], example: 'carousal' },
  isActive: { type: 'boolean', default: true },
  sortOrder: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 },
};
const response = (description, schema) => ({ description, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
function operation(summary, { body, result = 'BannerResponse', status = 200 } = {}) {
  return { summary, tags: ['Banners'], ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(body) } } } } : {}), responses: {
    [status]: response('Success', status === 204 ? undefined : ref(result)),
    400: response('Invalid banner data', ref('Error')), 404: response('Banner not found', ref('Error')), 409: response('Concurrent update', ref('Error')), 500: response('Internal server error', ref('Error')),
  } };
}
module.exports = {
  schemas: {
    Banner: { type: 'object', properties: { _id: { type: 'string' }, ...properties, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
    CreateBanner: { type: 'object', additionalProperties: false, required: ['title', 'images', 'redirectUrl', 'position'], properties },
    UpdateBanner: { type: 'object', additionalProperties: false, minProperties: 1, properties },
    BannerResponse: { type: 'object', properties: { banner: ref('Banner') } },
    BannerList: { type: 'object', properties: { banners: { type: 'array', items: ref('Banner') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } },
    BannerPositions: { type: 'object', properties: { positions: { type: 'array', items: { type: 'object', properties: { value: { type: 'string', enum: ['carousal', 'offerBanner'] }, label: { type: 'string' } } } } } },
  },
  paths: {
    '/api/banners/positions': { get: operation('Banner position dropdown options', { result: 'BannerPositions' }) },
    '/api/banners': {
      post: operation('Create banner', { body: 'CreateBanner', status: 201 }),
      get: { ...operation('List banners', { result: 'BannerList' }), description: 'Sorted by sortOrder, newest createdAt, then ID. All statuses included by default. Website should filter isActive=true.', parameters: [
        { name: 'position', in: 'query', schema: { type: 'string', enum: ['carousal', 'offerBanner'] } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ] },
    },
    '/api/banners/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }],
      get: operation('Get banner'), patch: operation('Edit banner', { body: 'UpdateBanner' }), delete: operation('Permanently delete banner', { status: 204 }),
    },
  },
};
