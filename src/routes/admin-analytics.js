const express = require("express");
const financeController = require("../controllers/finance.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/finance",
  authenticate,
  authorize(["admin"]),
  financeController.getAdminFinanceAnalytics,
);

module.exports = router;
