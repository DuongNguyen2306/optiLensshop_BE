const express = require("express");
const router = express.Router();

const returnController = require("../controllers/return.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

/** Duyệt / nhận hàng / từ chối: Ops + quản lý */
const opsRoles = ["operations", "manager", "admin"];
/** Hoàn tiền (cộng kho + cập nhật thanh toán): quản lý & admin */
const refundRoles = ["manager", "admin"];

/**
 * GET /api/admin/returns
 * Danh sách toàn bộ yêu cầu trả hàng.
 * Query: status?, order_id?, condition?, page?, pageSize?
 */
router.get("/", authenticate, authorize(opsRoles), returnController.listReturns);

/**
 * PATCH /api/admin/returns/:id/approve
 * Chấp nhận trả: PENDING → APPROVED
 * Body: { note? }
 */
router.patch(
  "/:id/approve",
  authenticate,
  authorize(opsRoles),
  returnController.approveReturn,
);

/**
 * GET /api/admin/returns/:id
 * Chi tiết một yêu cầu trả hàng.
 */
router.get(
  "/:id",
  authenticate,
  authorize(opsRoles),
  returnController.getReturnDetail,
);

/**
 * PATCH /api/admin/returns/:id/receive
 * Đã nhận hàng & kiểm tra: APPROVED → INSPECTING
 * Body: { condition_at_receipt: "NEW"|"DAMAGED"|"USED", note? }
 */
router.patch(
  "/:id/receive",
  authenticate,
  authorize(opsRoles),
  returnController.receiveReturn,
);

/**
 * PATCH /api/admin/returns/:id/refund
 * Hoàn tiền & hoàn tất: INSPECTING → REFUNDED (cộng kho, payment…)
 */
router.patch(
  "/:id/refund",
  authenticate,
  authorize(refundRoles),
  returnController.completeReturn,
);

/**
 * PATCH /api/admin/returns/:id/complete
 * Alias của refund (giữ tương thích tích hợp cũ).
 */
router.patch(
  "/:id/complete",
  authenticate,
  authorize(refundRoles),
  returnController.completeReturn,
);

/**
 * PATCH /api/admin/returns/:id/reject
 * Từ chối yêu cầu trả hàng.
 * Body: { rejected_reason }
 */
router.patch(
  "/:id/reject",
  authenticate,
  authorize(opsRoles),
  returnController.rejectReturn,
);

module.exports = router;
