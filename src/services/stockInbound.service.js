const mongoose = require("mongoose");
const StockInbound = require("../models/stockInbound.schema");
const ProductVariant = require("../models/productVariant.schema");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

function todayPrefix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function generateInboundCode() {
  const prefix = `PNK-${todayPrefix()}-`;
  const latest = await StockInbound.findOne({
    inbound_code: { $regex: `^${prefix}` },
  })
    .sort({ inbound_code: -1 })
    .select("inbound_code")
    .lean();

  const nextSeq = latest
    ? Number(String(latest.inbound_code).slice(prefix.length) || 0) + 1
    : 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

function normalizeItems(items = []) {
  const merged = new Map();
  for (const item of items) {
    const variantId = String(item.variant_id || "").trim();
    const quantity = Number(item.quantity || 0);
    const importPrice = Number(item.import_price || 0);
    if (!mongoose.Types.ObjectId.isValid(variantId) || quantity <= 0) continue;
    const key = variantId;
    if (!merged.has(key)) {
      merged.set(key, { variant_id: key, quantity: 0, import_price: importPrice });
    }
    const current = merged.get(key);
    current.quantity += quantity;
    current.import_price = importPrice;
  }
  return Array.from(merged.values());
}

function computeTotalValue(items = []) {
  return items.reduce(
    (acc, item) => acc + Number(item.quantity || 0) * Number(item.import_price || 0),
    0,
  );
}

async function autoGenerateInbound(orderIds = [], actorId) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new Error("orderIds không hợp lệ");
  }

  const orderObjectIds = orderIds.map(toObjectId).filter(Boolean);
  if (orderObjectIds.length === 0) {
    throw new Error("Danh sách orderIds không có ID hợp lệ");
  }

  const orders = await Order.find({
    _id: { $in: orderObjectIds },
    status: { $in: ["confirmed", "processing"] },
    $or: [{ order_type: "pre_order" }, { awaiting_stock: true }],
  })
    .select("_id")
    .lean();

  if (orders.length === 0) {
    throw new Error("Không có đơn hợp lệ để tạo phiếu nhập");
  }

  const validOrderIds = orders.map((o) => o._id);
  const orderItems = await OrderItem.find({ order_id: { $in: validOrderIds } })
    .select("variant_id quantity")
    .lean();
  if (orderItems.length === 0) {
    throw new Error("Không tìm thấy sản phẩm trong các đơn đã chọn");
  }

  const grouped = new Map();
  for (const item of orderItems) {
    const key = String(item.variant_id);
    grouped.set(key, (grouped.get(key) || 0) + Number(item.quantity || 0));
  }

  const items = Array.from(grouped.entries()).map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
    import_price: 0,
  }));

  const inbound = await StockInbound.create({
    inbound_code: await generateInboundCode(),
    type: "PURCHASE",
    status: "PENDING",
    items,
    total_value: computeTotalValue(items),
    reference_orders: validOrderIds,
    created_by: actorId,
  });

  return StockInbound.findById(inbound._id)
    .populate("items.variant_id", "sku price images product_id")
    .populate("reference_orders", "_id status order_type created_at")
    .lean();
}

async function isOrderFullyAllocated(orderId, allocationByOrderAndVariant, session) {
  const orderItems = await OrderItem.find({ order_id: orderId })
    .select("variant_id quantity")
    .session(session);

  for (const item of orderItems) {
    const variantKey = String(item.variant_id);
    const required = Number(item.quantity || 0);
    const allocated = Number(allocationByOrderAndVariant.get(`${orderId}:${variantKey}`) || 0);
    if (allocated < required) return false;
  }
  return true;
}

