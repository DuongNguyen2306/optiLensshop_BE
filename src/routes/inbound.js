const express = require("express");
const inboundController = require("../controllers/inbound.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

// Người được tạo / sửa nháp / nhận hàng / chốt
const opsRoles = ["operations", "manager", "admin"];
// Người được duyệt / từ chối / hủy sau APPROVED
const approverRoles = ["manager", "admin"];

router.get("/", authenticate, authorize(opsRoles), inboundController.list);
router.get(
  "/ledger",
  authenticate,
  authorize(opsRoles),
  inboundController.listLedger,
);
router.get("/:id", authenticate, authorize(opsRoles), inboundController.getDetail);

router.post("/", authenticate, authorize(opsRoles), inboundController.createDraft);
router.put(
  "/:id",
  authenticate,
  authorize(opsRoles),
  inboundController.updateDraft,
);

router.post(
  "/:id/submit",
  authenticate,
  authorize(opsRoles),
  inboundController.submit,
);
router.post(
  "/:id/approve",
  authenticate,
  authorize(approverRoles),
  inboundController.approve,
);
router.post(
  "/:id/reject",
  authenticate,
  authorize(approverRoles),
  inboundController.reject,
);
router.post(
  "/:id/cancel",
  authenticate,
  authorize(approverRoles),
  inboundController.cancel,
);
router.post(
  "/:id/receive",
  authenticate,
  authorize(opsRoles),
  inboundController.receive,
);
router.post(
  "/:id/complete",
  authenticate,
  authorize(opsRoles),
  inboundController.complete,
);

module.exports = router;
