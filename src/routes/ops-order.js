const express = require("express");
const router = express.Router();

const orderController = require("../controllers/order.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations", "manager", "admin"]),
  orderController.getOpsOrders,
);

router.patch(
  "/:id/start-processing",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations", "manager", "admin"]),
  orderController.startProcessing,
);

router.patch(
  "/:id/fulfill",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations", "manager", "admin"]),
  orderController.fulfillOrder,
);

router.patch(
  "/:id/start-shipping",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations", "manager", "admin"]),
  orderController.startShipping,
);

router.patch(
  "/:id/delivered",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations", "manager", "admin"]),
  orderController.markDelivered,
);

module.exports = router;

