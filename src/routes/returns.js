const express = require("express");
const router = express.Router();

const returnController = require("../controllers/return.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

/**
 * POST /returns
 * Khách hàng gửi yêu cầu trả hàng.
 * Body: { order_id, return_reason, reason_category?, items: [{ order_item_id, quantity }] }
 */
router.post(
  "/",
  authenticate,
  authorize(["customer"]),
  returnController.requestReturn,
);

/**
 * GET /returns/my
 * Khách hàng xem danh sách yêu cầu trả hàng của mình.
 * Query: status?, page?, pageSize?
 */
router.get(
  "/my",
  authenticate,
  authorize(["customer"]),
  returnController.listMyReturns,
);

module.exports = router;
