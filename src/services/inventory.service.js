const mongoose = require("mongoose");
const ProductVariant = require("../models/productVariant.schema");
const OrderItem = require("../models/orderItem.schema");
const InventoryReceipt = require("../models/inventoryReceipt.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");
const { INVENTORY_PLACEMENT } = require("../constants/order-status");
const { createHttpError } = require("../utils/create-http-error");

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
  // Pre-order: không trừ stock, không tăng reserved (tách khỏi tồn kho thực đơn).
  if (orderType === "pre_order") {
    return null;
  }
  const mode = INVENTORY_PLACEMENT.IMMEDIATE_STOCK;

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
  if (order.order_type === "pre_order") {
    return;
  }
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
  if (order.order_type === "pre_order") {
    return;
  }
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
 * Pre-order: không còn bắt buộc đủ stock trước khi xử lý (để tích hợp tương lai gọi an toàn).
 */
async function assertMaterialsAvailableForPreOrder(session, orderId) {
  return;
}

/* -------------------------------------------------------------------------- */
/*  Legacy /inventory: phiếu nhập đơn-variant (draft → confirmed)             */
/* -------------------------------------------------------------------------- */

function ensureValidObjectId(id, label = "id") {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(`${label} không hợp lệ`, 400);
  }
}

async function createReceipt(payload = {}, actor) {
  if (!actor || !actor._id) {
    throw createHttpError("Thiếu thông tin người tạo", 401);
  }

  const { variant_id, qty_in, unit_cost, supplier_name, note } = payload;
  ensureValidObjectId(variant_id, "variant_id");

  const qty = Number(qty_in);
  if (!Number.isFinite(qty) || qty < 1) {
    throw createHttpError("qty_in phải >= 1", 400);
  }

  const cost = unit_cost === undefined ? 0 : Number(unit_cost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw createHttpError("unit_cost không hợp lệ", 400);
  }

  const variant = await ProductVariant.findById(variant_id).select("_id");
  if (!variant) {
    throw createHttpError("Không tìm thấy biến thể sản phẩm", 404);
  }

  const receipt = await InventoryReceipt.create({
    variant_id,
    qty_in: qty,
    unit_cost: cost,
    supplier_name: supplier_name || "",
    note: note || "",
    status: "draft",
    created_by: actor._id,
  });

  return receipt.toObject();
}

async function confirmReceipt(id, actor) {
  ensureValidObjectId(id, "Receipt id");
  if (!actor || !actor._id) {
    throw createHttpError("Thiếu thông tin người xác nhận", 401);
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const receipt = await InventoryReceipt.findById(id).session(session);
    if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
    if (receipt.status !== "draft") {
      throw createHttpError(
        "Chỉ phiếu draft mới được xác nhận",
        400,
      );
    }

    const variantBefore = await ProductVariant.findById(receipt.variant_id)
      .select("stock_quantity reserved_quantity")
      .session(session);
    if (!variantBefore) {
      throw createHttpError("Không tìm thấy biến thể sản phẩm", 404);
    }

    const stockBefore = Number(variantBefore.stock_quantity || 0);
    const reservedBefore = Number(variantBefore.reserved_quantity || 0);
    const qty = Number(receipt.qty_in || 0);

    await ProductVariant.updateOne(
      { _id: receipt.variant_id },
      { $inc: { stock_quantity: qty } },
      { session },
    );

    await InventoryLedger.create(
      [
        {
          variant_id: receipt.variant_id,
          event_type: "receipt_confirmed",
          quantity_delta: qty,
          stock_before: stockBefore,
          stock_after: stockBefore + qty,
          reserved_before: reservedBefore,
          reserved_after: reservedBefore,
          note: `Xác nhận phiếu nhập ${receipt._id}`,
          ref_type: "inventory_receipt",
          ref_id: receipt._id,
          created_by: actor._id,
        },
      ],
      { session },
    );

    receipt.status = "confirmed";
    receipt.confirmed_by = actor._id;
    receipt.confirmed_at = new Date();
    await receipt.save({ session });

    await session.commitTransaction();
    return receipt.toObject();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function listReceipts(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize || 20)));
  const skip = (page - 1) * pageSize;

  const filter = {};
  if (query.status) {
    const status = String(query.status);
    if (["draft", "confirmed", "cancelled"].includes(status)) {
      filter.status = status;
    }
  }
  if (query.variant_id && mongoose.Types.ObjectId.isValid(query.variant_id)) {
    filter.variant_id = query.variant_id;
  }
  if (query.supplier_name) {
    filter.supplier_name = {
      $regex: String(query.supplier_name),
      $options: "i",
    };
  }

  const [data, total] = await Promise.all([
    InventoryReceipt.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("variant_id", "sku product_id stock_quantity reserved_quantity")
      .populate("created_by", "email role profile.full_name")
      .populate("confirmed_by", "email role profile.full_name")
      .lean(),
    InventoryReceipt.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

async function listLedger(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(query.pageSize || 20)));
  const skip = (page - 1) * pageSize;

  const filter = {};
  if (query.variant_id && mongoose.Types.ObjectId.isValid(query.variant_id)) {
    filter.variant_id = query.variant_id;
  }
  if (query.event_type) filter.event_type = String(query.event_type);
  if (query.ref_type) filter.ref_type = String(query.ref_type);
  if (query.ref_id && mongoose.Types.ObjectId.isValid(query.ref_id)) {
    filter.ref_id = query.ref_id;
  }

  const [data, total] = await Promise.all([
    InventoryLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("variant_id", "sku product_id")
      .populate("created_by", "email role profile.full_name")
      .lean(),
    InventoryLedger.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

module.exports = {
  applyOnCheckout,
  releaseOnCancel,
  applyFulfillmentStockOut,
  assertMaterialsAvailableForPreOrder,
  aggregateVariantQuantities,
  createReceipt,
  confirmReceipt,
  listReceipts,
  listLedger,
  INVENTORY_PLACEMENT,
};
