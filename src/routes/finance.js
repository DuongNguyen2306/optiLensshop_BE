const express = require("express");
const router = express.Router();
const financeController = require("../controllers/finance.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const financeRoles = ["manager", "admin"];

/** Báo cáo tổng quan thu — chi — hoàn — ước lượng lãi */
router.get(
  "/summary",
  authenticate,
  authorize(financeRoles),
  financeController.getSummary,
);

/** Chi tiết doanh thu: payment theo method+status, đơn theo status */
router.get(
  "/revenue/breakdown",
  authenticate,
  authorize(financeRoles),
  financeController.getRevenueBreakdown,
);

/** Dòng tiền theo ngày/tuần/tháng (tiền vào vs chi) */
router.get(
  "/cashflow",
  authenticate,
  authorize(financeRoles),
  financeController.getCashflow,
);

/** Đơn đã giao/hoàn tất trong kỳ (đối soát doanh thu) */
router.get(
  "/revenue/orders",
  authenticate,
  authorize(financeRoles),
  financeController.getRevenueOrders,
);

/** Danh sách hoàn tiền đã hoàn tất trong kỳ */
router.get(
  "/refunds",
  authenticate,
  authorize(financeRoles),
  financeController.getRefundsList,
);

/** Tổng chi theo danh mục */
router.get(
  "/expenses/by-category",
  authenticate,
  authorize(financeRoles),
  financeController.getExpenseSummaryByCategory,
);

/** Đối soát số lượng nhập kho vs sổ InventoryLedger */
router.get(
  "/reconciliation/inventory",
  authenticate,
  authorize(financeRoles),
  financeController.getInventoryReconciliation,
);

/** CRUD phiếu chi */
router.post(
  "/expenses",
  authenticate,
  authorize(financeRoles),
  financeController.createExpense,
);

router.get(
  "/expenses",
  authenticate,
  authorize(financeRoles),
  financeController.listExpenses,
);

router.get(
  "/expenses/:id",
  authenticate,
  authorize(financeRoles),
  financeController.getExpenseById,
);

router.patch(
  "/expenses/:id",
  authenticate,
  authorize(financeRoles),
  financeController.updateExpense,
);

router.delete(
  "/expenses/:id",
  authenticate,
  authorize(financeRoles),
  financeController.voidExpense,
);

module.exports = router;
