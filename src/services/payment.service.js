const Payment = require("../models/payment.schema");
const Order = require("../models/order.schema");
const cartService = require("./cart.service");

exports.success = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Không tìm thấy đơn hàng");
    }
    const payment = await Payment.findOne({ order_id: orderId });
    if (!payment) {
      throw new Error("Không tìm thấy thanh toán");
    }

    // Idempotent: đã paid/deposit-paid thì không cập nhật lại.
    if (["paid", "deposit-paid"].includes(payment.status)) {
      return payment;
    }

    // Pre-order theo pha thanh toán
    if (order.order_type === "pre_order" && order.payment_phase === "deposit") {
      payment.status = "deposit-paid";
      order.payment_phase = "remaining";
    } else {
      payment.status = "paid";
      if (order.payment_phase !== "full") {
        order.payment_phase = "full";
      }
      order.remaining_amount = 0;
    }
    payment.paid_at = new Date();
    await order.save();
    await payment.save();
    try {
      await cartService.subtractCartLinesForOrder(orderId);
    } catch (e) {
      console.error("subtractCartLinesForOrder", orderId, e);
    }
    return payment;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

exports.fail = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Không tìm thấy đơn hàng");
    }

    const payment = await Payment.findOne({ order_id: orderId });
    if (!payment) {
      throw new Error("Không tìm thấy thanh toán");
    }
    if (payment.status === "failed") {
      return payment;
    }
    payment.status = "failed";
    await payment.save();
    return payment;
  } catch (error) {
    console.log(error);
    throw error;
  }
};