async function completeInbound(inboundId, actorId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const inbound = await StockInbound.findById(inboundId).session(session);
    if (!inbound) throw new Error("Không tìm thấy phiếu nhập");
    if (inbound.status !== "PENDING") {
      throw new Error("Phiếu nhập đã hoàn tất hoặc không hợp lệ");
    }
    if (!Array.isArray(inbound.items) || inbound.items.length === 0) {
      throw new Error("Phiếu nhập không có sản phẩm");
    }

    const allocationSummary = [];
    const allocationByOrderAndVariant = new Map();
    const touchedOrderIds = new Set();

    for (const item of inbound.items) {
      const variantId = String(item.variant_id);
      const receivedQty = Number(item.quantity || 0);
      if (receivedQty <= 0) continue;

      const variantBefore = await ProductVariant.findById(variantId)
        .session(session)
        .select("stock_quantity reserved_quantity");
      if (!variantBefore) {
        throw new Error(`Không tìm thấy biến thể ${variantId}`);
      }

      const stockBefore = Number(variantBefore.stock_quantity || 0);
      const reservedBefore = Number(variantBefore.reserved_quantity || 0);

      await ProductVariant.updateOne(
        { _id: variantId },
        { $inc: { stock_quantity: receivedQty } },
        { session },
      );

      let remainingToAllocate = receivedQty;
      let allocatedQty = 0;

      const candidateOrders = await Order.find({
        status: "confirmed",
        $or: [{ order_type: "pre_order" }, { awaiting_stock: true }],
      })
        .sort({ created_at: 1 })
        .select("_id")
        .session(session);

      for (const order of candidateOrders) {
        if (remainingToAllocate <= 0) break;
        const orderItem = await OrderItem.findOne({
          order_id: order._id,
          variant_id: variantId,
        })
          .select("quantity")
          .session(session);
        if (!orderItem) continue;

        const needQty = Number(orderItem.quantity || 0);
        if (needQty <= 0) continue;

        const allocatedForOrderVariant =
          Number(allocationByOrderAndVariant.get(`${order._id}:${variantId}`) || 0);
        const stillNeeded = Math.max(0, needQty - allocatedForOrderVariant);
        if (stillNeeded <= 0) continue;

        const allocateNow = Math.min(stillNeeded, remainingToAllocate);
        if (allocateNow <= 0) continue;

        allocationByOrderAndVariant.set(
          `${order._id}:${variantId}`,
          allocatedForOrderVariant + allocateNow,
        );
        remainingToAllocate -= allocateNow;
        allocatedQty += allocateNow;
        touchedOrderIds.add(String(order._id));
      }

      const stockAfter = stockBefore + receivedQty;
      const reservedAfter = reservedBefore;

      await InventoryLedger.create(
        [
          {
            variant_id: variantId,
            event_type: "inbound_completed",
            quantity_delta: receivedQty,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reserved_before: reservedBefore,
            reserved_after: reservedAfter,
            note: `Nhập hàng từ phiếu ${inbound.inbound_code}: +${receivedQty} stock. Auto-allocate ${allocatedQty}, còn dư ${Math.max(0, receivedQty - allocatedQty)}.`,
            ref_type: "stock_inbound",
            ref_id: inbound._id,
            created_by: actorId,
          },
        ],
        { session },
      );

      allocationSummary.push({
        variant_id: item.variant_id,
        received_qty: receivedQty,
        allocated_qty: allocatedQty,
        unallocated_qty: Math.max(0, receivedQty - allocatedQty),
      });
    }

    for (const orderId of touchedOrderIds) {
      const order = await Order.findById(orderId).session(session);
      if (!order || order.status !== "confirmed") continue;

      const fullyAllocated = await isOrderFullyAllocated(
        order._id,
        allocationByOrderAndVariant,
        session,
      );
      if (!fullyAllocated) continue;

      order.status = "processing";
      order.status_history = Array.isArray(order.status_history) ? order.status_history : [];
      order.status_history.push({
        action: "PROCESSING",
        actor: actorId || null,
        at: new Date(),
      });
      await order.save({ session });
    }

    inbound.status = "COMPLETED";
    inbound.completed_by = actorId || null;
    inbound.completed_at = new Date();
    inbound.allocation_summary = allocationSummary;
    inbound.total_value = computeTotalValue(inbound.items);
    await inbound.save({ session });

    await session.commitTransaction();
    return StockInbound.findById(inbound._id)
      .populate("items.variant_id", "sku price images product_id")
      .populate("allocation_summary.variant_id", "sku")
      .populate("reference_orders", "_id status order_type created_at")
      .lean();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function listInbound(filter = {}) {
  const page = Math.max(1, Number(filter.page || 1));
  const pageSize = Math.max(1, Number(filter.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const match = {};
  if (filter.status) match.status = String(filter.status).toUpperCase();
  if (filter.type) match.type = String(filter.type).toUpperCase();

  const total = await StockInbound.countDocuments(match);
  const data = await StockInbound.find(match)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .populate("created_by", "email role")
    .populate("completed_by", "email role")
    .lean();

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

async function getInboundDetail(id) {
  const inbound = await StockInbound.findById(id)
    .populate("items.variant_id", "sku price images stock_quantity reserved_quantity product_id")
    .populate("allocation_summary.variant_id", "sku product_id")
    .populate("reference_orders", "_id status order_type created_at")
    .populate("created_by", "email role")
    .populate("completed_by", "email role")
    .lean();

  if (!inbound) throw new Error("Không tìm thấy phiếu nhập");
  return inbound;
}

module.exports = {
  autoGenerateInbound,
  completeInbound,
  listInbound,
  getInboundDetail,
};
