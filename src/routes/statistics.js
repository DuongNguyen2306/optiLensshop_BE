const express = require("express");
const statisticsController = require("../controllers/statistics.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/overview",
  authenticate,
  authorize(["manager", "admin"]),
  statisticsController.getOverviewStats,
);

router.get(
  "/admin",
  authenticate,
  authorize(["admin"]),
  statisticsController.getAdminStats,
);

router.get(
  "/timeseries",
  authenticate,
  authorize(["manager", "admin"]),
  statisticsController.getTimeSeriesStats,
);

router.get(
  "/top-products",
  authenticate,
  authorize(["manager", "admin"]),
  statisticsController.getTopProductsStats,
);

router.get(
  "/inventory-alerts",
  authenticate,
  authorize(["manager", "admin"]),
  statisticsController.getInventoryAlertsStats,
);

router.get(
  "/funnel",
  authenticate,
  authorize(["manager", "admin"]),
  statisticsController.getFunnelStats,
);

module.exports = router;
