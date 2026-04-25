const mongoose = require("mongoose");
const InboundReceipt = require("../models/inboundReceipt.schema");
const ProductVariant = require("../models/productVariant.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const { createHttpError } = require("../utils/create-http-error");

const INBOUND_TYPES = ["PURCHASE", "RETURN_RESTOCK", "OPENING_BALANCE"];
const STATUS = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  RECEIVED: "RECEIVED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

function ensureValidObjectId(id, label = "id") {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(`${label} không hợp lệ`, 400);
  }
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
  const latest = await InboundReceipt.findOne({
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
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError("Phiếu nhập phải có ít nhất 1 dòng hàng", 400);
  }

  const merged = new Map();
  for (const item of items) {
    if (!item || !mongoose.Types.ObjectId.isValid(item.variant_id)) {
      throw createHttpError("variant_id không hợp lệ trong items", 400);
    }
    const qty = Number(item.qty_planned || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw createHttpError("qty_planned phải > 0", 400);
    }
    const importPrice = Number(item.import_price || 0);
    if (!Number.isFinite(importPrice) || importPrice < 0) {
      throw createHttpError("import_price không hợp lệ", 400);
    }
    const key = String(item.variant_id);
    if (!merged.has(key)) {
      merged.set(key, {
        variant_id: key,
        qty_planned: 0,
        qty_received: 0,
        import_price: importPrice,
      });
    }
    const current = merged.get(key);
    current.qty_planned += qty;
    current.import_price = importPrice;
  }
  return Array.from(merged.values());
}

function computeTotalValue(items = []) {
  return items.reduce(
    (acc, item) =>
      acc + Number(item.qty_planned || 0) * Number(item.import_price || 0),
    0,
  );
}

function pushHistory(receipt, action, actorId, note = "") {
  receipt.history_log = Array.isArray(receipt.history_log)
    ? receipt.history_log
    : [];
  receipt.history_log.push({
    action,
    actor: actorId || null,
    at: new Date(),
    note,
  });
}

async function ensureVariantsExist(items, session) {
  const ids = items.map((i) => i.variant_id);
  const found = await ProductVariant.find({ _id: { $in: ids } })
    .select("_id")
    .session(session || null);
  if (found.length !== new Set(ids.map(String)).size) {
    throw createHttpError("Một số variant_id không tồn tại", 400);
  }
}

async function createDraft(payload, actor) {
  if (!actor || !actor._id) {
    throw createHttpError("Thiếu thông tin người tạo", 401);
  }

  const type = String(payload.type || "PURCHASE").toUpperCase();
  if (!INBOUND_TYPES.includes(type)) {
    throw createHttpError("type phiếu nhập không hợp lệ", 400);
  }

  const items = normalizeItems(payload.items);
  await ensureVariantsExist(items);

  const receipt = await InboundReceipt.create({
    inbound_code: await generateInboundCode(),
    type,
    status: STATUS.DRAFT,
    supplier_name: payload.supplier_name || "",
    expected_date: payload.expected_date || null,
    note: payload.note || "",
    items,
    total_value: computeTotalValue(items),
    reference_orders: Array.isArray(payload.reference_orders)
      ? payload.reference_orders.filter((id) =>
          mongoose.Types.ObjectId.isValid(id),
        )
      : [],
    created_by: actor._id,
    history_log: [
      { action: "CREATE_DRAFT", actor: actor._id, at: new Date() },
    ],
  });

  return getDetail(receipt._id);
}

async function updateDraft(id, payload, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  if (receipt.status !== STATUS.DRAFT) {
    throw createHttpError(
      "Chỉ phiếu DRAFT mới được sửa nội dung",
      400,
    );
  }

  if (payload.type !== undefined) {
    const type = String(payload.type).toUpperCase();
    if (!INBOUND_TYPES.includes(type)) {
      throw createHttpError("type phiếu nhập không hợp lệ", 400);
    }
    receipt.type = type;
  }
  if (payload.supplier_name !== undefined)
    receipt.supplier_name = payload.supplier_name;
  if (payload.expected_date !== undefined)
    receipt.expected_date = payload.expected_date;
  if (payload.note !== undefined) receipt.note = payload.note;

  if (payload.items !== undefined) {
    const items = normalizeItems(payload.items);
    await ensureVariantsExist(items);
    receipt.items = items;
    receipt.total_value = computeTotalValue(items);
  }

  pushHistory(receipt, "UPDATE_DRAFT", actor?._id);
  await receipt.save();
  return getDetail(receipt._id);
}

async function submit(id, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  if (receipt.status !== STATUS.DRAFT) {
    throw createHttpError("Chỉ phiếu DRAFT mới được gửi duyệt", 400);
  }
  if (!receipt.items || receipt.items.length === 0) {
    throw createHttpError("Phiếu không có dòng hàng để gửi duyệt", 400);
  }
  receipt.status = STATUS.PENDING_APPROVAL;
  receipt.submitted_at = new Date();
  pushHistory(receipt, "SUBMIT", actor?._id);
  await receipt.save();
  return getDetail(receipt._id);
}

async function approve(id, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  if (receipt.status !== STATUS.PENDING_APPROVAL) {
    throw createHttpError(
      "Chỉ phiếu PENDING_APPROVAL mới được duyệt",
      400,
    );
  }
  receipt.status = STATUS.APPROVED;
  receipt.approved_by = actor?._id || null;
  receipt.approved_at = new Date();
  pushHistory(receipt, "APPROVE", actor?._id);
  await receipt.save();
  return getDetail(receipt._id);
}

async function reject(id, payload, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  if (receipt.status !== STATUS.PENDING_APPROVAL) {
    throw createHttpError(
      "Chỉ phiếu PENDING_APPROVAL mới được từ chối",
      400,
    );
  }
  const note = String(payload?.note || "").trim();
  if (!note) {
    throw createHttpError("Cần ghi chú lý do từ chối", 400);
  }
  receipt.status = STATUS.DRAFT;
  pushHistory(receipt, "REJECT", actor?._id, note);
  await receipt.save();
  return getDetail(receipt._id);
}

async function cancel(id, payload, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);

  const allowed = [STATUS.DRAFT, STATUS.PENDING_APPROVAL, STATUS.APPROVED];
  if (!allowed.includes(receipt.status)) {
    throw createHttpError(
      "Phiếu đã nhận hàng/hoàn tất, không thể hủy",
      400,
    );
  }

  const reason = String(payload?.cancel_reason || "").trim();
  if (!reason) {
    throw createHttpError("Cần nhập lý do hủy", 400);
  }

  receipt.status = STATUS.CANCELLED;
  receipt.cancelled_by = actor?._id || null;
  receipt.cancelled_at = new Date();
  receipt.cancel_reason = reason;
  pushHistory(receipt, "CANCEL", actor?._id, reason);
  await receipt.save();
  return getDetail(receipt._id);
}

