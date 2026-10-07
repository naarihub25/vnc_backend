const ref = name => ({ $ref: `#/components/schemas/${name}` });
const address = { type: 'object', additionalProperties: false, required: ['line1', 'city', 'state', 'postalCode', 'country'], properties: {
  line1: { type: 'string', maxLength: 200, example: '12 MG Road' }, line2: { type: 'string', maxLength: 200, example: 'Apartment 4B' },
  city: { type: 'string', maxLength: 100, example: 'Bengaluru' }, state: { type: 'string', maxLength: 100, example: 'Karnataka' },
  postalCode: { type: 'string', maxLength: 20, example: '560001' }, country: { type: 'string', pattern: '^[A-Za-z]{2}$', example: 'IN' },
} };
const response = (description, schema) => ({ description, content: { 'application/json': { schema } } });
function create(summary, description, input, output) { return { summary, description, tags: ['Guest checkout'], requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } }, responses: {
  201: response('Created', ref(output)), 400: response('Invalid input', ref('Error')), 403: response('Inactive user or unsupported role', ref('Error')),
  404: response('User or product not found', ref('Error')), 409: response('Email already registered or product unavailable', ref('Error')), 429: response('Too many guest registration attempts', ref('Error')), 500: response('Internal server error', ref('Error')),
} }; }
const orderStatusValues = ['pending', 'approved', 'shipped', 'delivered', 'returned', 'cancelled'];
const orderIdParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }, example: '507f1f77bcf86cd799439011' };
const queryParameter = (name, schema, description) => ({ name, in: 'query', schema, ...(description ? { description } : {}) });
module.exports = {
  schemas: {
    Address: address,
    CreateGuest: { type: 'object', additionalProperties: false, required: ['name', 'phone', 'email', 'address'], properties: {
      name: { type: 'string', maxLength: 100, example: 'Example Customer' }, email: { type: 'string', format: 'email', example: 'guest@example.com' },
      phone: { type: 'string', maxLength: 30, example: '+91 9876543210', description: 'Required, containing 7–15 digits. Common phone formatting is accepted.' }, address: ref('Address'),
    } },
    GuestResponse: { type: 'object', properties: { flag: { type: 'boolean', enum: [true] }, data: ref('User') } },
    CreateGuestOrder: { type: 'object', additionalProperties: false, required: ['userId', 'items', 'paymentMethod'], properties: {
      paymentMethod: { type: 'string', enum: ['cod', 'online'], example: 'cod', description: 'Required. cod = cash on delivery. online is reserved for future use and currently returns HTTP 400 without creating an order.' },
      userId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'Guest user ID returned by /api/users/guest' },
      items: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['productId', 'quantity'], properties: { productId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }, quantity: { type: 'integer', minimum: 1, maximum: 1000000000 } } } },
    } },
    Order: { type: 'object', properties: {
      _id: { type: 'string' }, user: { type: 'string' }, customer: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } } },
      shippingAddress: ref('Address'), items: { type: 'array', items: { type: 'object', properties: { product: { type: 'string' }, name: { type: 'string' }, sku: { type: 'string' }, quantity: { type: 'integer' }, unitPrice: { type: 'number' }, lineTotal: { type: 'number' } } } },
      paymentMethod: { type: 'string', enum: ['cod', 'online'] },
      payment: { type: 'object', readOnly: true, properties: { status: { type: 'string', enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'], example: 'pending' }, provider: { type: 'string', nullable: true }, providerOrderId: { type: 'string', nullable: true }, transactionId: { type: 'string', nullable: true }, paidAt: { type: 'string', format: 'date-time', nullable: true } } },
      currency: { type: 'string' }, subtotal: { type: 'number' }, status: { type: 'string', enum: orderStatusValues }, statusReason: { type: 'string', maxLength: 500, description: 'Reason saved when status is returned or cancelled.' },
      logistics: { type: 'object', properties: { logisticsId: { type: 'string', maxLength: 100, example: 'AWB123456789' }, logisticsName: { type: 'string', maxLength: 100, example: 'Blue Dart' }, trackingUrl: { type: 'string', maxLength: 500, example: 'https://tracking.example.com/AWB123456789' }, notes: { type: 'string', maxLength: 500, example: 'Packed in one box' } } },
      createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    } },
    OrderResponse: { type: 'object', properties: { flag: { type: 'boolean', enum: [true] }, data: ref('Order') } },
    OrderList: { type: 'object', properties: { orders: { type: 'array', items: ref('Order') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' } } },
    CreateRazorpayOrder: { type: 'object', additionalProperties: false, required: ['userId', 'items'], properties: {
      userId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: 'Guest user ID returned by /api/users/guest' },
      items: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['productId', 'quantity'], properties: { productId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }, quantity: { type: 'integer', minimum: 1, maximum: 1000000000 } } } },
    } },
    RazorpayOrderResponse: { type: 'object', properties: { flag: { type: 'boolean', enum: [true] }, data: { type: 'object', properties: {
      order: ref('Order'),
      razorpay: { type: 'object', properties: { keyId: { type: 'string', example: 'rzp_test_xxxxx' }, orderId: { type: 'string', example: 'order_Razorpay123' }, amount: { type: 'integer', example: 5997, description: 'Amount in paise.' }, currency: { type: 'string', example: 'INR' } } },
    } } } },
    VerifyRazorpayPayment: { type: 'object', additionalProperties: false, required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'], properties: {
      razorpay_order_id: { type: 'string', example: 'order_Razorpay123' },
      razorpay_payment_id: { type: 'string', example: 'pay_Razorpay123' },
      razorpay_signature: { type: 'string' },
    } },
    UpdateOrderStatus: { type: 'object', additionalProperties: false, required: ['status'], properties: {
      status: { type: 'string', enum: orderStatusValues, example: 'approved' },
      reason: { type: 'string', maxLength: 500, example: 'Customer requested cancellation', description: 'Required when status is returned or cancelled. Cleared for other statuses.' },
      logistics: { type: 'object', additionalProperties: false, description: 'Required when status is shipped. Cleared for other statuses.', properties: {
        logisticsId: { type: 'string', maxLength: 100, example: 'AWB123456789' },
        logisticsName: { type: 'string', maxLength: 100, example: 'Blue Dart' },
        trackingUrl: { type: 'string', maxLength: 500, example: 'https://tracking.example.com/AWB123456789' },
        notes: { type: 'string', maxLength: 500, example: 'Packed in one box' },
      } },
    } },
  },
  paths: {
    '/api/orders/tracking/request-otp': {
      post: { summary: 'Email a four-digit order tracking OTP', tags: ['Orders'],
        description: 'Requires an existing order customer email. Expires in 5 minutes; resend cooldown 60 seconds. The otp response field is included when ORDER_TRACKING_DEV_OTP=true, including production. Disable this flag to require email access.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: { 200: response('OTP sent', { type: 'object', properties: { message: { type: 'string' }, expiresIn: { type: 'integer' }, otp: { type: 'string', pattern: '^[0-9]{4}$', description: 'Included when ORDER_TRACKING_DEV_OTP=true, including production' } } }), 400: response('Invalid email', ref('Error')), 404: response('No orders for email', ref('Error')), 429: response('Resend cooldown or rate limit', ref('Error')), 503: response('Email delivery unavailable', ref('Error')) },
      },
    },
    '/api/orders/by-email': {
      post: { summary: 'Verify OTP and retrieve orders by exact email', tags: ['Orders'],
        description: 'OTP is single-use with five attempts. Returns orders newest first. Each request, including another page, needs a fresh OTP. Existing public admin order endpoints are unchanged.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'otp'], properties: { email: { type: 'string', format: 'email' }, otp: { type: 'string', pattern: '^[0-9]{4}$' }, page: { type: 'integer', minimum: 1, default: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } } } } } },
        responses: { 200: response('Matching orders', { type: 'object', properties: { orders: { type: 'array', items: ref('Order') }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' } } }), 400: response('Invalid request', ref('Error')), 401: response('Invalid, expired or consumed OTP', ref('Error')), 429: response('Rate limit exceeded', ref('Error')) },
      },
    },
    '/api/users/guest': { post: create('Create or reuse guest user for checkout', 'Stores a guestUser in the existing User collection. Phone, email and full delivery address are required. No password or token. An existing active guest with the same normalized email is reused and its name, phone and address updated. Registered accounts return 409 and inactive guests return 403. Saved order snapshots remain unchanged. FE can navigate to checkout after HTTP 201 and keep data._id.', 'CreateGuest', 'GuestResponse') },
    '/api/orders': {
      post: create('Create pending guest checkout order', 'Requires an active guest. Copies customer/address and product/pricing details into the order. Only active retail products with sufficient current stock and one currency are accepted. Prices are calculated by the server. Supply paymentMethod=cod for cash on delivery. The order and payment status start as pending; cash is not marked collected. Online checkout is not yet available and returns 400 without creating an order. No tax, shipping quote or stock reservation. Repeated POSTs create separate orders. After saving, the API sends a thank-you order details email when SMTP is configured.', 'CreateGuestOrder', 'OrderResponse'),
      get: { summary: 'List orders for admin panel', tags: ['Orders'], description: 'Public admin order listing with pagination and filters. Date filters use YYYY-MM-DD and include the full toDate in UTC.', parameters: [
        queryParameter('page', { type: 'integer', minimum: 1, maximum: 1000000, default: 1 }),
        queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
        queryParameter('status', { type: 'string', enum: orderStatusValues }),
        queryParameter('paymentMethod', { type: 'string', enum: ['cod', 'online'] }),
        queryParameter('paymentStatus', { type: 'string', enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'] }),
        queryParameter('userId', { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }),
        queryParameter('q', { type: 'string', minLength: 1, maxLength: 100 }, 'Search customer name, email, phone, or order ID.'),
        queryParameter('fromDate', { type: 'string', format: 'date', example: '2026-09-01' }),
        queryParameter('toDate', { type: 'string', format: 'date', example: '2026-09-25' }),
        queryParameter('sortBy', { type: 'string', enum: ['createdAt', 'subtotal'], default: 'createdAt' }),
        queryParameter('sortOrder', { type: 'string', enum: ['asc', 'desc'], default: 'desc' }),
      ], responses: { 200: response('Success', ref('OrderList')), 400: response('Invalid filter', ref('Error')), 503: response('Query timed out', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
    '/api/orders/{id}': {
      parameters: [orderIdParameter],
      get: { summary: 'Get order details', tags: ['Orders'], responses: { 200: response('Success', ref('OrderResponse')), 400: response('Invalid order ID', ref('Error')), 404: response('Order not found', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
    '/api/orders/{id}/invoice': {
      parameters: [orderIdParameter],
      get: { summary: 'Download printable invoice PDF', tags: ['Orders'], description: 'Downloads a PDF invoice for admin packing/courier handoff. Available after the order is approved, including shipped, delivered, returned, and cancelled orders.', responses: {
        200: { description: 'PDF invoice download', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }, headers: { 'Content-Disposition': { schema: { type: 'string' }, description: 'Attachment filename for the PDF invoice.' } } },
        400: response('Invalid order ID', ref('Error')),
        404: response('Order not found', ref('Error')),
        409: response('Order is not approved yet', ref('Error')),
        500: response('Internal server error', ref('Error')),
      } },
    },
    '/api/orders/{id}/status': {
      parameters: [orderIdParameter],
      patch: { summary: 'Update order status from admin panel', tags: ['Orders'], description: 'Sets order status to pending, approved, shipped, delivered, returned, or cancelled. Logistics ID and logistics name are required for shipped orders. When a COD order is marked delivered, payment.status becomes paid and paidAt is set. A reason is required for returned and cancelled orders. Reason and logistics fields are cleared when they do not apply to the current status. After saving, the API sends a status email to the customer when SMTP is configured.', requestBody: { required: true, content: { 'application/json': { schema: ref('UpdateOrderStatus') } } }, responses: { 200: response('Success', ref('OrderResponse')), 400: response('Invalid status update', ref('Error')), 404: response('Order not found', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
    '/api/payments/razorpay/orders': {
      post: { summary: 'Create Razorpay order for online checkout', tags: ['Orders'], description: 'Calls Razorpay Orders API before saving a local order. On success, saves the order and payment as pending with payment.providerOrderId. Provider failure saves no local order. Leaving checkout keeps the order pending until successful payment verification or a captured-payment webhook. Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.', requestBody: { required: true, content: { 'application/json': { schema: ref('CreateRazorpayOrder') } } }, responses: { 201: response('Created', ref('RazorpayOrderResponse')), 400: response('Invalid input', ref('Error')), 403: response('Inactive user or unsupported role', ref('Error')), 404: response('User or product not found', ref('Error')), 409: response('Product unavailable', ref('Error')), 503: response('Razorpay is not configured', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
    '/api/payments/razorpay/verify': {
      post: { summary: 'Verify Razorpay checkout payment', tags: ['Orders'], description: 'Verifies razorpay_order_id, razorpay_payment_id, and razorpay_signature using HMAC-SHA256. On success, marks the local order payment as paid and order status as approved.', requestBody: { required: true, content: { 'application/json': { schema: ref('VerifyRazorpayPayment') } } }, responses: { 200: response('Success', ref('OrderResponse')), 400: response('Invalid signature or input', ref('Error')), 404: response('Order not found', ref('Error')), 503: response('Razorpay is not configured', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
    '/api/payments/razorpay/webhook': {
      post: { summary: 'Razorpay payment webhook', tags: ['Orders'], description: 'Validates x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET using the raw body. payment.captured marks the local order paid and approved; payment.failed marks payment failed.', responses: { 200: response('Webhook received', { type: 'object', properties: { received: { type: 'boolean' } } }), 400: response('Invalid webhook signature or payload', ref('Error')), 503: response('Razorpay webhook is not configured', ref('Error')), 500: response('Internal server error', ref('Error')) } },
    },
  },
};
