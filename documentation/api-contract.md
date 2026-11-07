# API contract (v1)

This document is the contract between `apps/api`, `apps/storefront` and `apps/admin`. Change it only together with the code.

- Base: `http://localhost:4000/api/v1`. In dev, both Vite apps proxy `/api` and `/uploads` to `:4000`, so the browser is always same-origin.
- Swagger: `/api/docs`. Health: `GET /api/v1/health` → `{ status, db }`.
- Money is **integer KES cents** everywhere (`priceCents`, `totalCents`, ...). Phones are E.164 (`+2547…`).
- Validation uses the zod schemas in `@dantes/shared`. Errors look like `{ statusCode, error, message, issues?: [{ path, message }] }`.
- IDs are cuid strings. Lists are plain arrays unless they are paginated: `{ items, total, page, pageSize }` with `?page=&pageSize=`.

## Auth

- Staff: `POST /auth/staff/login {email,password}` sets the httpOnly cookie `dp_staff` (JWT, 12h). `POST /auth/staff/logout`. `GET /auth/staff/me` → `{ id, name, email, role }`.
- Customer: `POST /auth/customer/register`, `POST /auth/customer/login`, `POST /auth/customer/logout`, `GET /auth/customer/me`, `POST /auth/customer/forgot-password {email}`, `POST /auth/customer/reset-password {token,password}`. Cookie: `dp_customer`.
- Roles: OWNER > MANAGER > ORDER_STAFF / KITCHEN.
  - KITCHEN: read orders, set PREPARING/READY.
  - ORDER_STAFF: orders + payments read.
  - MANAGER: everything except staff and settings.
  - OWNER: everything.
- Login is rate limited.

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/public/settings` | `{ name, phone, whatsappPhone, orderLinePhone, email, address, mapUrl, deliveryEnabled, collectionEnabled, pricesIncludeVat, vatRateBps, packagingFeeCents, defaultMaxExtraToppings, hours: OpeningHoursDay[], closures (next 30 days), ordering: OrderingState, pauseMessage }` |
| GET | `/public/menu` | `{ categories: [{id,name,slug}], sizes: [{id,code,name,inches}], crusts: [{id,name,description,adjustments:[{sizeId,adjustmentCents}]}], toppingGroups: [{id,name,surchargeCents}], products: ProductPublic[] }`. Only available, non-archived items. Sorted by sortOrder. |
| GET | `/public/products/:slug` | `ProductPublic` |
| GET | `/public/delivery-zones` | active zones `[{id,name,description,feeCents,minOrderCents,freeDeliveryFromCents,etaMinMinutes,etaMaxMinutes}]` |

`ProductPublic = { id, slug, name, description, imageUrl, featured, categoryId, maxExtraToppings, prices: [{sizeId, priceCents}], defaultIngredients: Ingredient[], extraIngredients: Ingredient[] }`
`Ingredient = { id, slug, name, description, groupId, surchargeCents (resolved), modelKey, color }`

## Cart

The guest cart token is created by `POST /cart` → `{ token, ...Cart }`. The storefront keeps it in localStorage and sends the `X-Cart-Token` header. A logged-in customer's cart is attached on login.

| Method | Path | Body |
| --- | --- | --- |
| POST | `/cart` | – |
| GET | `/cart` | – |
| POST | `/cart/items` | `CartItemInput` |
| PATCH | `/cart/items/:id` | partial `CartItemInput` |
| DELETE | `/cart/items/:id` | – |
| POST | `/cart/quote` | `{ fulfilment, deliveryZoneId? }` → `OrderPrice` (shared `priceOrder` result) |

`Cart = { token, items: [{ id, productId, productName, productSlug, imageUrl, sizeId, sizeName, crustId, crustName, quantity, added: Ingredient[], removed: Ingredient[], unitPriceCents, lineTotalCents, notes, unavailable: boolean }], subtotalCents }`. Prices are always recomputed server-side.

## Checkout and orders

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/checkout` | `CheckoutInput` + `X-Cart-Token`. Validates hours/pause, zone, minimum, availability. Creates Order (PENDING_PAYMENT) + snapshot items + Payment; starts payment. → `{ order: OrderPublic, payment: { id, method, status, redirectUrl? (card), instructions? (mpesa) } }`. Cart is emptied once the order is created. |
| GET | `/orders/:reference?phone=+254…` | Guest lookup (reference + phone must match), or the customer cookie owner. → `OrderPublic` |
| GET | `/orders/:reference/payment-status` | `{ status, orderStatus }`, polled by the confirmation page every 3 s |
| POST | `/orders/:reference/retry-payment` | `{ method, mpesaPhone? }` only when PENDING_PAYMENT / PAYMENT_FAILED |
| GET | `/account/orders` | customer cookie |

