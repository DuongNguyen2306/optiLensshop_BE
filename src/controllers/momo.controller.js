const momoService = require("../services/momo.service");
const paymentService = require("../services/payment.service");

// Tạo thanh toán MoMo
exports.createPayment = async (req, res) => {
  try {
    const { amount, orderId, orderInfo, redirectUrl, ipnUrl } = req.body;
    if (!amount || !orderId || !orderInfo || !redirectUrl || !ipnUrl) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const result = await momoService.createMomoPayment({
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.handleReturn = (req, res) => {
  try {
    const result = momoService.verifyMomoReturn(req.query);
    if (result.isSuccess) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/checkout/success?orderId=${req.query.orderId}`,
      );
    } else {
      return res.redirect(
        `${process.env.FRONTEND_URL}/checkout/fail?orderId=${req.query.orderId}&msg=${encodeURIComponent(result.message)}`,
      );
    }
  } catch (err) {
    return res.redirect(`/payment/fail?msg=${encodeURIComponent(err.message)}`);
  }
};

// Xử lý IPN (Instant Payment Notification) từ MoMo
exports.handleIpn = (req, res) => {
  try {
    const result = momoService.verifyMomoReturn(req.body);
    if (result.isSuccess) {
      paymentService
        .success(req.body.orderId)
        .then(() =>
          res.status(200).json({ message: "IPN received", resultCode: 0 }),
        )
        .catch((err) =>
          res.status(400).json({ message: err.message, resultCode: 2 }),
        );
      return;
    } else {
      paymentService.fail(req.body.orderId).catch(() => null);
      return res.status(400).json({ message: result.message, resultCode: 1 });
    }
  } catch (err) {
    return res.status(400).json({ message: err.message, resultCode: 2 });
  }
};
