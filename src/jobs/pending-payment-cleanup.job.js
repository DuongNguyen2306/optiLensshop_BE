const Order = require("../models/order.schema");
const Payment = require("../models/payment.schema");
const paymentService = require("../services/payment.service");
const orderService = require("../services/order.service");

let running = false;

async function runCleanupOnce() {
  if (running) return;
  running = true;

  try {
    const timeoutMinutes = Math.max(
      1,
      Number(process.env.PENDING_PAYMENT_TIMEOUT_MINUTES || 30),
    );
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const stalePayments = await Payment.find({
      method: { $in: ["momo", "vnpay"] },
      status: "pending-payment",
    })
      .select("order_id")
      .populate({
        path: "order_id",
        select: "status created_at user_id",
        match: { status: "pending", created_at: { $lte: cutoff } },
      });

    for (const payment of stalePayments) {
      const order = payment.order_id;
      if (!order) continue;

      try {
        await paymentService.fail(order._id);
      } catch (_) {
        // no-op: vẫn thử hủy đơn
      }

      try {
        await orderService.cancelOrder(
          order._id,
          order.user_id,
          "Quá thời gian thanh toán online",
        );
      } catch (_) {
        // no-op: nếu trạng thái không còn hợp lệ thì bỏ qua
      }
    }
  } finally {
    running = false;
  }
}

function startPendingPaymentCleanupJob() {
  const enabled = String(process.env.ENABLE_PENDING_PAYMENT_CLEANUP || "true")
    .trim()
    .toLowerCase();
  if (enabled.toLowerCase() === "false") return;

  const intervalMinutes = Math.max(
    1,
    Number(process.env.PENDING_PAYMENT_CLEANUP_INTERVAL_MINUTES || 5),
  );

  runCleanupOnce().catch(() => null);
  setInterval(() => {
    runCleanupOnce().catch(() => null);
  }, intervalMinutes * 60 * 1000);
}

module.exports = { startPendingPaymentCleanupJob };