/**
 * Phân bổ FIFO theo created_at cho các Order pre_order/awaiting_stock đang ở
 * trạng thái confirmed. Không thay đổi reserved_quantity (allocation = chỉ
 * tracking trong inbound). Khi đơn đủ hàng -> chuyển status sang processing.
 */
async function allocateForReceipt(receipt, session) {
  const allocationSummary = [];
  const allocationByOrderAndVariant = new Map();
  const touchedOrderIds = new Set();

  const candidateOrders = await Order.find({
    order_type: "pre_order",
    status: "confirmed",
  })
    .sort({ created_at: 1 })
    .select("_id")
    .session(session);

  if (candidateOrders.length === 0) {
    return receipt.items.map((item) => ({
      variant_id: item.variant_id,
      received_qty: item.qty_received,
      allocated_qty: 0,
      unallocated_qty: item.qty_received,
      allocations: [],
    }));
  }

  for (const item of receipt.items) {
    const variantId = String(item.variant_id);
    let remaining = Number(item.qty_received || 0);
    let allocatedTotal = 0;
    const allocations = [];

    for (const order of candidateOrders) {
      if (remaining <= 0) break;
      const orderItem = await OrderItem.findOne({
        order_id: order._id,
        variant_id: variantId,
      })
        .select("quantity")
        .session(session);
      if (!orderItem) continue;

      const need = Number(orderItem.quantity || 0);
      const already =
        Number(allocationByOrderAndVariant.get(`${order._id}:${variantId}`) || 0);
      const stillNeeded = Math.max(0, need - already);
      if (stillNeeded <= 0) continue;

      const allocateNow = Math.min(stillNeeded, remaining);
      if (allocateNow <= 0) continue;

      allocationByOrderAndVariant.set(
        `${order._id}:${variantId}`,
        already + allocateNow,
      );
      allocations.push({ order_id: order._id, quantity: allocateNow });
      remaining -= allocateNow;
      allocatedTotal += allocateNow;
      touchedOrderIds.add(String(order._id));
    }

    allocationSummary.push({
      variant_id: item.variant_id,
      received_qty: Number(item.qty_received || 0),
      allocated_qty: allocatedTotal,
      unallocated_qty: Math.max(
        0,
        Number(item.qty_received || 0) - allocatedTotal,
      ),
      allocations,
    });
  }

  for (const orderId of touchedOrderIds) {
    const orderItems = await OrderItem.find({ order_id: orderId })
      .select("variant_id quantity")
      .session(session);

    let fullyAllocated = true;
    for (const oi of orderItems) {
      const need = Number(oi.quantity || 0);
      const allocated = Number(
        allocationByOrderAndVariant.get(`${orderId}:${oi.variant_id}`) || 0,
      );
      if (allocated < need) {
        fullyAllocated = false;
        break;
      }
    }
    if (!fullyAllocated) continue;

    const order = await Order.findById(orderId).session(session);
    if (!order || order.status !== "confirmed") continue;
    order.status = "processing";
    order.status_history = Array.isArray(order.status_history)
      ? order.status_history
      : [];
    order.status_history.push({
      action: "PROCESSING",
      actor: null,
      at: new Date(),
    });
    await order.save({ session });
  }

  return allocationSummary;
}

