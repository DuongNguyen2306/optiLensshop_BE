const mongoose = require("mongoose");
const ProductVariant = require("../models/productVariant.schema");
const OrderItem = require("../models/orderItem.schema");
const { INVENTORY_PLACEMENT } = require("../constants/order-status");

function variantKey(id) {
  if (!id) return "";
  if (id instanceof mongoose.Types.ObjectId) return id.toString();
  if (typeof id === "object" && id._id) return String(id._id);
  return String(id);
}

/**
 * Gom số lượng theo variant_id (combo tách frame + lens).
 */
function aggregateVariantQuantities(itemsToOrder) {
  const map = new Map();
  const add = (vid, qty) => {
    const k = variantKey(vid);
    if (!k || !qty) return;
    map.set(k, (map.get(k) || 0) + Number(qty));
  };
  for (const line of itemsToOrder) {
    const q = Number(line.quantity || 0);
    if (q <= 0) continue;
    if (line.kind === "combo") {
      add(line.frame_variant_id, q);
      add(line.lens_variant_id, q);
    } else {
      add(line.variant_id, q);
    }
  }
  return map;
}

/**
 * @param {"stock"|"prescription"|"pre_order"} orderType
 */
async function applyOnCheckout(session, orderType, itemsToOrder) {
  const map = aggregateVariantQuantities(itemsToOrder);
  const mode =
    orderType === "pre_order"
      ? INVENTORY_PLACEMENT.RESERVED_ONLY
      : INVENTORY_PLACEMENT.IMMEDIATE_STOCK;

  for (const [variantId, qty] of map.entries()) {
    if (mode === INVENTORY_PLACEMENT.IMMEDIATE_STOCK) {
      const r = await ProductVariant.updateOne(
        { _id: variantId, stock_quantity: { $gte: qty } },
        { $inc: { stock_quantity: -qty } },
        { session },
      );
      if (r.modifiedCount === 0) {
        throw new Error(
          `Không đủ tồn kho thực tế cho biến thể ${variantId} (cần ${qty})`,
        );
      }
    } else {
      await ProductVariant.updateOne(
        { _id: variantId },
        { $inc: { reserved_quantity: qty } },
        { session },
      );
    }
  }
  return mode;
}

/**
 * Hoàn tác khi hủy đơn (customer cancel).
 */
async function releaseOnCancel(order) {
  const items = await OrderItem.find({ order_id: order._id });
  const map = new Map();
  for (const item of items) {
    const k = item.variant_id.toString();
    map.set(k, (map.get(k) || 0) + Number(item.quantity || 0));
  }

  const mode = order.inventory_placement_mode;
  const legacy =
    !order.uses_ops_fulfillment && mode == null;

  for (const [variantId, qty] of map.entries()) {
    if (legacy || mode === INVENTORY_PLACEMENT.RESERVED_ONLY) {
      const r = await ProductVariant.updateOne(
        { _id: variantId, reserved_quantity: { $gte: qty } },
        { $inc: { reserved_quantity: -qty } },
      );
      if (r.modifiedCount === 0) {
        throw new Error(
          `Không đủ reserved_quantity để hoàn tác cho biến thể ${variantId}`,
        );
      }
    } else if (mode === INVENTORY_PLACEMENT.IMMEDIATE_STOCK) {
      await ProductVariant.updateOne(
        { _id: variantId },
        { $inc: { stock_quantity: qty } },
      );
    }
  }
}

/**
 * Ops fulfill: đơn reserved_only — giảm reserved + trừ stock thực xuất kho.
 * Đơn immediate_stock — chỉ ghi nhận hoàn tất gia công (stock đã trừ lúc đặt).
 */
async function applyFulfillmentStockOut(session, order) {
  if (order.inventory_placement_mode !== INVENTORY_PLACEMENT.RESERVED_ONLY) {
    return;
  }
  const items = await OrderItem.find({ order_id: order._id }).session(session);
  const map = new Map();
  for (const item of items) {
    const k = item.variant_id.toString();
    map.set(k, (map.get(k) || 0) + Number(item.quantity || 0));
  }

  for (const [variantId, qty] of map.entries()) {
    const decReserved = await ProductVariant.updateOne(
      { _id: variantId, reserved_quantity: { $gte: qty } },
      { $inc: { reserved_quantity: -qty } },
      { session },
    );
    if (decReserved.modifiedCount === 0) {
      throw new Error(
        `Không đủ reserved_quantity để xuất kho cho biến thể ${variantId}`,
      );
    }
    const decStock = await ProductVariant.updateOne(
      { _id: variantId, stock_quantity: { $gte: qty } },
      { $inc: { stock_quantity: -qty } },
      { session },
    );
    if (decStock.modifiedCount === 0) {
      throw new Error(
        `Không đủ stock_quantity khi hoàn tất gia công cho biến thể ${variantId} — kiểm tra nhập kho`,
      );
    }
  }
}

/**
 * Pre-order: Ops bắt đầu gia công — mọi biến thể trên đơn phải đủ stock.
 */
async function assertMaterialsAvailableForPreOrder(session, orderId) {
  const order = await mongoose.model("Order").findById(orderId).session(session);
  if (!order || order.order_type !== "pre_order") return;

  const items = await OrderItem.find({ order_id: orderId }).session(session);
  const map = new Map();
  for (const item of items) {
    const k = item.variant_id.toString();
    map.set(k, (map.get(k) || 0) + Number(item.quantity || 0));
  }

  for (const [variantId, need] of map.entries()) {
    const v = await ProductVariant.findById(variantId)
      .session(session)
      .select("stock_quantity");
    if (!v) throw new Error(`Không tìm thấy biến thể ${variantId}`);
    const stock = Number(v.stock_quantity || 0);
    if (stock < need) {
      throw new Error(
        `Chưa đủ vật tư trong kho cho biến thể ${variantId}: có ${stock}, cần ${need} — vui lòng nhập hàng`,
      );
    }
  }
}

module.exports = {
  applyOnCheckout,
  releaseOnCancel,
  applyFulfillmentStockOut,
  assertMaterialsAvailableForPreOrder,
  aggregateVariantQuantities,
  INVENTORY_PLACEMENT,
};
