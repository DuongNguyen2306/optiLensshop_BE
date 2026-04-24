const express = require("express");
const router = express.Router();

const orderController = require("../controllers/order.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.getOrderListCustomer,
);

router.get(
  "/all",
  authMiddleware.authenticate,
  authMiddleware.authorize(["sales", "manager", "operations", "admin"]),
  orderController.getOrderListShop,
);

router.get("/:id", authMiddleware.authenticate, orderController.getOrderDetail);

// Đặt hàng (checkout)
router.post(
  "/checkout",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.checkout,
);

// Customer preorder ngay (không qua giỏ hàng)
router.post(
  "/preorder-now",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.preorderNow,
);

// Sale xác nhận đơn hàng
router.post(
  "/:id/confirm",
  authMiddleware.authenticate,
  authMiddleware.authorize(["sales"]),
  orderController.confirmOrder,
);

// Customer hủy đơn hàng
router.put(
  "/:id/cancel",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.cancelOrder,
);

router.put(
  "/:id/confirm-received",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.confirmReceived,
);
router.put(
  "/:id/report-not-received",
  authMiddleware.authenticate,
  authMiddleware.authorize(["customer"]),
  orderController.reportNotReceived,
);

router.put(
  "/:id/status",
  authMiddleware.authenticate,
  authMiddleware.authorize(["operations"]),
  orderController.updateStatus,
);

module.exports = router;
