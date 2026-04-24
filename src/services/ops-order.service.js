const mongoose = require("mongoose");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const ProductVariant = require("../models/productVariant.schema");
const Payment = require("../models/payment.schema");
const {
  ORDER_STATUS,
  OPS_VISIBLE_STATUSES,
  OPS_LIST_FILTERABLE_STATUSES,
} = require("../constants/order-status");

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function pushStatusHistory(order, action, actorId) {
  order.status_history = Array.isArray(order.status_history)
    ? order.status_history
    : [];
  order.status_history.push({
    action,
    actor: actorId || null,
    at: new Date(),
  });
}

function isFabricationOrder(order) {
  return (
    Boolean(order?.requires_fabrication) ||
    Boolean(order?.lens_worksheet?.is_custom_made)
  );
}

function assertOpsEligibleOrder(order) {
  if (!order) throw new Error("Không tìm thấy đơn hàng");
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new Error("Đơn đã hủy, không thể thao tác Ops");
  }
  if (!isFabricationOrder(order)) {
    throw new Error("Đơn không thuộc luồng gia công, không hiển thị ở Ops");
  }
}

async function deductStockIfNeededOnShipped(order) {
  if (order.status !== ORDER_STATUS.SHIPPED) return;
  if (order.stock_deducted_at) return;
  if (order.order_type === "pre_order") return;

  const items = await OrderItem.find({ order_id: order._id }).select(
    "variant_id quantity",
  );
  const qtyMap = new Map();
  for (const item of items) {
    const key = String(item.variant_id);
    qtyMap.set(key, (qtyMap.get(key) || 0) + Number(item.quantity || 0));
  }

  for (const [variantId, qty] of qtyMap.entries()) {
    const result = await ProductVariant.updateOne(
      { _id: variantId, stock_quantity: { $gte: qty } },
      { $inc: { stock_quantity: -qty } },
    );
    if (result.modifiedCount === 0) {
      throw new Error(`Không đủ stock_quantity để trừ cho biến thể ${variantId}`);
    }
  }
  order.stock_deducted_at = new Date();
}

