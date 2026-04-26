const mongoose = require("mongoose");

const ReturnRequest = require("../models/returnRequest.schema");
const { RETURN_STATUS, CONDITION_AT_RECEIPT } = require("../models/returnRequest.schema");
const Order = require("../models/order.schema");
const OrderItem = require("../models/orderItem.schema");
const ProductVariant = require("../models/productVariant.schema");
const Product = require("../models/product.schema");
const Payment = require("../models/payment.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");
const InboundReceipt = require("../models/inboundReceipt.schema");
const StockInbound = require("../models/stockInbound.schema");

// ─── Business Rule Engine ──────────────────────────────────────────────────────

/**
 * Quyết định có cộng lại kho cho một dòng sản phẩm trả về hay không.
 *
 * Quy tắc ngành kính:
 *  - Tình trạng không phải NEW → không restock bất kể loại sản phẩm.
 *  - Tròng kính (lens) từ đơn prescription/pre_order → KHÔNG restock
 *    (tròng đã mài theo độ khách cũ, không bán lại được).
 *  - Gọng kính (frame) tình trạng NEW → restock.
 *  - Phụ kiện (accessory) tình trạng NEW → restock.
 */
function resolveRestockDecision({ itemType, productType, orderType, condition }) {
  if (condition !== CONDITION_AT_RECEIPT.NEW) {
    return { restock: false, reason: "Hàng không còn nguyên vẹn (DAMAGED/USED)" };
  }

  const effectiveType = itemType || productType;

  if (
    effectiveType === "lens" &&
    (orderType === "prescription" || orderType === "pre_order")
  ) {
    return {
      restock: false,
      reason: "Tròng kính đã mài theo độ, không thể nhập lại kho",
    };
  }

  return { restock: true, reason: "Hàng đủ điều kiện nhập lại kho" };
}

function todayPrefix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Giá nhập gần nhất trước thời điểm hoàn trả (ưu tiên InboundReceipt, thiếu/0 dùng StockInbound legacy).
 */