async function receive(id, actor) {
  ensureValidObjectId(id, "Inbound id");

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const receipt = await InboundReceipt.findById(id).session(session);
    if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
    if (receipt.status !== STATUS.APPROVED) {
      throw createHttpError(
        "Chỉ phiếu APPROVED mới được nhận hàng",
        400,
      );
    }
    if (!receipt.items || receipt.items.length === 0) {
      throw createHttpError("Phiếu không có dòng hàng", 400);
    }

    for (const item of receipt.items) {
      const qty = Number(item.qty_planned || 0);
      if (qty <= 0) continue;

      const variantBefore = await ProductVariant.findById(item.variant_id)
        .select("stock_quantity reserved_quantity")
        .session(session);
      if (!variantBefore) {
        throw createHttpError(
          `Không tìm thấy variant ${item.variant_id}`,
          400,
        );
      }

      const stockBefore = Number(variantBefore.stock_quantity || 0);
      const reservedBefore = Number(variantBefore.reserved_quantity || 0);

      await ProductVariant.updateOne(
        { _id: item.variant_id },
        { $inc: { stock_quantity: qty } },
        { session },
      );

      item.qty_received = qty;

      await InventoryLedger.create(
        [
          {
            variant_id: item.variant_id,
            event_type: "inbound_completed",
            quantity_delta: qty,
            stock_before: stockBefore,
            stock_after: stockBefore + qty,
            reserved_before: reservedBefore,
            reserved_after: reservedBefore,
            note: `Nhập kho từ phiếu ${receipt.inbound_code}`,
            ref_type: "inventory_receipt",
            ref_id: receipt._id,
            created_by: actor?._id || receipt.created_by,
          },
        ],
        { session },
      );
    }

    const allocationSummary = await allocateForReceipt(receipt, session);
    receipt.allocation_summary = allocationSummary;

    receipt.status = STATUS.RECEIVED;
    receipt.received_by = actor?._id || null;
    receipt.received_at = new Date();
    pushHistory(receipt, "RECEIVE", actor?._id);

    await receipt.save({ session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return getDetail(id);
}

async function complete(id, actor) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id);
  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  if (receipt.status !== STATUS.RECEIVED) {
    throw createHttpError(
      "Chỉ phiếu RECEIVED mới được chốt (complete)",
      400,
    );
  }
  receipt.status = STATUS.COMPLETED;
  receipt.completed_by = actor?._id || null;
  receipt.completed_at = new Date();
  pushHistory(receipt, "COMPLETE", actor?._id);
  await receipt.save();
  return getDetail(receipt._id);
}

async function list(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize || 10)));
  const skip = (page - 1) * pageSize;

  const filter = {};
  if (query.status) {
    const status = String(query.status).toUpperCase();
    if (Object.values(STATUS).includes(status)) filter.status = status;
  }
  if (query.type) {
    const type = String(query.type).toUpperCase();
    if (INBOUND_TYPES.includes(type)) filter.type = type;
  }
  if (query.supplier_name) {
    filter.supplier_name = { $regex: String(query.supplier_name), $options: "i" };
  }

  const [data, total] = await Promise.all([
    InboundReceipt.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("created_by", "email role")
      .populate("approved_by", "email role")
      .populate("received_by", "email role")
      .populate("completed_by", "email role")
      .populate("cancelled_by", "email role")
      .lean(),
    InboundReceipt.countDocuments(filter),
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

async function getDetail(id) {
  ensureValidObjectId(id, "Inbound id");
  const receipt = await InboundReceipt.findById(id)
    .populate(
      "items.variant_id",
      "sku price images stock_quantity reserved_quantity product_id",
    )
    .populate(
      "allocation_summary.variant_id",
      "sku product_id",
    )
    .populate("reference_orders", "_id status order_type created_at")
    .populate("created_by", "email role")
    .populate("approved_by", "email role")
    .populate("received_by", "email role")
    .populate("completed_by", "email role")
    .populate("cancelled_by", "email role")
    .lean();

  if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
  return receipt;
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
      .populate("created_by", "email role")
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
  STATUS,
  INBOUND_TYPES,
  createDraft,
  updateDraft,
  submit,
  approve,
  reject,
  cancel,
  receive,
  complete,
  list,
  getDetail,
  listLedger,
};
