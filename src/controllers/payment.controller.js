const paymentService = require("../services/payment.service");

const success = async (req, res) => {
  const { orderId } = req.query;
  try {
    const payment = await paymentService.success(orderId, req.user);
    res.json({ success: true, message: "Payment successful", orderId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, orderId });
  }
};

const fail = async (req, res) => {
  const { orderId, msg } = req.query;
  try {
    await paymentService.fail(orderId, msg, req.user);
    res.json({ success: false, message: "Payment failed", orderId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, orderId });
  }
};

module.exports = {
  success,
  fail,
};