async function getLastImportPriceByVariantBefore(variantIds, beforeDate, session) {
  if (!Array.isArray(variantIds) || variantIds.length === 0) return new Map();
  const uniqueStr = [...new Set(variantIds.map((id) => String(id)))];
  const oids = uniqueStr.map((id) => new mongoose.Types.ObjectId(id));

  const fromInbound = await InboundReceipt.aggregate([
    {
      $match: {
        status: "COMPLETED",
        completed_at: { $lte: beforeDate },
      },
    },
    { $unwind: "$items" },
    { $match: { "items.variant_id": { $in: oids } } },
    { $sort: { completed_at: -1 } },
    {
      $group: {
        _id: "$items.variant_id",
        import_price: { $first: "$items.import_price" },
      },
    },
  ]).session(session);

  const map = new Map(
    fromInbound.map((r) => [String(r._id), Number(r.import_price || 0)]),
  );

  const needLegacy = oids.filter(
    (oid) => !map.has(String(oid)) || map.get(String(oid)) === 0,
  );
  if (needLegacy.length) {
    const fromLegacy = await StockInbound.aggregate([
      {
        $match: {
          status: "COMPLETED",
          completed_at: { $lte: beforeDate },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.variant_id": { $in: needLegacy } } },
      { $sort: { completed_at: -1 } },
      {
        $group: {
          _id: "$items.variant_id",
          import_price: { $first: "$items.import_price" },
        },
      },
    ]).session(session);
    for (const row of fromLegacy) {
      const k = String(row._id);
      if (!map.has(k) || map.get(k) === 0) {
        map.set(k, Number(row.import_price || 0));
      }
    }
  }
  return map;
}

async function generateInboundCode(session) {
  const prefix = `PNK-${todayPrefix()}-`;
  const latest = await InboundReceipt.findOne({
    inbound_code: { $regex: `^${prefix}` },
  })
    .sort({ inbound_code: -1 })
    .select("inbound_code")
    .session(session)
    .lean();

  const nextSeq = latest
    ? Number(String(latest.inbound_code).slice(prefix.length) || 0) + 1
    : 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

async function createReturnRestockInboundReceipt({
  session,
  actorId,
  order,
  returnRequest,
  restockedItems = [],
}) {
  if (!Array.isArray(restockedItems) || restockedItems.length === 0) return null;

  const mergedByVariant = new Map();
  for (const row of restockedItems) {
    const key = String(row.variant_id);
    const current = mergedByVariant.get(key) || {
      variant_id: row.variant_id,
      qty_planned: 0,
      qty_received: 0,
      import_price: 0,
    };
    current.qty_planned += Number(row.quantity || 0);
    current.qty_received += Number(row.quantity || 0);
    current.import_price = Number(row.import_price || 0);
    mergedByVariant.set(key, current);
  }

  const items = Array.from(mergedByVariant.values());
  const totalValue = items.reduce(
    (sum, item) => sum + Number(item.qty_planned || 0) * Number(item.import_price || 0),
    0,
  );

  const historyLog = [
    {
      action: "CREATE_DRAFT",
      actor: actorId || null,
      at: new Date(),
      note: `Tạo tự động từ return request ${returnRequest._id}`,
    },
    {
      action: "SUBMIT",
      actor: actorId || null,
      at: new Date(),
      note: "Tự động submit khi hoàn tất trả hàng",
    },
    {
      action: "APPROVE",
      actor: actorId || null,
      at: new Date(),
      note: "Tự động approve theo luồng return restock",
    },
    {
      action: "RECEIVE",
      actor: actorId || null,
      at: new Date(),
      note: "Tự động nhận hàng theo return đã kiểm định NEW",
    },
    {
      action: "COMPLETE",
      actor: actorId || null,
      at: new Date(),
      note: "Tự động complete theo luồng hoàn trả hàng",
    },
  ];

  const [receipt] = await InboundReceipt.create(
    [
      {
        inbound_code: await generateInboundCode(session),
        type: "RETURN_RESTOCK",
        status: "COMPLETED",
        supplier_name: "CUSTOMER_RETURN",
        expected_date: null,
        note: `Auto-created from return request ${returnRequest._id}`,
        items,
        total_value: totalValue,
        reference_orders: [order._id],
        allocation_summary: [],
        created_by: actorId,
        submitted_at: new Date(),
        approved_by: actorId || null,
        approved_at: new Date(),
        received_by: actorId || null,
        received_at: new Date(),
        completed_by: actorId || null,
        completed_at: new Date(),
        history_log: historyLog,
      },
    ],
    { session },
  );

  return receipt;
}

// ─── Customer-facing ───────────────────────────────────────────────────────────

/**
 * Khách hàng tạo yêu cầu trả hàng.
 * Điều kiện: đơn đã DELIVERED hoặc COMPLETED, chưa có yêu cầu trả đang xử lý.
 */
exports.requestReturn = async (userId, { order_id, return_reason, reason_category, items }) => {
  if (!return_reason || !return_reason.trim()) {
    throw new Error("Vui lòng cung cấp lý do trả hàng");
  }
  if (!items || items.length === 0) {
    throw new Error("Vui lòng chọn ít nhất một sản phẩm để trả");
  }

  const order = await Order.findById(order_id);
  if (!order) throw new Error("Không tìm thấy đơn hàng");

  if (order.user_id.toString() !== userId.toString()) {
    throw new Error("Bạn không có quyền thực hiện yêu cầu này");
  }

  if (!["delivered", "completed"].includes(order.status)) {
    throw new Error(
      "Chỉ có thể yêu cầu trả hàng với đơn hàng đã giao thành công",
    );
  }

  const activeReturnStatuses = [
    RETURN_STATUS.PENDING,
    RETURN_STATUS.APPROVED,
    RETURN_STATUS.INSPECTING,
    "RECEIVED",
    "PROCESSING",
  ];
  const existingActive = await ReturnRequest.findOne({
    order_id,
    status: { $in: activeReturnStatuses },
  });
  if (existingActive) {
    throw new Error("Đơn hàng này đã có yêu cầu trả hàng đang được xử lý");
  }

  // Validate từng dòng trả hàng
  const orderItems = await OrderItem.find({ order_id });
  const orderItemMap = new Map(orderItems.map((oi) => [oi._id.toString(), oi]));

  const returnItems = [];
  for (const item of items) {
    const oi = orderItemMap.get(String(item.order_item_id));
    if (!oi) {
      throw new Error(`Sản phẩm ${item.order_item_id} không có trong đơn hàng`);
    }
    if (!item.quantity || item.quantity < 1) {
      throw new Error("Số lượng trả phải lớn hơn 0");
    }
    if (item.quantity > oi.quantity) {
      throw new Error(
        `Số lượng trả (${item.quantity}) vượt quá số lượng đã mua (${oi.quantity})`,
      );
    }
    returnItems.push({
      order_item_id: oi._id,
      variant_id: oi.variant_id,
      quantity: item.quantity,
      item_type: oi.item_type || null,
    });
  }

  const returnRequest = await ReturnRequest.create({
    order_id,
    requested_by: userId,
    return_reason: return_reason.trim(),
    reason_category: reason_category || "other",
    items: returnItems,
    status: RETURN_STATUS.PENDING,
    history_log: [
      {
        action: "RETURN_REQUESTED",
        actor: userId,
        at: new Date(),
        note: return_reason.trim(),
      },
    ],
  });

  // Cập nhật trạng thái đơn gốc
  order.status = "return_requested";
  order.status_history.push({ action: "return_requested", actor: userId });
  await order.save();

  return returnRequest;
};

/** Khách hàng xem danh sách yêu cầu trả của mình. */
exports.listMyReturns = async (userId, filter = {}) => {
  const match = { requested_by: userId };
  if (filter.status) match.status = filter.status;

  const page = parseInt(filter.page) || 1;
  const pageSize = parseInt(filter.pageSize) || 10;
  const skip = (page - 1) * pageSize;

  const total = await ReturnRequest.countDocuments(match);
  const returns = await ReturnRequest.find(match)
    .populate("order_id", "order_type status final_amount created_at")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);

  return { total, page, pageSize, returns };
};

// ─── Admin / Ops-facing ────────────────────────────────────────────────────────

/** Admin/Ops xem toàn bộ danh sách yêu cầu trả hàng. */
exports.listReturns = async (filter = {}) => {
  const match = {};
  if (filter.status) match.status = filter.status;
  if (filter.order_id) match.order_id = filter.order_id;
  if (filter.condition) match.condition_at_receipt = filter.condition;

  const page = parseInt(filter.page) || 1;
  const pageSize = parseInt(filter.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const total = await ReturnRequest.countDocuments(match);
  const returns = await ReturnRequest.find(match)
    .populate("order_id", "order_type status final_amount created_at phone")
    .populate("requested_by", "email profile")
    .populate("handled_by", "email profile")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);

  return { total, page, pageSize, returns };
};

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function enrichReturnItems(returnRequest) {
  const plain = returnRequest?.toObject ? returnRequest.toObject() : returnRequest;
  if (!plain) return plain;

  const enrichedItems = normalizeArray(plain.items).map((item) => {
    const orderItem = item.order_item_id || {};
    const variant = item.variant_id || {};
    const product = variant.product_id || {};

    const variantImages = normalizeArray(variant.images);
    const productImages = normalizeArray(product.images);

    return {
      ...item,
      product_name: product.name || null,
      product_slug: product.slug || null,
      product_type: product.type || item.item_type || null,
      sku: variant.sku || null,
      image:
        (variantImages.length > 0 ? variantImages[0] : null) ||
        (productImages.length > 0 ? productImages[0] : null),
      images: variantImages.length > 0 ? variantImages : productImages,
      ordered_quantity: Number(orderItem.quantity || 0),
      return_quantity: Number(item.quantity || 0),
      unit_price: Number(orderItem.unit_price || 0),
      line_total: Number(orderItem.unit_price || 0) * Number(item.quantity || 0),
    };
  });

  return {
    ...plain,
    items: enrichedItems,
  };
}

/** Xem chi tiết một yêu cầu trả hàng. */
exports.getReturnDetail = async (returnId) => {
  const returnRequest = await ReturnRequest.findById(returnId)
    .populate("order_id")
    .populate("requested_by", "email profile")
    .populate("handled_by", "email profile")
    .populate({
      path: "items.variant_id",
      select: "sku price images product_id",
      populate: {
        path: "product_id",
        select: "name slug type images",
      },
    })
    .populate("items.order_item_id");

  if (!returnRequest) throw new Error("Không tìm thấy yêu cầu trả hàng");
  return enrichReturnItems(returnRequest);
};

// ─── PATCH /api/admin/returns/:id/approve ─────────────────────────────────────

/**
 * Ops duyệt yêu cầu trả: PENDING → APPROVED (khách được gửi hàng về).
 */
exports.approveReturn = async (returnId, { note }, actorId) => {
  const returnRequest = await ReturnRequest.findById(returnId);
  if (!returnRequest) throw new Error("Không tìm thấy yêu cầu trả hàng");

  if (returnRequest.status !== RETURN_STATUS.PENDING) {
    throw new Error(
      `Chỉ yêu cầu ở trạng thái PENDING (Chờ duyệt) mới được chấp nhận trả. Hiện tại: ${returnRequest.status}`,
    );
  }

  returnRequest.status = RETURN_STATUS.APPROVED;
  returnRequest.handled_by = actorId;
  returnRequest.history_log.push({
    action: "APPROVED",
    actor: actorId,
    at: new Date(),
    note: note || "Shop đồng ý cho khách trả hàng — khách gửi hàng về",
  });

  await returnRequest.save();
  return returnRequest;
};

// ─── PATCH /api/admin/returns/:id/receive ──────────────────────────────────────

/**
 * Đã nhận kiện từ shipper & kiểm tra: APPROVED → INSPECTING.
 * Ghi condition_at_receipt (NEW / DAMAGED / USED).
 */
exports.receiveReturn = async (returnId, { condition_at_receipt, note }, actorId) => {
  if (!Object.values(CONDITION_AT_RECEIPT).includes(condition_at_receipt)) {
    throw new Error(
      `Tình trạng hàng không hợp lệ. Chấp nhận: ${Object.values(CONDITION_AT_RECEIPT).join(", ")}`,
    );
  }

  const returnRequest = await ReturnRequest.findById(returnId);
  if (!returnRequest) throw new Error("Không tìm thấy yêu cầu trả hàng");

  const allowedStatuses = [RETURN_STATUS.APPROVED, "RECEIVED", "PROCESSING"];
  if (!allowedStatuses.includes(returnRequest.status)) {
    throw new Error(
      `Yêu cầu phải ở APPROVED (Đã chấp nhận trả) trước khi nhận & kiểm tra hàng. Hiện tại: ${returnRequest.status}`,
    );
  }

  returnRequest.status = RETURN_STATUS.INSPECTING;
  returnRequest.condition_at_receipt = condition_at_receipt;
  returnRequest.handled_by = actorId;
  returnRequest.history_log.push({
    action: "INSPECTING",
    actor: actorId,
    at: new Date(),
    note:
      note ||
      `Đã nhận hàng & kiểm tra. Tình trạng khi mở hộp: ${condition_at_receipt}`,
  });

  await returnRequest.save();
  return returnRequest;
};

// ─── PATCH /api/admin/returns/:id/complete ─────────────────────────────────────

/**
 * Hoàn tất trả hàng:
 *  1. Áp dụng logic cộng kho theo điều kiện hàng + loại sản phẩm + loại đơn.
 *  2. Ghi InventoryLedger cho mỗi item được restock.
 *  3. Cập nhật Payment → refunded nếu thanh toán qua MoMo/VNPay.
 *  4. Cập nhật Order → returned | refunded.
 *  5. Cập nhật ReturnRequest → REFUNDED.
 *
 * Toàn bộ chạy trong một MongoDB transaction.
 */
exports.completeReturn = async (returnId, actorId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnRequest = await ReturnRequest.findById(returnId).session(session);
    if (!returnRequest) throw new Error("Không tìm thấy yêu cầu trả hàng");

    const allowedStatuses = [RETURN_STATUS.INSPECTING, "RECEIVED", "PROCESSING"];
    if (!allowedStatuses.includes(returnRequest.status)) {
      throw new Error(
        "Yêu cầu phải ở INSPECTING (Đã nhận & đang kiểm tra) trước khi hoàn tiền",
      );
    }

    if (!returnRequest.condition_at_receipt) {
      throw new Error(
        "Phải đánh giá tình trạng hàng (condition_at_receipt) trước khi hoàn tất",
      );
    }

    const order = await Order.findById(returnRequest.order_id).session(session);
    if (!order) throw new Error("Không tìm thấy đơn hàng gốc");

    const condition = returnRequest.condition_at_receipt;
    const orderType = order.order_type;

    // Tải OrderItem, ProductVariant, Product trong một lần
    const orderItemIds = returnRequest.items.map((i) => i.order_item_id);
    const variantIds = returnRequest.items.map((i) => i.variant_id);

    const [orderItemsDocs, variantsDocs] = await Promise.all([
      OrderItem.find({ _id: { $in: orderItemIds } }).session(session),
      ProductVariant.find({ _id: { $in: variantIds } }).session(session),
    ]);

    const orderItemMap = new Map(orderItemsDocs.map((oi) => [oi._id.toString(), oi]));
    const variantMap = new Map(variantsDocs.map((v) => [v._id.toString(), v]));

    const productIds = [...new Set(variantsDocs.map((v) => v.product_id.toString()))];
    const productsDocs = await Product.find({ _id: { $in: productIds } }).session(session);
    const productMap = new Map(productsDocs.map((p) => [p._id.toString(), p]));

    const asOf = new Date();
    const restockPriceMap = await getLastImportPriceByVariantBefore(
      returnRequest.items.map((i) => i.variant_id),
      asOf,
      session,
    );

    // ── Xử lý từng dòng trả hàng ────────────────────────────────────────────
    let totalRefundAmount = 0;
    let anyRestocked = false;
    const restockLog = [];
    const restockedItemsForInbound = [];

    for (const returnItem of returnRequest.items) {
      const oi = orderItemMap.get(returnItem.order_item_id.toString());
      const variant = variantMap.get(returnItem.variant_id.toString());

      if (oi) {
        totalRefundAmount += (oi.unit_price || 0) * returnItem.quantity;
      }

      if (!variant) continue;

      const product = productMap.get(variant.product_id.toString());
      const productType = product ? product.type : null;

      const { restock, reason } = resolveRestockDecision({
        itemType: returnItem.item_type,
        productType,
        orderType,
        condition,
      });

      restockLog.push({
        variant_id: returnItem.variant_id,
        quantity: returnItem.quantity,
        restock,
        reason,
      });

      if (!restock) continue;

      anyRestocked = true;
      const stockBefore = variant.stock_quantity;
      const stockAfter = stockBefore + returnItem.quantity;
      const importPrice = Number(restockPriceMap.get(String(returnItem.variant_id)) || 0);

      // Cộng kho
      await ProductVariant.findByIdAndUpdate(
        returnItem.variant_id,
        { $inc: { stock_quantity: returnItem.quantity } },
        { session, new: true },
      );

      restockedItemsForInbound.push({
        variant_id: returnItem.variant_id,
        quantity: returnItem.quantity,
        import_price: importPrice,
      });

      // Nhật ký kho
      await InventoryLedger.create(
        [
          {
            variant_id: returnItem.variant_id,
            event_type: "return_restock",
            quantity_delta: returnItem.quantity,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reserved_before: variant.reserved_quantity || 0,
            reserved_after: variant.reserved_quantity || 0,
            note: `Return Restock — ${reason} — Order #${order._id}`,
            ref_type: "return_request",
            ref_id: returnRequest._id,
            created_by: actorId,
          },
        ],
        { session },
      );
    }

    // ── Cập nhật ReturnRequest ───────────────────────────────────────────────
    returnRequest.status = RETURN_STATUS.REFUNDED;
    returnRequest.is_restocked = anyRestocked;
    returnRequest.refund_amount = totalRefundAmount;
    returnRequest.handled_by = actorId;
    returnRequest.history_log.push({
      action: "REFUNDED",
      actor: actorId,
      at: new Date(),
      note: `Đã hoàn tiền. Restock: ${anyRestocked}. Số tiền: ${totalRefundAmount.toLocaleString("vi-VN")} VND`,
    });
    await returnRequest.save({ session });

    // ── Cập nhật Payment & Order ─────────────────────────────────────────────
    const payment = await Payment.findOne({ order_id: order._id }).session(session);

    let finalOrderStatus = "returned";

    if (payment && ["paid", "deposit-paid"].includes(payment.status)) {
      // Đánh dấu refunded cho mọi phương thức thanh toán (kể cả COD trả tiền mặt)
      payment.status = "refunded";
      await payment.save({ session });
      finalOrderStatus = "refunded";
    }

    order.status = finalOrderStatus;
    order.status_history.push({ action: finalOrderStatus, actor: actorId });
    await order.save({ session });

    const restockInboundReceipt = await createReturnRestockInboundReceipt({
      session,
      actorId,
      order,
      returnRequest,
      restockedItems: restockedItemsForInbound,
    });

    await session.commitTransaction();

    return {
      returnRequest,
      restockLog,
      finalOrderStatus,
      restockInboundReceipt: restockInboundReceipt
        ? {
            _id: restockInboundReceipt._id,
            inbound_code: restockInboundReceipt.inbound_code,
            status: restockInboundReceipt.status,
            type: restockInboundReceipt.type,
          }
        : null,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── PATCH /api/admin/returns/:id/reject ──────────────────────────────────────

/**
 * Ops/Admin từ chối yêu cầu trả hàng.
 * Hoàn lại trạng thái đơn về DELIVERED.
 */
exports.rejectReturn = async (returnId, { rejected_reason }, actorId) => {
  if (!rejected_reason || !rejected_reason.trim()) {
    throw new Error("Vui lòng cung cấp lý do từ chối");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnRequest = await ReturnRequest.findById(returnId).session(session);
    if (!returnRequest) throw new Error("Không tìm thấy yêu cầu trả hàng");

    const allowedStatuses = [
      RETURN_STATUS.PENDING,
      RETURN_STATUS.APPROVED,
      RETURN_STATUS.INSPECTING,
      "RECEIVED",
      "PROCESSING",
    ];
    if (!allowedStatuses.includes(returnRequest.status)) {
      throw new Error(
        `Không thể từ chối yêu cầu ở trạng thái ${returnRequest.status}`,
      );
    }

    returnRequest.status = RETURN_STATUS.REJECTED;
    returnRequest.rejected_reason = rejected_reason.trim();
    returnRequest.handled_by = actorId;
    returnRequest.history_log.push({
      action: "REJECTED",
      actor: actorId,
      at: new Date(),
      note: rejected_reason.trim(),
    });
    await returnRequest.save({ session });

    const order = await Order.findById(returnRequest.order_id).session(session);
    if (order && order.status === "return_requested") {
      order.status = "delivered";
      order.status_history.push({
        action: "return_rejected_revert",
        actor: actorId,
      });
      await order.save({ session });
    }

    await session.commitTransaction();
    return returnRequest;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
