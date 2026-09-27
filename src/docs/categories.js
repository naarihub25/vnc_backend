const ref = name => ({ $ref: `#/components/schemas/${name}` });
const properties = {
  parentCategory: { type: 'string', nullable: true, pattern: '^[a-fA-F0-9]{24}$', default: null, description: 'Parent category ID. Omit or set null for a top-level category. Set a category ID to create or move a subcategory.' },
  name: { type: 'string', minLength: 1, maxLength: 100, example: 'Kids Toys' },
  slug: { type: 'string', maxLength: 120, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', example: 'kids-toys', description: 'Generated from name on creation if omitted. Renaming preserves the slug unless explicitly changed.' },
  description: { type: 'string', maxLength: 2000, example: 'Fun toys for children', default: '' },
  imageUrl: { type: 'string', maxLength: 2048, example: 'https://example.com/images/kids-toys.jpg', default: '', description: 'HTTP/HTTPS image URL or empty string; no file upload.' },
  sortOrder: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 },
  isActive: { type: 'boolean', default: true },
};
function response(description, schema) { return { description, ...(schema ? { content: { 'application/json': { schema } } } : {}) }; }
function operation(summary, { body, result = 'CategoryResponse', status = 200 } = {}) {
  return { summary, tags: ['Categories'], ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(body) } } } } : {}), responses: {
    [status]: response('Success', status === 204 ? undefined : ref(result)),
    400: response('Invalid category data', ref('Error')),
    404: response('Category not found', ref('Error')),
    409: response('Category slug already exists, or category still has subcategories/products', ref('Error')),
    500: response('Internal server error', ref('Error')),
  } };
}
module.exports = {
  schemas: {
    ParentCategoryList: { type: 'object', properties: { categories: { type: 'array', items: { type: 'object', properties: { _id: { type: 'string' }, name: { type: 'string', example: 'Kids Toys' } } } } } },
    Category: { type: 'object', properties: { _id: { type: 'string' }, ...properties, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } },
    CreateCategory: { type: 'object', additionalProperties: false, required: ['name'], properties },
    UpdateCategory: { type: 'object', additionalProperties: false, minProperties: 1, properties },
    CategoryResponse: { type: 'object', properties: { category: ref('Category') } },
    CategoryList: { type: 'object', properties: { categories: { type: 'array', items: ref('Category') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } },
  },
  paths: {
    '/api/categories/parents': {
      get: { ...operation('List parent categories for dropdown', { result: 'ParentCategoryList' }), description: 'Returns all active top-level categories, containing only _id and name. Sorted by sortOrder, name and ID. No pagination or authentication required.' },
    },
    '/api/categories': {
      post: operation('Create a category', { body: 'CreateCategory', status: 201 }),
      get: { ...operation('List categories', { result: 'CategoryList' }), description: 'Returns all categories and subcategories by default. Filter parentCategory=null for top-level categories or supply a parent ID for direct children. Active status applies to each category independently. Use isActive=true for website navigation. Sorted by sortOrder, name and ID.', parameters: [
        { name: 'parentCategory', in: 'query', schema: { type: 'string' }, description: 'Parent ID, or the literal string null for top-level categories' },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ] },
    },
    '/api/categories/{id}/subcategories': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }],
      get: { ...operation('List direct subcategories', { result: 'CategoryList' }), parameters: [
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ] },
    },
    '/api/categories/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }],
      get: operation('Get category'),
      patch: operation('Edit category', { body: 'UpdateCategory' }),
      delete: operation('Permanently delete category', { status: 204 }),
    },
  },
};
