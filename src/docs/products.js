const ref = name => ({ $ref: `#/components/schemas/${name}` });
const properties = {
  name: { type: 'string', maxLength: 200, example: 'Wooden Building Blocks' },
  slug: { type: 'string', maxLength: 240, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', description: 'Unique. Generated on creation if omitted; preserved on rename.' },
  sku: { type: 'string', maxLength: 100, example: 'TOY-001', description: 'Unique; normalized to uppercase.' },
  category: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'Exactly one existing category or subcategory ID.' },
  productType: { type: 'string', maxLength: 100, example: 'Building Blocks' },
  description: { type: 'string', maxLength: 10000, default: '' },
  images: { type: 'array', minItems: 1, maxItems: 5, description: 'Ordered gallery. First image is the main image. PATCH replaces the complete array.', items: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', format: 'uri', maxLength: 2048, example: 'https://example.com/front.jpg', description: 'HTTP/HTTPS only' }, alt: { type: 'string', maxLength: 200, default: '' } } } },
  currency: { type: 'string', pattern: '^[A-Za-z]{3}$', default: 'INR' },
  isRetail: { type: 'boolean', default: true },
  retailPrice: { type: 'number', minimum: 0, maximum: 1000000000, multipleOf: 0.01, example: 499, description: 'Required when isRetail is true. Per-unit price.' },
  isWholesale: { type: 'boolean', default: false },
  wholesalePrice: { type: 'number', minimum: 0, maximum: 1000000000, multipleOf: 0.01, example: 350, description: 'Required when isWholesale is true. Per-unit price.' },
  minWholesaleQty: { type: 'integer', minimum: 1, maximum: 1000000000, example: 10, description: 'Required when isWholesale is true.' },
  stockQuantity: { type: 'integer', minimum: 0, maximum: 1000000000, default: 0 },
  isActive: { type: 'boolean', default: true },
  isTrending: { type: 'boolean', default: false, description: 'Show in the trending products section.' },
  isRecommended: { type: 'boolean', default: false, description: 'Show in the recommended products section.' },
};
const response = (description, schema) => ({ description, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
function operation(summary, { body, result = 'ProductResponse', status = 200 } = {}) {
  return { summary, tags: ['Products'], ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(body) } } } } : {}), responses: {
    [status]: response('Success', status === 204 ? undefined : ref(result)),
    400: response('Invalid product data', ref('Error')), 404: response('Product or category not found', ref('Error')),
    409: response('Duplicate SKU/slug or concurrent update', ref('Error')), 500: response('Internal server error', ref('Error')),
  } };
}
module.exports = {
  schemas: {
    Product: { type: 'object', properties: { _id: { type: 'string' }, ...properties, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
    CreateProduct: { type: 'object', additionalProperties: false, required: ['name', 'sku', 'category', 'productType', 'images'], properties, description: 'Enable at least one sales channel. Enabled retail requires retailPrice; enabled wholesale requires wholesalePrice and minWholesaleQty.' },
    UpdateProduct: { type: 'object', additionalProperties: false, minProperties: 1, properties, description: 'Send only changed fields. The merged product must retain at least one enabled channel and valid prices/minimum quantity.' },
    ProductResponse: { type: 'object', properties: { product: ref('Product') } },
    ProductSearchResults: { type: 'object', properties: { products: { type: 'array', items: ref('Product') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, query: { type: 'string' } } },
    ProductList: { type: 'object', properties: { products: { type: 'array', items: ref('Product') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } },
  },
  paths: {
    '/api/products/search': {
      get: { ...operation('Global product and category search', { result: 'ProductSearchResults' }),
        description: 'Literal case-insensitive substring search over product name, slug, SKU, type and description, plus active category names/slugs and their active descendants. Returns active products only, newest first, without duplicates. No fuzzy matching or relevance ranking. Direct product matches do not require an active category.',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: 100 }, example: 'kids toys' },
          ...['isRetail', 'isWholesale', 'isTrending', 'isRecommended'].map(name => ({ name, in: 'query', schema: { type: 'boolean' } })),
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { 200: response('Matching products', ref('ProductSearchResults')), 400: response('Invalid search parameters', ref('Error')), 503: response('Search timed out', ref('Error')), 500: response('Internal server error', ref('Error')) },
      },
    },
    '/api/products': {
      post: operation('Create product', { body: 'CreateProduct', status: 201 }),
      get: { ...operation('List products', { result: 'ProductList' }), description: 'All products by default, newest first. Category filter matches the exact category, not descendants. Active filters apply to the product, not its category. Prices are public, including wholesale pricing.', parameters: [
        { name: 'category', in: 'query', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
        ...['isRetail', 'isWholesale', 'isActive', 'isTrending', 'isRecommended'].map(name => ({ name, in: 'query', schema: { type: 'boolean' } })),
        { name: 'productType', in: 'query', schema: { type: 'string', maxLength: 100 }, description: 'Exact match' },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ] },
    },
    '/api/products/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }],
      get: operation('Get product'), patch: operation('Edit product', { body: 'UpdateProduct' }), delete: operation('Permanently delete product', { status: 204 }),
    },
  },
};
