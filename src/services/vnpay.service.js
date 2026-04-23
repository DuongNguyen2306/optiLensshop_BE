const { VNPay, VnpLocale } = require("vnpay");
const paymentSchema = require("../models/payment.schema");

exports.createPaymentUrl = async (orderId, amount) => {
  const vnp = new VNPay({
    tmnCode: process.env.VNP_TMN_CODE,
    secureSecret: process.env.VNP_HASH_SECRET,
    vnpayHost: process.env.VNP_URL,
    testMode: true,
  });
  const paymentUrl = await vnp.createPaymentUrl({
    vnp_Amount: amount,
    vnp_IpAddr: "127.0.0.1",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: `Thanh toán đơn hàng #${orderId}`,
    vnp_OrderType: "other",
    vnp_ReturnUrl: process.env.VNP_RETURN_URL,
    vnp_Locale: VnpLocale.VN,
  });
  return paymentUrl;
};

exports.verifyPayment = async (query) => {
  const vnp = new VNPay({
    tmnCode: process.env.VNP_TMN_CODE,
    secureSecret: process.env.VNP_HASH_SECRET,
    vnpayHost: process.env.VNP_URL,
    testMode: true,
  });
  const result = await vnp.verifyPayment(query);
  if (result.isSuccess) {
    const payment = await paymentSchema.findOne({ order_id: query.vnp_TxnRef });
    if (!payment) {
      return {
        isSuccess: false,
        message: "Không tìm thấy thanh toán",
      };
    }
    payment.status = "paid";
    await payment.save();
    return {
      isSuccess: true,
      message: "Thanh toán thành công",
      result: result,
    };
  } else {
    const payment = await paymentSchema.findOne({ order_id: query.vnp_TxnRef });
    if (!payment) {
      return {
        isSuccess: false,
        message: "Không tìm thấy thanh toán",
      };
    }
    payment.status = "failed";
    await payment.save();
    return {
      isSuccess: false,
      message: "Thanh toán thất bại",
      result: result,
    };
  }
};
