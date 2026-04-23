const express = require("express");
const router = express.Router();
const momoController = require("../controllers/momo.controller");

// Tạo thanh toán MoMo
router.post("/create", momoController.createPayment);

// Xử lý return từ MoMo (redirectUrl)
router.get("/return", momoController.handleReturn);

// Xử lý IPN từ MoMo (ipnUrl)
router.post("/ipn", momoController.handleIpn);

module.exports = router;