async function getOpsOrders(filter = {}) {
  const page = parsePositiveInt(filter.page, 1);
  const pageSize = parsePositiveInt(filter.pageSize, 10);
  const skip = (page - 1) * pageSize;

  const requestedStatus = String(filter.status || "").trim().toLowerCase();
  const statuses = OPS_LIST_FILTERABLE_STATUSES.includes(requestedStatus)
    ? [requestedStatus]
    : OPS_VISIBLE_STATUSES;

  const match = {
    status: { $in: statuses },
    $or: [{ requires_fabrication: true }, { "lens_worksheet.is_custom_made": true }],
  };

  const total = await Order.countDocuments(match);
  const orders = await Order.find(match)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean();

  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ order_id: { $in: orderIds } })
    .populate({
      path: "variant_id",
      select: "sku price images product_id",
      populate: {
        path: "product_id",
        select: "name slug type images",
      },
    })
    .lean();

  const itemMap = new Map();
  for (const item of items) {
    const key = String(item.order_id);
    if (!itemMap.has(key)) itemMap.set(key, []);
    itemMap.get(key).push(item);
  }

  return {
    data: orders.map((order) => ({
      ...order,
      lens_params: order.lens_worksheet || null,
      items: itemMap.get(String(order._id)) || [],
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function startProcessing(orderId, opsUserId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("order id không hợp lệ");
  }

  const order = await Order.findById(orderId);
  assertOpsEligibleOrder(order);
  if (order.status !== ORDER_STATUS.CONFIRMED) {
    throw new Error("Chỉ đơn CONFIRMED mới có thể chuyển PROCESSING");
  }

  order.status = ORDER_STATUS.PROCESSING;
  pushStatusHistory(order, ORDER_STATUS.PROCESSING.toUpperCase(), opsUserId);
  await order.save();
  return order;
}

async function fulfillOrder(orderId, opsUserId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("order id không hợp lệ");
  }
  const order = await Order.findById(orderId);
  assertOpsEligibleOrder(order);
  if (order.status !== ORDER_STATUS.PROCESSING) {
    throw new Error("Chỉ đơn PROCESSING mới có thể chuyển MANUFACTURING/RECEIVED");
  }

  // Prescription bắt buộc qua manufacturing, Pre-order bắt buộc qua received.
  order.status =
    order.order_type === "pre_order"
      ? ORDER_STATUS.RECEIVED
      : ORDER_STATUS.MANUFACTURING;
  order.fulfilled_at = new Date();
  pushStatusHistory(order, order.status.toUpperCase(), opsUserId);
  await order.save();
  return order;
}

async function startShipping(orderId, opsUserId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("order id không hợp lệ");
  }
  const order = await Order.findById(orderId);
  assertOpsEligibleOrder(order);
  if (
    ![
      ORDER_STATUS.PACKED,
      ORDER_STATUS.MANUFACTURING,
      ORDER_STATUS.RECEIVED,
    ].includes(order.status)
  ) {
    throw new Error("Chỉ đơn PACKED mới có thể chuyển SHIPPED");
  }

  // Cho phép Ops dùng route này để đẩy manufacturing/received -> packed -> shipped.
  if ([ORDER_STATUS.MANUFACTURING, ORDER_STATUS.RECEIVED].includes(order.status)) {
    order.status = ORDER_STATUS.PACKED;
    pushStatusHistory(order, ORDER_STATUS.PACKED.toUpperCase(), opsUserId);
  } else {
    order.status = ORDER_STATUS.SHIPPED;
    await deductStockIfNeededOnShipped(order);
    pushStatusHistory(order, ORDER_STATUS.SHIPPED.toUpperCase(), opsUserId);
  }
  await order.save();
  return order;
}

async function markDelivered(orderId, opsUserId) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("order id không hợp lệ");
  }
  const order = await Order.findById(orderId);
  assertOpsEligibleOrder(order);
  if (order.status !== ORDER_STATUS.SHIPPED) {
    throw new Error("Chỉ đơn SHIPPED mới có thể chuyển DELIVERED");
  }

  order.status = ORDER_STATUS.DELIVERED;
  pushStatusHistory(order, ORDER_STATUS.DELIVERED.toUpperCase(), opsUserId);
  await order.save();

  const payment = await Payment.findOne({ order_id: orderId, method: "cod" });
  if (payment && payment.status !== "paid") {
    payment.status = "paid";
    payment.paid_at = new Date();
    await payment.save();
  }
  return order;
}

async function resolveNotReceived(orderId, opsUserId, action, note) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("order id không hợp lệ");
  }

  const normalizedAction = String(action || "")
    .trim()
    .toLowerCase();
  if (!["reship", "refund"].includes(normalizedAction)) {
    throw new Error("action không hợp lệ, chỉ chấp nhận reship hoặc refund");
  }

  const order = await Order.findById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn hàng");
  if (order.status !== ORDER_STATUS.RETURN_REQUESTED) {
    throw new Error(
      "Chỉ đơn RETURN_REQUESTED mới có thể xử lý báo cáo chưa nhận được",
    );
  }

  if (normalizedAction === "reship") {
    order.status = ORDER_STATUS.SHIPPED;
    if (note) order.reject_reason = String(note).trim();
    pushStatusHistory(order, "NOT_RECEIVED_RESOLVED_RESHIP", opsUserId);
    await order.save();
    return order;
  }

  order.status = ORDER_STATUS.REFUNDED;
  if (note) order.reject_reason = String(note).trim();
  pushStatusHistory(order, "NOT_RECEIVED_RESOLVED_REFUND", opsUserId);
  await order.save();

  const payment = await Payment.findOne({ order_id: orderId });
  if (payment && payment.status !== "refunded") {
    payment.status = "refunded";
    await payment.save();
  }

  return order;
}

module.exports = {
  getOpsOrders,
  startProcessing,
  fulfillOrder,
  startShipping,
  markDelivered,
  resolveNotReceived,
};

