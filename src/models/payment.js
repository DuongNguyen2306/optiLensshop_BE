const express = require("express");
const paymentController = require("../controllers/payment.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();
router.get("/success", authMiddleware.authenticate, paymentController.success);
router.get("/fail", authMiddleware.authenticate, paymentController.fail);

module.exports = router;
