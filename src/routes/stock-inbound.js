const express = require("express");
const stockInboundController = require("../controllers/stockInbound.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();
const opsInboundRoles = ["operations", "manager", "admin"];

router.get("/", authenticate, authorize(opsInboundRoles), stockInboundController.listInbound);
router.get(
  "/:id",
  authenticate,
  authorize(opsInboundRoles),
  stockInboundController.getInboundDetail,
);
router.post(
  "/auto-generate",
  authenticate,
  authorize(opsInboundRoles),
  stockInboundController.autoGenerateInbound,
);
router.patch(
  "/:id/complete",
  authenticate,
  authorize(opsInboundRoles),
  stockInboundController.completeInbound,
);

module.exports = router;
