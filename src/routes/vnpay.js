const express = require("express");
const router = express.Router();
const vnpayController = require("../controllers/vnpay.controller");

router.post("/create", vnpayController.createPayment);
router.get("/verify", vnpayController.verifyPayment);

module.exports = router;
