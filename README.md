# VNUC backend

Express REST API with MongoDB and one shared User collection for `admin`, `retailUser`, and `wholesaleUser`.

All endpoints are public: no token or Authorization header is required. Anyone with API access can create admins, list users, and edit or delete any user. Login verifies credentials and returns user data; it does not create a session or grant access.

CORS allows all origins, including localhost on any port, by reflecting the request Origin header. Credentialed requests (`credentials: 'include'` or Axios `withCredentials: true`) are supported. Browser OPTIONS preflight requests are handled globally using the [Express CORS middleware](https://expressjs.com/en/resources/middleware/cors/). The API still does not create cookie sessions.

## Setup

```sh
nvm use 20
npm install
cp .env.example .env # Only if .env does not exist
```

Start MongoDB on the same server as the backend, listening on `127.0.0.1:27017`. The default configuration in `.env` is:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/vnuc
MONGODB_DB=vnuc
```

Run `npm run dev` for development or `npm start` for release. PORT defaults to 3000. Startup waits for MongoDB and the unique email index. No JWT secret is needed.

The backend defaults to local MongoDB when `MONGODB_URI` is unset. Update any deployment environment override that still points to Atlas. The frontend connects to the backend API; only the backend connects to MongoDB. Keep MongoDB bound to the loopback interface for this same-server setup. If MongoDB authentication is enabled, set the credentials and appropriate `authSource` in `MONGODB_URI`.

Switching the connection does not copy existing Atlas data; migrate that data separately if it is needed for release.

## Swagger UI

Open http://localhost:3000/api-docs/ and select **Try it out**, fill the request, then **Execute**. No authorization step is needed. The specification is at `/api-docs/openapi.json`.

## API

Send JSON with `Content-Type: application/json`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create retail or wholesale user |
| POST | `/api/auth/login` | Verify retail/wholesale credentials |
| POST | `/api/admin/login` | Verify admin credentials |
| POST | `/api/users` | Create any role, including admin |
| GET | `/api/users?page=1&limit=20` | List users; maximum limit 100 |
| GET | `/api/users/:id` | Get user |
| PATCH | `/api/users/:id` | Edit user |
| DELETE | `/api/users/:id` | Permanently delete user |
| GET | `/api/health` | Database readiness |
| GET | `/api/admin/health` | Public health endpoint |

`/api/users/me` and `/api/auth/logout` have been removed because there is no authenticated session. Use a user's `_id` for user operations. Frontend logout can clear its local user state.

### Create a user

```json
{
  "name": "Example Customer",
  "email": "customer@example.com",
  "password": "a-long-unique-password",
  "role": "retailUser"
}
```

Role defaults to `retailUser`. Registration accepts `retailUser` and `wholesaleUser`. `/api/users` additionally accepts `admin` and optional boolean `isActive`. Creation returns HTTP 201 with `{ user }`.

### Login

```json
{ "email": "customer@example.com", "password": "a-long-unique-password" }
```

Both login endpoints return `{ flag: true, data: user }` without a token. Failed login requests return `{ flag: false, data: null, error: "message" }`. Only users with `isActive: true` can log in. Incorrect credentials, inactive accounts, and a role unsuitable for that login endpoint return 401. Passwords remain salted and hashed; password hashes are never returned.

### Edit and delete

The optional `phone` field is supported in registration, user creation, and edits for all roles. Supply it as a string (maximum 30 characters), for example `"+91 9876543210"`. Omit it or send `""` when not needed; sending `""` on edit clears it.

PATCH accepts any combination of `name`, `phone`, `email`, `password`, `role`, and `isActive`. It requires no current password or caller identity. Names must contain 1–100 characters, passwords 12–128 characters. Email is normalized and unique. Unknown fields are rejected. Edits return `{ user }`; deletion returns HTTP 204 with no body.

Errors return `{ "error": "message" }`: 400 invalid input, 401 incorrect login credentials, 403 admin role supplied to retail/wholesale registration, 404 user not found, 409 duplicate email, 429 too many attempts. Registration and both login routes share a process-local limit of 20 requests per IP per 15 minutes.

You can create an admin using `POST /api/users`, or set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` locally and run `npm run create:admin`. The command never overwrites an existing account. Remove the bootstrap values afterward.

## Code structure

`src/routes/users.js` → `src/controllers/` → `src/services/` → `src/models/User.js`.

Routes apply rate limits and select controllers. Controllers handle HTTP input/output. Services handle validation, password checks, and database operations. Central error handling lives in `src/app.js`.

## Tests

Run `nvm use 20` and `npm test`. Tests cover public CRUD, login checks, hashing, validation, throttling, and Swagger delivery. HTTP tests use an in-memory repository and do not modify Atlas. Live MongoDB persistence remains a separate integration check.

## Categories

Categories use the same routes → controllers → services structure, with `src/models/Category.js` as the shared schema. All category endpoints are public and available in Swagger.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/categories` | Create category |
| GET | `/api/categories` | List with pagination and optional isActive filter |
| GET | `/api/categories/:id` | Get category |
| PATCH | `/api/categories/:id` | Edit category |
| DELETE | `/api/categories/:id` | Permanently delete category |

Example creation body:

```json
{
  "name": "Kids Toys",
  "description": "Fun toys for children",
  "imageUrl": "https://example.com/images/kids-toys.jpg",
  "sortOrder": 1,
  "isActive": true
}
```

Only `name` is required. `slug` defaults to a URL-friendly name such as `kids-toys`, must be unique, and can be supplied explicitly. Renaming preserves existing slugs unless `slug` is included in the update. Names that cannot produce an ASCII slug need an explicit slug. Other defaults: empty description/image URL, sortOrder 0, isActive true. Creation/edit/get return `{ category }`. Lists return `{ categories, total, page, limit }`. Deletion returns 204.

Use `/api/categories?isActive=true&page=1&limit=20` for website navigation; omit isActive to list both active and inactive categories. Results sort by sortOrder then name. Slug conflicts return 409. Image URLs accept HTTP/HTTPS; use the signing endpoint below to upload category images directly to S3. Categories such as Jewels, Gifts, and Home Decor can be created freely—no fixed category enum or automatic seed data.

### Subcategories

Categories and subcategories share the same collection. `parentCategory` is a Category ObjectId reference, defaulting to `null` for top-level categories. Existing categories remain top-level. Nested subcategories are supported.

Create a top-level category with `POST /api/categories` and `{ "name": "Kids Toys" }`, then use its returned `_id`:

```json
{
  "name": "Building Blocks",
  "parentCategory": "<Kids Toys category ID>"
}
```

- `GET /api/categories?parentCategory=null`: top-level categories.
- `GET /api/categories?parentCategory=<id>` or `GET /api/categories/:id/subcategories`: direct children, with pagination and optional `isActive=true`.
- `PATCH /api/categories/:id` with `parentCategory`: move a category under another category. Set `null` to make it top-level.
- `DELETE /api/categories/:id`: returns 409 while direct children exist; move/delete them first.

Parent references must exist. Updates reject self-parenting and descendant cycles. Slugs remain globally unique. Active status is independent for each record; deactivating a parent does not cascade to its children. For website navigation, fetch active top-level categories and then their active children. Parent validation and writes are separate database operations; concurrent hierarchy edits/deletions are not transactionally serialized.

### Parent category dropdown

`GET /api/categories/parents` returns all active top-level categories as `{ "categories": [{ "_id": "...", "name": "Kids Toys" }] }`. Use `_id` as the dropdown value and `name` as the label. Subcategories and inactive categories are excluded. Results are sorted by sortOrder, name, and ID, without pagination. No token is required.

## Product schema

`src/models/Product.js` defines products for any category. Product CRUD endpoints are available below; ordering endpoints are not implemented yet.

Suggested form order:

1. **Basic details:** required `name`, unique `sku`, `category` (one Category ID), and flexible `productType` (e.g. Building Blocks, Necklace, Gift Box, Vase). Optional `description`. Unique `slug` is generated on creation if omitted.
2. **Images:** required `images` array containing 1–5 `{ url, alt }` objects. URL must use HTTP/HTTPS; alt text is optional. Array order controls the gallery, and the first image is the main image. Reorder the array to change display order. No image upload is implemented.
3. **Retail:** `isRetail` defaults to true; `retailPrice` is required when enabled.
4. **Wholesale:** `isWholesale` defaults to false and supplies the admin availability flag. When enabled, `wholesalePrice` and integer `minWholesaleQty` (at least 1) are required. At least one of retail or wholesale must be enabled. Prices are per unit, nonnegative, and accept up to two decimal places. Currency defaults to INR.
5. **Inventory/status:** integer `stockQuantity` defaults to 0; `isActive` defaults to true. Timestamps are automatic.

```json
{
  "name": "Wooden Building Blocks",
  "sku": "TOY-001",
  "category": "<one category or subcategory ID>",
  "productType": "Building Blocks",
  "description": "Colourful wooden building blocks",
  "images": [
    { "url": "https://example.com/front.jpg", "alt": "Front view" },
    { "url": "https://example.com/side.jpg", "alt": "Side view" }
  ],
  "currency": "INR",
  "isRetail": true,
  "retailPrice": 499,
  "isWholesale": true,
  "wholesalePrice": 350,
  "minWholesaleQty": 10,
  "stockQuantity": 100,
  "isActive": true
}
```

A product stores exactly one category reference; if assigned to a subcategory, its parent can be resolved through the category hierarchy. Product services check that the category exists and category deletion rejects categories with products. These checks and writes are separate database operations, so concurrent product/category mutations are not transactionally serialized. Use document `save()` for validation across channel fields; query updates do not run document validation hooks. Order APIs must enforce wholesale minimum quantities, availability, stock, and server-side pricing when implemented. Unique SKU/slug indexes are initialized at startup. Model tests do not verify live MongoDB uniqueness or persistence.


## Product APIs

All endpoints are public and available under **Products** in Swagger UI.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/products` | Create product using the example above |
| GET | `/api/products` | Paginated product list |
| GET | `/api/products/:id` | Get product |
| PATCH | `/api/products/:id` | Edit supplied fields |
| DELETE | `/api/products/:id` | Permanently delete product |

Creation returns 201 with `{ product }`; get/edit return `{ product }`; deletion returns 204. Lists return `{ products, total, page, limit }`, newest first, default limit 20 and maximum 100.

List filters: `category`, `productType` (exact match), `isRetail`, `isWholesale`, `isActive`, `isTrending`, and `isRecommended`. Boolean query values are `true` or `false`. Examples:

- Retail storefront: `/api/products?isRetail=true&isActive=true`
- Wholesale storefront: `/api/products?isWholesale=true&isActive=true`
- Category products: `/api/products?category=<categoryId>&page=1&limit=20`

Category filtering matches one category exactly, not its descendants. Active filtering applies to the product independently of the category. Without filters, inactive products are included. Both retail and wholesale prices are public, consistent with the current no-auth API policy.

PATCH replaces `images` as a whole; order that array to choose the main image and gallery order. Renaming preserves the slug unless explicitly changed. Enable wholesale with `isWholesale`, `wholesalePrice`, and `minWholesaleQty` together. Both channels cannot be disabled; use `isActive: false` to deactivate the product. Unknown fields and wrong JSON types are rejected. Validation returns 400, missing products/categories 404, and duplicate SKU/slug or conflicting concurrent edits 409.

Tests use mocked database operations. Live persistence, unique indexes, and concurrent write behavior are not integration-tested against Atlas.


### Trending and recommended products

`isTrending` and `isRecommended` default to false. Set either or both in POST/PATCH product bodies, for example `{ "isTrending": true, "isRecommended": true }`. Set a flag to false to remove the product from that section. Both flags are included in product responses and Swagger; they do not change channel availability or active status.

- Trending: `GET /api/products?isTrending=true&isActive=true`
- Recommended: `GET /api/products?isRecommended=true&isActive=true`
- Add `isRetail=true` or `isWholesale=true` to filter for the relevant storefront.

Combined filters use AND. Explicit false filters include older records with no flag stored. As with other product operations, these edits are currently public under the configured no-auth policy.

## Banner APIs

`src/models/Banner.js` stores `title`, ordered `images: [{ url, alt }]`, `redirectUrl`, `position`, `isActive` (default true), `sortOrder` (default 0), and timestamps. Title, at least one image, redirect URL, and position are required. Images use HTTP/HTTPS URLs; no file upload is included. All images in a banner share its title and redirect target; use separate banner records for different click destinations.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/banners/positions` | Dropdown options with label/value pairs |
| POST | `/api/banners` | Create banner |
| GET | `/api/banners` | Paginated listing |
| GET | `/api/banners/:id` | Get banner |
| PATCH | `/api/banners/:id` | Edit banner or activate/deactivate it |
| DELETE | `/api/banners/:id` | Permanently delete banner |

Position values are exactly `carousal` (dropdown label **Carousel**) and `offerBanner` (**Offer Banner**). `sortOrder` controls ordering within a position. All endpoints remain public and appear under **Banners** in Swagger.

```json
{
  "title": "Festive Gifts Sale",
  "images": [{ "url": "https://example.com/banners/gifts.jpg", "alt": "Festive gifts collection" }],
  "redirectUrl": "/categories/gifts",
  "position": "carousal",
  "isActive": true,
  "sortOrder": 1
}
```

`redirectUrl` accepts a site-relative path starting with `/` or a full HTTP/HTTPS URL. The frontend navigates to it when clicked; this API stores the destination and does not perform an HTTP redirect. Script URLs, protocol-relative URLs, and backslash paths are rejected.

Website requests: `/api/banners?position=carousal&isActive=true` and `/api/banners?position=offerBanner&isActive=true`. Without filters the admin list includes active and inactive banners. Pagination defaults to page 1, limit 20 (maximum 100). Sort order is sortOrder, newest createdAt, then ID.

Creation/get/edit return `{ banner }`; lists return `{ banners, total, page, limit }`; deletion returns 204. PATCH only changed fields; supplying images replaces the complete ordered array. The admin frontend can use `/positions` to populate its select control; this backend repository does not implement the admin panel UI.

## Global product search

`GET /api/products/search?q=kids%20toys&page=1&limit=20`

Searches product name, slug, SKU, product type, and description, plus active category names/slugs. Matching a parent category includes products assigned to its active descendants. Results contain each matching product once, even when both its fields and category match.

The query `q` is required, trimmed, and must contain 2–100 characters. Search uses case-insensitive literal substring matching (not fuzzy matching or word-based relevance). Regex characters such as `.*` are treated literally. Results include only active products, sorted newest first, and return `{ products, total, page, limit, query }`. No results returns an empty array and total 0. Limit defaults to 20 and is capped at 100.

Optional filters: `isRetail`, `isWholesale`, `isTrending`, `isRecommended` (`true`/`false`). Example: `/api/products/search?q=gifts&isWholesale=true`. Search is public and does not require a token. `isActive` is fixed to true for this endpoint. Direct product matches remain independent of category status; category-based expansion follows active category links only.

MongoDB performs matching and pagination; category descendants are resolved with [$graphLookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/graphlookup/). No Atlas Search index or external search provider is required. Case-insensitive substring [$regex](https://www.mongodb.com/docs/manual/reference/operator/query/regex/) queries can scan large collections; this implementation is intended for a modest catalog. Each database query has a five-second execution limit; timeouts return 503. For large catalogs, use a dedicated MongoDB Search index. Counts and results are separate reads and can differ during concurrent catalog changes. Tests mock database execution; live MongoDB performance and aggregation behavior have not been integration-tested.

## Guest checkout

`POST /api/users/guest` creates a `guestUser` in the existing User collection. No password/token is needed. Name, valid phone (7–15 digits), email, and delivery address are mandatory. Other user roles still have optional phone numbers. All endpoints retain the current public/no-auth policy.

```json
{
  "name": "Example Customer",
  "phone": "+91 9876543210",
  "email": "guest@example.com",
  "address": {
    "line1": "12 MG Road",
    "line2": "Apartment 4B",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560001",
    "country": "IN"
  }
}
```

Returns HTTP 201 with `{ flag: true, data: user }`. The frontend retains `data._id` and navigates to its checkout page. Country is a two-letter code; line2 is optional. Duplicate emails return 409 without replacing or converting an existing user. Reuse a previously created guest ID for another checkout; there is no email-based account recovery or automatic merge. Guest users cannot log in through either password-login endpoint. Edit delivery details with `PATCH /api/users/:id` and a complete `address` object.

To submit checkout, call `POST /api/orders`:

```json
{
  "userId": "<guest user ID>",
  "paymentMethod": "cod",
  "items": [{ "productId": "<product ID>", "quantity": 2 }]
}
```

Returns HTTP 201 with `{ flag: true, data: order }`. The order contains the user reference, a customer/contact snapshot, a shipping-address snapshot, item names/SKUs and server-calculated retail prices, currency, merchandise subtotal, and `status: "pending"`. Editing the user's address afterward does not modify existing order addresses.

After the order is created, the backend attempts to email the customer a thank-you message with order ID, items, subtotal, payment method, and delivery address. If SMTP is not configured or delivery fails, order creation still succeeds.

Checkout currently supports active guests and active retail products only. Quantities must be positive integers, each product appears once, current stock must suffice, and currencies must match. Client-supplied prices/totals are rejected. Saving the pending order does **not** process payment, reserve/decrement inventory, add taxes/shipping, or fulfill it. Payment confirmation must revalidate price/stock and reserve inventory atomically. Repeating the POST creates another order; checkout idempotency and payment integration are not implemented.

See **Guest checkout** and **Orders** in Swagger. Tests use mocked database operations and do not submit payments or change Atlas records.

For the admin panel, list orders with `GET /api/orders`. Useful filters:

```text
/api/orders?page=1&limit=20&status=approved
/api/orders?paymentMethod=cod&paymentStatus=pending
/api/orders?fromDate=2026-09-01&toDate=2026-09-25&q=guest@example.com
```

The listing returns `{ orders, total, page, limit, totalPages }`. Filters include `status`, `paymentMethod`, `paymentStatus`, `userId`, `q`, `fromDate`, `toDate`, `sortBy`, and `sortOrder`. Use `GET /api/orders/:id` for order details.

Update admin order status with `PATCH /api/orders/:id/status`:

```json
{ "status": "approved" }
```

Allowed statuses are `pending`, `approved`, `shipped`, `delivered`, `returned`, and `cancelled`. Returned and cancelled orders require a reason:

```json
{ "status": "cancelled", "reason": "Customer requested cancellation" }
```

Shipped orders require logistics details:

```json
{
  "status": "shipped",
  "logistics": {
    "logisticsId": "AWB123456789",
    "logisticsName": "Blue Dart",
    "trackingUrl": "https://tracking.example.com/AWB123456789",
    "notes": "Packed in one box"
  }
}
```

`logisticsId` and `logisticsName` are mandatory for shipped orders. `trackingUrl` and `notes` are optional. Logistics details are cleared if the order moves away from shipped status.

When a COD order is delivered, call the same status API:

```json
{ "status": "delivered" }
```

The order status becomes `delivered`, and the server updates `payment.status` to `paid` with `payment.paidAt`. Existing logistics details stay attached to the order.

Every successful status change attempts to send an email to `order.customer.email`. Configure SMTP in `.env`:

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM="VNUC <orders@example.com>"
```

If SMTP is not configured, the status update still succeeds and email delivery is skipped.

Download a printable invoice PDF for packing/courier use after the order is approved:

```text
GET /api/orders/:id/invoice
```

The response is `application/pdf` with an attachment filename like `invoice-<orderId>.pdf`. Pending orders return 409; approved, shipped, delivered, returned, and cancelled orders can be downloaded.


### Order payment method and Razorpay online payment

`POST /api/orders` requires `paymentMethod: "cod"` for cash on delivery. Orders are created with order `status: "pending"` and `payment.status: "pending"`; creating the order does not mean cash has been collected. Stock checks remain unchanged and do not reserve inventory.

Online payment uses Razorpay through separate endpoints:

```text
POST /api/payments/razorpay/orders
POST /api/payments/razorpay/verify
POST /api/payments/razorpay/webhook
```

Create a Razorpay order before opening checkout:

```json
{
  "userId": "<guest user ID>",
  "items": [{ "productId": "<product ID>", "quantity": 2 }]
}
```

The create API saves a local order with `paymentMethod: "online"` and `payment.provider: "razorpay"`, calls Razorpay `POST /v1/orders`, stores Razorpay `order_id` in `payment.providerOrderId`, and returns:

```json
{
  "flag": true,
  "data": {
    "order": {},
    "razorpay": {
      "keyId": "rzp_test_xxxxx",
      "orderId": "order_xxxxx",
      "amount": 5997,
      "currency": "INR"
    }
  }
}
```

After Razorpay Checkout returns success, verify it:

```json
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "signature_from_checkout"
}
```

Successful verification updates `payment.status` to `paid`, saves `payment.transactionId`, sets `payment.paidAt`, and changes order `status` to `approved`. The webhook endpoint verifies `x-razorpay-signature` with the raw request body; `payment.captured` also marks the order paid and approved, while `payment.failed` marks the payment failed.

Configure Razorpay in `.env`:

```text
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

The server-owned `payment` object contains `status` (`pending`, `paid`, `failed`, `cancelled`, `refunded`), nullable `provider`, `providerOrderId`, `transactionId`, and `paidAt`. Provider-specific fields stay null for COD. Clients cannot submit payment status or transaction details through order creation. Razorpay verification and webhooks set online payment fields after signature validation. Order status and payment status are separate.


### Category image uploads to S3

`POST /api/categories/image-upload-url` accepts `{ "contentType": "image/png", "fileSize": 12345 }` and returns `{ "uploadUrl": "...", "imageUrl": "..." }`. Supports PNG, JPEG, WebP, and GIF, with a declared size from 1 byte to 5 MiB. The PUT URL expires after 300 seconds. Keys use `categories/<uuid>.<extension>`.

Set `S3_IMAGE_BUCKET` and `AWS_REGION` on the backend. Optionally set `S3_PUBLIC_BASE_URL` to your CDN/public image base URL. AWS credentials are resolved by the SDK (for example an IAM role, local AWS profile, or backend-only `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` and optional `AWS_SESSION_TOKEN`). The signing identity needs `s3:PutObject` on the bucket's `categories/*` prefix. Keep credentials out of browser code and `NEXT_PUBLIC_*` variables.

The bucket needs CORS allowing your frontend origin, `PUT`, and the `Content-Type` header. Configure public image reads through your bucket policy or CDN; returning imageUrl does not make an object public. This endpoint follows the existing public/no-auth category API policy. Like the original handler, it validates declared metadata only; it does not enforce uploaded byte size or inspect image contents.

Replace the Next.js signing API call with the backend URL:

```js
async function uploadCategoryImage(file, backendUrl) {
  const response = await fetch(`${backendUrl}/api/categories/image-upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  const uploaded = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploaded.ok) throw new Error('Image upload failed');
  return data.imageUrl; // Include in POST/PATCH category body after upload succeeds.
}
```

Errors: 400 invalid image metadata, 405 unsupported method, 503 missing configuration/credentials, 500 signing failure. Uploading alone does not create or update a category record. After switching frontend callers, remove the old Next.js API route and move its S3 environment configuration to the backend.