`OrderPublic = { reference, status, fulfilment, zoneName, address, items: [{productName,sizeName,crustName,toppings,quantity,unitPriceCents,lineTotalCents}], subtotalCents, deliveryFeeCents, packagingFeeCents, vatCents, totalCents, paymentMethod, etaMinMinutes, etaMaxMinutes, createdAt, history: [{toStatus, createdAt}] }`

## Payment provider callbacks

- `POST /payments/mpesa/callback/:secret`: Daraja STK callback. Checks that the path secret matches `MPESA_CALLBACK_SECRET`. The result is confirmed with an STK Query (live mode) before marking the payment paid. Always replies `{ResultCode:0}`.
- `POST /payments/paystack/webhook`: verifies `x-paystack-signature` (HMAC-SHA512) and then calls verify-transaction.
- `GET /payments/paystack/return?reference=`: redirects to `STOREFRONT_URL/order/:reference`.
- Mock mode only (`PAYMENTS_MODE=mock`): `POST /payments/mock/:paymentId/complete {success:boolean}`. The storefront shows "Simulate payment" buttons when `/public/settings` contains `paymentsMode: "mock"`.
- Idempotency: `PaymentEvent.eventKey` is unique, so duplicates are no-ops. The amount, currency and reference are checked against the Payment. Only verified success moves the order to PAID.

## Admin (`/admin/*`, staff cookie required)

