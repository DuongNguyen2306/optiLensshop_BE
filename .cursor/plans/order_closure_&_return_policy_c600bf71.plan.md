---
name: Order closure & return policy
overview: Implement safeguards so operations cannot prematurely close delivered orders, and enforce preorder full-deposit with fault-based return/refund outcomes within a fixed return window.
todos:
  - id: status-flow-guard
    content: Add post-delivery confirmation state and completion guard with status history/audit fields.
    status: pending
  - id: auto-complete-job
    content: Implement scheduled auto-complete for eligible delivered-pending-confirm orders after configured timeout, plus optional admin-only manual trigger endpoint.
    status: pending
  - id: preorder-full-deposit
    content: Enforce preorder 100% upfront payment and reject COD/partial-deposit paths.
    status: pending
  - id: pending-payment-window
    content: Add pending-payment order window (TTL) with auto-cancel, reservation release, and per-customer pending-order quota.
    status: pending
  - id: return-fault-decision
    content: Add 5-day return deadline checks and fault-based refund decision fields/logic.
    status: pending
  - id: admin-returns-queue
    content: Add admin return-management APIs (list/detail) with filters, pagination, and strict role guard.
    status: pending
  - id: payment-gateway-unification
    content: Refactor VNPay/MoMo success handling through shared payment service for consistent order/payment state transitions.
    status: pending
  - id: api-docs-tests
    content: Expose/secure new endpoints, update OpenAPI, and add targeted tests for lifecycle, 5-day return policy, admin returns APIs, auto-complete, and payment rules.
    status: pending
isProject: false
---

# Order Closure And Return Policy Plan

## Goals

- Prevent premature order closure by requiring a post-delivery confirmation window before `completed`.
- Enforce preorder as 100% upfront payment (no COD/partial deposit).
- Reduce unpaid/order-spam risk by allowing create-first-pay-later only within a strict pending-payment time window.
- Add time-limited return request flow and fault-based refund decisioning:
  - Shop fault => refund deposit/full paid amount.
  - Customer fault => keep deposit (no refund).
  - Return/refund request allowed only within 5 days from delivery; after 5 days, refund is not allowed.

## Scope And Files

- Status lifecycle and transition guards:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/constants/order-status.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/constants/order-status.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/enum/orderStatus.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/enum/orderStatus.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/models/order.schema.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/models/order.schema.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/ops-order.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/ops-order.service.js)
- Auto-complete scheduler:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/jobs/pending-payment-cleanup.job.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/jobs/pending-payment-cleanup.job.js) (pattern reference)
  - new job file under `src/jobs/` + wire in [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/app.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/app.js)
  - optional internal endpoint in order routes/controller for manual trigger in staging (`POST /orders/auto-complete/run`) with strict admin-only guard
- Preorder payment policy and gateway consistency:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/payment.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/payment.service.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/vnpay.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/vnpay.service.js)
  - related payment controllers/routes
- Pending-payment window and cleanup:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/jobs/pending-payment-cleanup.job.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/jobs/pending-payment-cleanup.job.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/order.service.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/inventory.service.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/services/inventory.service.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/models/order.schema.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/models/order.schema.js)
- Return request and decision API:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/controllers/order.controller.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/controllers/order.controller.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/routes/order.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/routes/order.js)
  - Add admin return-management endpoints (resource-oriented): `GET /admin/returns`, `GET /admin/returns/:returnId`, `POST /orders/:id/return-request`, `POST /orders/:id/returns/:returnId/decision`
- Docs and tests:
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/docs/openapi.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/src/docs/openapi.js)
  - [C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/tests/ops-order.service.test.js](C:/Users/camsa/OneDrive/Documents/optiLensshop_BE1/tests/ops-order.service.test.js) + new focused tests for order/payment flows

## Proposed Functional Design

- Introduce an intermediate post-delivery state (e.g. `delivered_pending_confirm`) to separate “carrier delivered” from “order closed”.
- Order completion paths:
  - Customer confirms receipt -> `completed`.
  - No customer action within configured window (e.g. 48h) -> auto-complete job transitions to `completed`.
  - Add optional admin-only trigger API for controlled/manual execution (primarily staging/ops fallback); production uses scheduler as the primary path.
- Return window:
  - Allow `return_requested` only within 5 days from delivered timestamp.
  - Store and validate delivered/return-request timestamps.
  - If request is submitted after 5 days, reject with explicit policy error (`RETURN_WINDOW_EXPIRED`).
- Fault-based return decision:
  - Add structured decision fields (`fault_party`, `decision_reason`, `decision_by`, `decision_at`, `refund_amount`).
  - Shop fault -> create refund record and transition to refund status.
  - Customer fault -> reject refund and keep deposit (status reflects reviewed outcome).
  - Expose admin review queue and detail view for pending return requests with filters (`status`, `fault_party`, `fromDate`, `toDate`, `orderId`, `customerId`, pagination).
- Preorder payment policy:
  - Force 100% upfront for `pre_order` (`deposit_rate = 1`, `deposit_amount = final_amount`, `remaining_amount = 0`).
  - Reject `cod` for preorder.
  - Normalize VNPay and MoMo success handling via shared payment service logic.
- Pending-payment policy:
  - Allow create-first-pay-later only under `pending_payment` TTL (e.g. 15-30 minutes).
  - Auto-cancel unpaid orders after TTL and release reserved inventory immediately.
  - Enforce per-customer concurrent pending-order quota (e.g. max 2-3).
  - Keep preorder strict: payment must complete within TTL or auto-cancel.

## Rollout Notes

- Keep status migration backward-compatible by handling legacy `delivered` orders in auto-complete/return checks.
- Update reporting logic if dashboards currently treat `delivered` as closed revenue.
- Gate all new operations by role (`customer`, `operations`, `sales`) and append status history entries for auditability.
- Auto-complete trigger endpoint (if enabled) must be `admin` only, idempotent, rate-limited, and auditable (who triggered, when, how many orders affected).
- Define a single config value for return window (`RETURN_WINDOW_DAYS=5`) and use server-side timestamp comparison to avoid timezone disputes.
- Define pending-payment configs (`PENDING_PAYMENT_TTL_MINUTES`, `MAX_PENDING_ORDERS_PER_CUSTOMER`) and apply anti-abuse rate limiting on repeated expirations.

## Validation Strategy

- Unit/service tests for:
  - transition guard (`delivered` cannot be closed directly by ops before confirm window logic),
  - return-window expiration,
  - fault-based refund outcome,
  - preorder full-deposit enforcement and COD rejection,
  - gateway parity (VNPay/MoMo preorder flow).
- API contract tests for new customer confirmation/return endpoints.
- API contract tests for admin return-management endpoints:
  - `GET /admin/returns` supports filtering/pagination and role guard,
  - `GET /admin/returns/:returnId` returns decision history/evidence metadata,
  - decision endpoint updates queue status consistently.
- Tests for auto-complete:
  - scheduled execution transitions only eligible orders,
  - manual trigger endpoint authorization/idempotency (if endpoint is enabled),
  - no transition when return request already exists or window conditions are not met.
- Return policy tests:
  - request at day 5 boundary is accepted,
  - request after day 5 is rejected (`RETURN_WINDOW_EXPIRED`),
  - refund decision API cannot approve refund when return window already expired.
- Pending-payment tests:
  - unpaid order is auto-cancelled at TTL boundary,
  - reservation is released on expiry,
  - customer cannot exceed pending-order quota,
  - successful payment before TTL prevents cancellation.
- OpenAPI update to reflect new statuses and request/response schemas.
