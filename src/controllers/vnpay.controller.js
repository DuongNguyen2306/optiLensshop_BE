const vnpayService = require("../services/vnpay.service");

exports.createPayment = async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    const paymentUrl = await vnpayService.createPaymentUrl(orderId, amount);
    res.json({ paymentUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.verifyPayment = async (req, res) => {
  try {
    const result = await vnpayService.verifyPayment(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