| Resource | Endpoints |
| --- | --- |
| Dashboard | `GET /admin/overview?from&to` → `{ ordersToday, revenueTodayCents, activeOrders, pendingPayments, avgOrderValueCents, topProducts:[{name,quantity,revenueCents}], revenueByDay:[{date,revenueCents,orders}] }` |
| Orders | `GET /admin/orders?status&payment&from&to&q&page`, `GET /admin/orders/:id` (incl. payments, history, notifications), `PATCH /admin/orders/:id/status {status,note}` (ORDER_TRANSITIONS), `GET /admin/orders/stream` (SSE `order.created`/`order.updated`) |
| Products | `GET/POST /admin/products`, `GET/PUT/DELETE /admin/products/:id` (DELETE = archive), `PATCH /admin/products/:id/availability {available}`, `POST /admin/products/reorder {ids:[]}`, `POST /admin/uploads/image` (multipart `file`) → `{ url }` |
| Categories | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id`, `POST /admin/categories/reorder` |
| Ingredients | `GET/POST /admin/ingredients`, `PUT/DELETE /admin/ingredients/:id`; `GET/POST /admin/topping-groups`, `PUT/DELETE /admin/topping-groups/:id` |
| Sizes and crusts | `GET/POST /admin/sizes`, `PUT/DELETE /admin/sizes/:id`; `GET/POST /admin/crusts`, `PUT/DELETE /admin/crusts/:id` |
| Pricing | `GET /admin/pricing` → `{ sizes, products:[{id,name,prices}], crusts:[{id,name,adjustments}], toppingGroups, ingredients:[{id,name,groupId,surchargeCents}], settings:{vatRateBps,pricesIncludeVat,packagingFeeCents} }`; `PUT /admin/pricing` with the same shape (partial allowed). One transaction, one audit entry. |
| Delivery | `GET/POST /admin/delivery-zones`, `PUT/DELETE /admin/delivery-zones/:id`, `POST /admin/delivery-zones/reorder` |
| Payments | `GET /admin/payments?status&method&from&to&q&page`, `GET /admin/payments/:id` (incl. events), `GET /admin/payments/reconciliation?date=` → `{ byMethod:[{method,count,amountCents}], unmatched: Payment[], paidOrdersWithoutPayment: [] }` |
| Customers | `GET /admin/customers?q&page`, `GET /admin/customers/:id` (with orders) |
| Reports | `GET /admin/reports/sales?from&to&groupBy=day|week|month`, `GET /admin/reports/products?from&to`, `GET /admin/reports/export.csv?from&to` |
| Staff (OWNER) | `GET/POST /admin/staff`, `PUT /admin/staff/:id`, `POST /admin/staff/:id/deactivate` |
| Audit | `GET /admin/audit?entity&userId&page` |
| Settings | `GET/PUT /admin/settings` (`restaurantSettingsSchema`); `GET/PUT /admin/settings/hours` (`openingHoursSchema`); `GET/POST /admin/settings/closures`, `DELETE /admin/settings/closures/:id`; `GET /admin/settings/notifications` → `{ channels:[{channel,enabled,configured:boolean}], settings: NotificationSetting[], templates: NotificationTemplate[] }`; `PUT /admin/settings/notifications/channels`, `PUT /admin/settings/notifications/settings` (array), `PUT /admin/settings/notifications/templates/:channel/:event/:audience`, `POST /admin/settings/notifications/test {channel,recipient}`, `POST /admin/settings/notifications/preview {body}` → `{ rendered }` |

Every admin mutation writes to `AuditLog` (before/after).

## Contract changes (implemented by apps/api)

1. `GET /orders/:reference/payment-status` returns `{ status, orderStatus, paymentId }` (latest payment; `status` and `paymentId` are `null` when no payment exists).
2. `GET /public/settings` includes `paymentsMode: "mock" | "live"`.
3. `POST /orders/:reference/retry-payment` returns the same `{ order, payment: { id, method, status, redirectUrl?, instructions? } }` shape as `POST /checkout`.
4. `status` (and `payment` on orders) filters on `GET /admin/orders` and `GET /admin/payments` accept comma-separated values (`status=ACCEPTED,PREPARING,READY`); `method` on payments does too.
5. Admin lists return `{ items, total, page, pageSize }`.
   - Orders row: `{ id, reference, status, fulfilment, totalCents, createdAt, paymentMethod, paymentStatus, customer: { name, phone } }`.
   - Order detail: the OrderPublic fields plus `id`, `customer { id, name, phone, email }`, `customerNotes`, `paidAt`, `address { line1, landmark, notes }`, `payments[]` (with `events`), `history[{ fromStatus, toStatus, note, createdAt, actorName }]`, `notifications[]`.
   - Customers row: `{ id, name, phone, email, createdAt, orderCount, totalSpentCents }`; detail adds `addresses` and `orders`.
   - Audit row: `{ id, createdAt, action, entity, entityId, userName, before, after }`.
   - Staff rows (plain array): `{ id, name, email, role, active, lastLoginAt, createdAt }`.
6. `GET /admin/reports/sales` returns `[{ period, orders, revenueCents, avgOrderCents }]`; `GET /admin/reports/products` returns `[{ productId, name, quantity, revenueCents }]`.
7. SSE `/admin/orders/stream` emits named events `order.created` / `order.updated` with JSON data `{ id, reference, status, fulfilment, totalCents }`, plus a `ping` event every 25 s.
8. Notification settings: `PUT .../channels` takes `[{channel,enabled}]` (a single object is also accepted), `PUT .../settings` takes the full array of `{channel,event,audience,enabled}`, `PUT .../templates/:channel/:event/:audience` takes `{subject, body}` (channel/event/audience in the body are ignored; the URL wins). `PUT /admin/settings` accepts the full `restaurantSettingsSchema` object (a partial is also accepted; only the keys sent are changed).
9. `PUT /admin/pricing`: a product (or crust) listed with `prices` (or `adjustments`) lacking a size means it is not sold or offered in that size, and that row is deleted.

Additions and notes:
- Errors may carry an extra `code` (`ORDERING_CLOSED`, `FULFILMENT_DISABLED`, `EMPTY_CART`, `ITEMS_UNAVAILABLE`, `ZONE_REQUIRED`, `ZONE_INACTIVE`, `BELOW_MINIMUM`, `INVALID_CART_ITEM`, `CART_NOT_FOUND`, `NOT_PAYABLE`, `INVALID_TRANSITION`, `FORBIDDEN_STATUS`).
- Cart items carry `unavailableReason` when `unavailable` is true. `ProductPublic.maxExtraToppings` is the resolved number.
- Roles: MANAGER has everything except staff, with read-only settings (GET allowed, PUT is OWNER only). ORDER_STAFF: orders, payments (read) and the dashboard overview. KITCHEN: orders read plus PREPARING/READY transitions only.
- Mock mode: card payments have no `redirectUrl`; the storefront uses the simulate buttons. `POST /payments/mock/:paymentId/complete` returns `{ status: "applied"|"duplicate"|"rejected", paymentStatus, orderStatus }`.
- Uploaded images are served at `/uploads/<file>` (JPEG, PNG, WebP, GIF, AVIF; 5 MB max).
