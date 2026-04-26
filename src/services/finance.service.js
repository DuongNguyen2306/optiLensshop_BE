const mongoose = require("mongoose");
const Order = require("../models/order.schema");
const Payment = require("../models/payment.schema");
const ReturnRequest = require("../models/returnRequest.schema");
const { RETURN_STATUS } = require("../models/returnRequest.schema");
const FinanceExpense = require("../models/financeExpense.schema");
const { EXPENSE_CATEGORY } = require("../models/financeExpense.schema");
const OrderItem = require("../models/orderItem.schema");
const ProductVariant = require("../models/productVariant.schema");
const Product = require("../models/product.schema");
const InboundReceipt = require("../models/inboundReceipt.schema");
const StockInbound = require("../models/stockInbound.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");

/** Đơn đã giao / hoàn tất — dùng ghi nhận doanh thu theo đơn (giống statistics) */
const REVENUE_ORDER_STATUSES = ["delivered", "completed"];

function parseDateRange(query = {}) {
  const now = new Date();
  const endRaw = query.endDate || query.end_date;
  const startRaw = query.startDate || query.start_date;
  const endDate = endRaw ? new Date(endRaw) : now;
  const startDate = startRaw
    ? new Date(startRaw)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("start_date hoặc end_date không hợp lệ");
  }
  if (startDate > endDate) {
    throw new Error("start_date phải nhỏ hơn hoặc bằng end_date");
  }

  return { startDate, endDate };
}

function dateKey(date, groupBy) {
  const d = new Date(date);
  if (groupBy === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseGroupBy(groupBy = "day") {
  const normalized = String(groupBy || "day").toLowerCase();
  if (!["day", "week", "month"].includes(normalized)) {
    throw new Error("group_by chỉ hỗ trợ: day, week, month");
  }
  return normalized;
}

function buildDateGroupId(groupBy, field = "$paid_at") {
  if (groupBy === "month") {
    return {
      year: { $year: field },
      month: { $month: field },
    };
  }
  if (groupBy === "week") {
    return {
      isoWeekYear: { $isoWeekYear: field },
      isoWeek: { $isoWeek: field },
    };
  }
  return {
    year: { $year: field },
    month: { $month: field },
    day: { $dayOfMonth: field },
  };
}

function formatBucketLabel(key, groupBy) {
  if (groupBy === "month") {
    return `${key.year}-${String(key.month).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    return `${key.isoWeekYear}-W${String(key.isoWeek).padStart(2, "0")}`;
  }
  return `${key.year}-${String(key.month).padStart(2, "0")}-${String(key.day).padStart(2, "0")}`;
}

/**
 * Giá nhập gần nhất theo variant (theo completed_at), ưu tiên InboundReceipt;
 * thiếu/0 thì lấy từ StockInbound legacy.
 */
async function buildLatestImportPriceByVariantBeforeDate(variantIds, beforeDate) {
  const unique = [...new Set((variantIds || []).map(String))].filter(Boolean);
  if (unique.length === 0) return { map: new Map(), usedLegacyVariantIds: [] };

  const oids = unique.map((id) => new mongoose.Types.ObjectId(id));
  const inboundRows = await InboundReceipt.aggregate([
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
  ]);
  const map = new Map(
    inboundRows.map((r) => [String(r._id), Number(r.import_price || 0)]),
  );
  const usedLegacyVariantIds = [];
  const needLegacy = oids.filter(
    (oid) => !map.has(String(oid)) || map.get(String(oid)) === 0,
  );
  if (needLegacy.length) {
    const legacy = await StockInbound.aggregate([
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
    ]);
    for (const row of legacy) {
      const k = String(row._id);
      if (!map.has(k) || map.get(k) === 0) {
        map.set(k, Number(row.import_price || 0));
        usedLegacyVariantIds.push(k);
      }
    }
  }
  return { map, usedLegacyVariantIds };
}

/** Tổng giá trị nhập kho theo kỳ (theo completed_at), tách mua hàng vs hoàn trả nhập lại. */
async function aggregateInboundValueByPeriod(startDate, endDate) {
  const matchBase = {
    status: "COMPLETED",
    completed_at: { $gte: startDate, $lte: endDate },
  };
  const [purchaseRows, restockRows] = await Promise.all([
    InboundReceipt.aggregate([
      {
        $match: {
          ...matchBase,
          type: { $in: ["PURCHASE", "OPENING_BALANCE"] },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$items.qty_received", 0] }, 0] },
                    { $ifNull: ["$items.qty_received", 0] },
                    { $ifNull: ["$items.qty_planned", 0] },
                  ],
                },
                { $ifNull: ["$items.import_price", 0] },
              ],
            },
          },
        },
      },
    ]),
    InboundReceipt.aggregate([
      { $match: { ...matchBase, type: "RETURN_RESTOCK" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$items.qty_received", 0] }, 0] },
                    { $ifNull: ["$items.qty_received", 0] },
                    { $ifNull: ["$items.qty_planned", 0] },
                  ],
                },
                { $ifNull: ["$items.import_price", 0] },
              ],
            },
          },
        },
      },
    ]),
  ]);
  return {
    purchase_inbound_value: purchaseRows[0]?.total || 0,
    return_restock_inbound_value: restockRows[0]?.total || 0,
  };
}

/**
 * Đối soát: tổng số lượng nhận từ phiếu COMPLETED vs tổng delta sổ cái theo sự kiện nhập.
 */
async function buildInventoryReconciliation(startDate, endDate) {
  const [receiptQtyRows, ledgerRows] = await Promise.all([
    InboundReceipt.aggregate([
      {
        $match: {
          status: "COMPLETED",
          completed_at: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total_qty: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$items.qty_received", 0] }, 0] },
                { $ifNull: ["$items.qty_received", 0] },
                { $ifNull: ["$items.qty_planned", 0] },
              ],
            },
          },
        },
      },
    ]),
    InventoryLedger.aggregate([
      {
        $match: {
          event_type: { $in: ["inbound_completed", "return_restock"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total_delta: { $sum: "$quantity_delta" },
        },
      },
    ]),
  ]);

  const inboundReceiptsQty = receiptQtyRows[0]?.total_qty || 0;
  const ledgerInboundEventsQty = ledgerRows[0]?.total_delta || 0;
  const delta = Math.round((inboundReceiptsQty - ledgerInboundEventsQty) * 100) / 100;

  return {
    period: { start_date: startDate, end_date: endDate },
    notes: {
      inbound_receipts:
        "Tổng qty từ InboundReceipt COMPLETED (qty_received, fallback qty_planned) theo completed_at.",
      ledger:
        "Tổng quantity_delta từ InventoryLedger event inbound_completed + return_restock theo createdAt.",
      interpret:
        "Lệch có thể do dữ liệu cũ, phiếu legacy StockInbound, hoặc ledger ghi từ luồng không qua InboundReceipt.",
    },
    inbound_receipts_qty: inboundReceiptsQty,
    ledger_inbound_events_qty: ledgerInboundEventsQty,
    delta,
    in_sync: Math.abs(delta) < 0.0001,
  };
}

exports.getInventoryReconciliation = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  return buildInventoryReconciliation(startDate, endDate);
};

/**
 * Tổng quan thu — chi — hoàn — lợi nhuận gộp (ước lượng).
 * - Doanh thu theo đơn: tổng final_amount đơn đã giao/hoàn tất (theo created_at đơn).
 * - Tiền vào theo thanh toán: tổng amount payment đã thu (paid / deposit-paid), theo paid_at.
 * - Hoàn tiền: ReturnRequest REFUNDED trong kỳ (theo updatedAt; tương thích COMPLETED cũ).
 * - Chi: FinanceExpense active trong kỳ (theo occurred_at).
 */
exports.getSummary = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const orderDateMatch = { created_at: { $gte: startDate, $lte: endDate } };

  const [
    orderRevenueAgg,
    orderByTypeAgg,
    paymentCollectedAgg,
    paymentByMethodAgg,
    refundsAgg,
    expenseAgg,
    orderCountStatuses,
  ] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          ...orderDateMatch,
          status: { $in: REVENUE_ORDER_STATUSES },
        },
      },
      {
        $group: {
          _id: null,
          total_final_amount: { $sum: "$final_amount" },
          total_shipping_fee: { $sum: "$shipping_fee" },
          total_goods: { $sum: "$total_amount" },
          order_count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...orderDateMatch,
          status: { $in: REVENUE_ORDER_STATUSES },
        },
      },
      {
        $group: {
          _id: "$order_type",
          count: { $sum: 1 },
          amount: { $sum: "$final_amount" },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: { $in: ["paid", "deposit-paid"] },
          paid_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total_collected: { $sum: "$amount" },
          payment_count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: { $in: ["paid", "deposit-paid"] },
          paid_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$method",
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
    ]),
    ReturnRequest.aggregate([
      {
        $match: {
          status: { $in: [RETURN_STATUS.REFUNDED, "COMPLETED"] },
          updatedAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          refund_total: { $sum: "$refund_amount" },
          return_count: { $sum: 1 },
        },
      },
    ]),
    FinanceExpense.aggregate([
      {
        $match: {
          status: "active",
          occurred_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          expense_total: { $sum: "$amount" },
          expense_count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: orderDateMatch },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const orderRev = orderRevenueAgg[0] || {};
  const payCol = paymentCollectedAgg[0] || {};
  const ref = refundsAgg[0] || {};
  const exp = expenseAgg[0] || {};

  const totalRefunds = ref.refund_total || 0;
  const totalExpenses = exp.expense_total || 0;
  const collected = payCol.total_collected || 0;

  const revenueGross = orderRev.total_final_amount || 0;
  const revenueNet = Math.max(0, Math.round((revenueGross - totalRefunds) * 100) / 100);

  const revenueOrderIdDocs = await Order.find({
    ...orderDateMatch,
    status: { $in: REVENUE_ORDER_STATUSES },
  })
    .select("_id")
    .lean();
  const revenueOrderIds = revenueOrderIdDocs.map((o) => o._id);

  let cogs = 0;
  const accrualDataQuality = {
    variant_count_missing_unit_cost: 0,
    cost_sourced_from_legacy_inbound: 0,
  };
  if (revenueOrderIds.length) {
    const lineItems = await OrderItem.find({ order_id: { $in: revenueOrderIds } })
      .select("variant_id quantity")
      .lean();
    const vids = [...new Set(lineItems.map((i) => i.variant_id))];
    const { map: costMap, usedLegacyVariantIds } =
      await buildLatestImportPriceByVariantBeforeDate(vids, endDate);
    const missing = new Set();
    for (const li of lineItems) {
      const p = costMap.get(String(li.variant_id)) || 0;
      if (p === 0) missing.add(String(li.variant_id));
      cogs += p * Number(li.quantity || 0);
    }
    accrualDataQuality.variant_count_missing_unit_cost = missing.size;
    accrualDataQuality.cost_sourced_from_legacy_inbound = usedLegacyVariantIds.length;
  }
  cogs = Math.round(cogs * 100) / 100;
  const grossProfit = Math.round((revenueNet - cogs) * 100) / 100;
  const netOperatingProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
  const inboundValuePeriod = await aggregateInboundValueByPeriod(startDate, endDate);

  return {
    period: { start_date: startDate, end_date: endDate },
    notes: {
      revenue_by_order:
        "Tổng final_amount của đơn có trạng thái delivered/completed, lọc theo created_at đơn (cùng logic overview statistics).",
      cash_in_by_payment:
        "Tổng Payment.amount đã thu (status paid hoặc deposit-paid), lọc theo paid_at. COD/MoMo/VNPay cần có paid_at khi xác nhận thanh toán.",
      refunds:
        "ReturnRequest REFUNDED trong kỳ (updatedAt), cộng refund_amount. (Dữ liệu cũ COMPLETED vẫn được tính.)",
      expenses: "Phiếu chi active, occurred_at trong kỳ.",
      net_operating:
        "Ước lượng: tiền vào (theo paid_at) − hoàn tiền − chi phí. Không thay thế kế toán chuyên nghiệp.",
      accrual:
        "Accrual/P&L: revenue_net = revenue_gross − refund trong kỳ. COGS = tổng (qty × giá nhập mới nhất tới endDate) trên dòng hàng đơn delivered/completed trong kỳ. Giá ưu tiên InboundReceipt, fallback StockInbound. Giá trị nhập kho theo kỳ: purchase/return từ phiếu COMPLETED.",
    },
    revenue_by_order_status: {
      statuses_used: REVENUE_ORDER_STATUSES,
      order_count: orderRev.order_count || 0,
      total_final_amount: orderRev.total_final_amount || 0,
      total_goods_amount: orderRev.total_goods || 0,
      total_shipping_fee: orderRev.total_shipping_fee || 0,
      by_order_type: orderByTypeAgg.map((r) => ({
        order_type: r._id,
        order_count: r.count,
        total_final_amount: r.amount,
      })),
    },
    cash_in_from_payments: {
      payment_count: payCol.payment_count || 0,
      total_collected: collected,
      by_method: paymentByMethodAgg.map((r) => ({
        method: r._id,
        count: r.count,
        amount: r.amount,
      })),
    },
    refunds: {
      return_count: ref.return_count || 0,
      total_refund_amount: totalRefunds,
    },
    expenses: {
      line_count: exp.expense_count || 0,
      total_amount: totalExpenses,
    },
    estimated_net: {
      cash_in_minus_refunds_and_expenses: Math.round(
        (collected - totalRefunds - totalExpenses) * 100,
      ) / 100,
    },
    accrual: {
      revenue_gross: revenueGross,
      revenue_net: revenueNet,
      cogs,
      gross_profit: grossProfit,
      operating_expenses: totalExpenses,
      net_operating_profit: netOperatingProfit,
      purchase_inbound_value: inboundValuePeriod.purchase_inbound_value,
      return_restock_inbound_value: inboundValuePeriod.return_restock_inbound_value,
    },
    data_quality_flags: accrualDataQuality,
    orders_in_period_by_status: orderCountStatuses.map((r) => ({
      status: r._id,
      count: r.count,
    })),
  };
};

/** Chi tiết doanh thu: payment theo trạng thái, đơn theo trạng thái trong kỳ */
exports.getRevenueBreakdown = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const orderDateMatch = { created_at: { $gte: startDate, $lte: endDate } };

  const [paymentStatusMethod, orderStatusAmounts, codPending] = await Promise.all([
    Payment.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $match: {
          "order.created_at": { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { method: "$method", status: "$status" },
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
    ]),
    Order.aggregate([
      { $match: orderDateMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total_final_amount: { $sum: "$final_amount" },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Order.countDocuments({
      ...orderDateMatch,
      status: { $in: ["shipped", "delivered", "completed"] },
    }),
  ]);

  return {
    period: { start_date: startDate, end_date: endDate },
    payments_on_orders_in_period: paymentStatusMethod.map((r) => ({
      method: r._id.method,
      status: r._id.status,
      count: r.count,
      amount: r.amount,
    })),
    orders_in_period_by_status: orderStatusAmounts.map((r) => ({
      status: r._id,
      order_count: r.count,
      sum_final_amount: r.total_final_amount,
    })),
    hint: {
      shipped_delivered_completed_count:
        "Số đơn đã/đang giao trong kỳ (shipped, delivered, completed) — tham khảo vận hành.",
      shipped_delivered_completed_orders: codPending,
    },
  };
};

/** Dòng tiền: tiền vào (paid_at) vs chi (occurred_at) theo bucket thời gian */
exports.getCashflow = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const groupBy = parseGroupBy(query.group_by);

  const payGroupId = buildDateGroupId(groupBy, "$paid_at");
  const expGroupId = buildDateGroupId(groupBy, "$occurred_at");

  const [inflows, outflows] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          status: { $in: ["paid", "deposit-paid"] },
          paid_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: payGroupId,
          cash_in: { $sum: "$amount" },
          payments: { $sum: 1 },
        },
      },
    ]),
    FinanceExpense.aggregate([
      {
        $match: {
          status: "active",
          occurred_at: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: expGroupId,
          cash_out: { $sum: "$amount" },
          expenses: { $sum: 1 },
        },
      },
    ]),
  ]);

  const labelSet = new Set();
  const mapIn = new Map();
  const mapOut = new Map();

  inflows.forEach((r) => {
    const label = formatBucketLabel(r._id, groupBy);
    labelSet.add(label);
    mapIn.set(label, { cash_in: r.cash_in, payments: r.payments });
  });
  outflows.forEach((r) => {
    const label = formatBucketLabel(r._id, groupBy);
    labelSet.add(label);
    mapOut.set(label, { cash_out: r.cash_out, expenses: r.expenses });
  });

  const points = [...labelSet].sort().map((label) => {
    const i = mapIn.get(label) || { cash_in: 0, payments: 0 };
    const o = mapOut.get(label) || { cash_out: 0, expenses: 0 };
    return {
      label,
      cash_in: i.cash_in,
      cash_out: o.cash_out,
      net: Math.round((i.cash_in - o.cash_out) * 100) / 100,
      payment_count: i.payments,
      expense_count: o.expenses,
    };
  });

  return {
    period: { start_date: startDate, end_date: endDate },
    group_by: groupBy,
    points,
  };
};

/** Danh sách đơn có doanh thu ghi nhận (delivered/completed) trong kỳ — đối soát */
exports.getRevenueOrders = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 20, 1), 100);
  const skip = (page - 1) * pageSize;

  const match = {
    created_at: { $gte: startDate, $lte: endDate },
    status: { $in: REVENUE_ORDER_STATUSES },
  };

  const [total, rows] = await Promise.all([
    Order.countDocuments(match),
    Order.find(match)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("user_id", "email profile")
      .lean(),
  ]);

  const orderIds = rows.map((o) => o._id);
  const payments = await Payment.find({ order_id: { $in: orderIds } }).lean();
  const payByOrder = {};
  payments.forEach((p) => {
    payByOrder[p.order_id.toString()] = p;
  });

  return {
    period: { start_date: startDate, end_date: endDate },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    orders: rows.map((o) => ({
      _id: o._id,
      created_at: o.created_at,
      status: o.status,
      order_type: o.order_type,
      final_amount: o.final_amount,
      total_amount: o.total_amount,
      shipping_fee: o.shipping_fee,
      customer: o.user_id,
      payment: payByOrder[o._id.toString()] || null,
    })),
  };
};

/** Hoàn tiền chi tiết trong kỳ */
exports.getRefundsList = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 20, 1), 100);
  const skip = (page - 1) * pageSize;

  const match = {
    status: { $in: [RETURN_STATUS.REFUNDED, "COMPLETED"] },
    updatedAt: { $gte: startDate, $lte: endDate },
  };

  const [total, returns] = await Promise.all([
    ReturnRequest.countDocuments(match),
    ReturnRequest.find(match)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("order_id", "final_amount status order_type created_at")
      .populate("requested_by", "email")
      .lean(),
  ]);

  return {
    period: { start_date: startDate, end_date: endDate },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    returns,
  };
};

/** Chi phí theo danh mục trong kỳ */
exports.getExpenseSummaryByCategory = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const rows = await FinanceExpense.aggregate([
    {
      $match: {
        status: "active",
        occurred_at: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return {
    period: { start_date: startDate, end_date: endDate },
    by_category: rows.map((r) => ({
      category: r._id,
      total_amount: r.total,
      line_count: r.count,
    })),
  };
};

// ─── CRUD Expense ─────────────────────────────────────────────────────────────

exports.createExpense = async (userId, body) => {
  const { title, amount, category, occurred_at, description, reference_no } = body;
  if (!title || !title.trim()) throw new Error("Tiêu đề không được để trống");
  if (amount == null || Number(amount) < 0) throw new Error("Số tiền không hợp lệ");
  if (!occurred_at) throw new Error("Ngày phát sinh (occurred_at) là bắt buộc");
  if (!category || !Object.values(EXPENSE_CATEGORY).includes(category)) {
    throw new Error(`Danh mục chi phí không hợp lệ. Chọn một trong: ${Object.values(EXPENSE_CATEGORY).join(", ")}`);
  }

  const doc = await FinanceExpense.create({
    title: title.trim(),
    amount: Number(amount),
    category,
    occurred_at: new Date(occurred_at),
    description: description?.trim() || undefined,
    reference_no: reference_no?.trim() || undefined,
    created_by: userId,
  });
  return doc;
};

exports.listExpenses = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize, 10) || 20, 1), 100);
  const skip = (page - 1) * pageSize;

  const match = {
    occurred_at: { $gte: startDate, $lte: endDate },
  };
  if (query.status === "voided") match.status = "voided";
  else if (query.status === "all") {
    /* mọi trạng thái */
  } else {
    match.status = "active";
  }
  if (query.category) match.category = query.category;

  const [total, rows] = await Promise.all([
    FinanceExpense.countDocuments(match),
    FinanceExpense.find(match)
      .sort({ occurred_at: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate("created_by", "email")
      .populate("updated_by", "email")
      .lean(),
  ]);

  return {
    period: { start_date: startDate, end_date: endDate },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    expenses: rows,
  };
};

exports.getExpenseById = async (id) => {
  const doc = await FinanceExpense.findById(id)
    .populate("created_by", "email")
    .populate("updated_by", "email");
  if (!doc) throw new Error("Không tìm thấy phiếu chi");
  return doc;
};

exports.updateExpense = async (id, userId, body) => {
  const doc = await FinanceExpense.findById(id);
  if (!doc) throw new Error("Không tìm thấy phiếu chi");
  if (doc.status === "voided") throw new Error("Không thể sửa phiếu đã hủy");

  const { title, amount, category, occurred_at, description, reference_no } = body;
  if (title !== undefined) doc.title = String(title).trim();
  if (amount !== undefined) {
    if (Number(amount) < 0) throw new Error("Số tiền không hợp lệ");
    doc.amount = Number(amount);
  }
  if (category !== undefined) {
    if (!Object.values(EXPENSE_CATEGORY).includes(category)) {
      throw new Error(`Danh mục chi phí không hợp lệ`);
    }
    doc.category = category;
  }
  if (occurred_at !== undefined) doc.occurred_at = new Date(occurred_at);
  if (description !== undefined) doc.description = description?.trim() || "";
  if (reference_no !== undefined) doc.reference_no = reference_no?.trim() || "";
  doc.updated_by = userId;
  await doc.save();
  return doc;
};

exports.voidExpense = async (id, userId, void_reason) => {
  const doc = await FinanceExpense.findById(id);
  if (!doc) throw new Error("Không tìm thấy phiếu chi");
  if (doc.status === "voided") throw new Error("Phiếu đã được hủy trước đó");
  doc.status = "voided";
  doc.void_reason = void_reason?.trim() || "Hủy phiếu";
  doc.updated_by = userId;
  await doc.save();
  return doc;
};

/**
 * Dashboard tài chính cho admin.
 * - Gross revenue: tổng final_amount completed, trừ refund trong kỳ.
 * - Cash flow: Payment paid/deposit-paid + remaining_amount COD completed.
 * - Receivables: remaining_amount của đơn shipped.
 * - COGS / lợi nhuận: giá vốn theo giá nhập mới nhất tới endDate (InboundReceipt, fallback StockInbound).
 */
exports.getAdminFinanceAnalytics = async (query = {}) => {
  const { startDate, endDate } = parseDateRange(query);
  const timeDiffMs = endDate.getTime() - startDate.getTime();
  const groupBy = timeDiffMs > 90 * 24 * 60 * 60 * 1000 ? "month" : "day";

  const completedOrderMatch = {
    status: "completed",
    created_at: { $gte: startDate, $lte: endDate },
  };

  const [completedOrders, shippedOrders, refundedReturns] = await Promise.all([
    Order.find(completedOrderMatch)
      .select("_id order_type final_amount remaining_amount created_at")
      .lean(),
    Order.find({
      status: "shipped",
      created_at: { $gte: startDate, $lte: endDate },
    })
      .select("_id remaining_amount")
      .lean(),
    ReturnRequest.find({
      status: { $in: [RETURN_STATUS.REFUNDED, "COMPLETED"] },
      updatedAt: { $gte: startDate, $lte: endDate },
    })
      .select("refund_amount updatedAt")
      .lean(),
  ]);

  const completedOrderIds = completedOrders.map((o) => o._id);
  const [payments, completedOrderItems] = await Promise.all([
    Payment.find({
      order_id: { $in: completedOrderIds },
      status: { $in: ["paid", "deposit-paid"] },
    })
      .select("order_id method amount paid_at status")
      .lean(),
    OrderItem.find({ order_id: { $in: completedOrderIds } })
      .select("order_id variant_id quantity unit_price")
      .lean(),
  ]);

  // Giá vốn: InboundReceipt COMPLETED gần nhất tới endDate, fallback StockInbound legacy.
  const variantIds = [...new Set(completedOrderItems.map((i) => String(i.variant_id)))];
  const { map: latestImportPriceByVariant, usedLegacyVariantIds } =
    await buildLatestImportPriceByVariantBeforeDate(variantIds, endDate);

  const grossRevenueRaw = completedOrders.reduce((s, o) => s + Number(o.final_amount || 0), 0);
  const totalRefundAmount = refundedReturns.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
  const totalRevenue = Math.max(0, grossRevenueRaw - totalRefundAmount);

  const paymentCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const codRemainingCompleted = completedOrders.reduce(
    (s, o) => s + Number(o.remaining_amount || 0),
    0,
  );
  const cashInHand = paymentCollected + codRemainingCompleted;

  const receivables = shippedOrders.reduce((s, o) => s + Number(o.remaining_amount || 0), 0);

  let grossSalesByItems = 0;
  let totalCost = 0;
  const soldByVariant = new Map();
  for (const item of completedOrderItems) {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const revenue = unitPrice * qty;
    const importPrice = Number(latestImportPriceByVariant.get(String(item.variant_id)) || 0);
    grossSalesByItems += revenue;
    totalCost += importPrice * qty;
    const key = String(item.variant_id);
    if (!soldByVariant.has(key)) soldByVariant.set(key, { revenue: 0, sold: 0 });
    const curr = soldByVariant.get(key);
    curr.revenue += revenue;
    curr.sold += qty;
  }
  const totalProfit = grossSalesByItems - totalCost;

  const missingCostVariants = new Set();
  for (const item of completedOrderItems) {
    const p = Number(latestImportPriceByVariant.get(String(item.variant_id)) || 0);
    if (p === 0) missingCostVariants.add(String(item.variant_id));
  }

  const [expenseAggAdmin, inboundValuePeriod, inventoryReconciliation] = await Promise.all([
    FinanceExpense.aggregate([
      {
        $match: {
          status: "active",
          occurred_at: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    aggregateInboundValueByPeriod(startDate, endDate),
    buildInventoryReconciliation(startDate, endDate),
  ]);
  const operatingExpenses = expenseAggAdmin[0]?.total || 0;
  const revenueNet = totalRevenue;
  const cogsRounded = Math.round(totalCost * 100) / 100;
  const grossProfitAccrual = Math.round((revenueNet - totalCost) * 100) / 100;
  const netOperatingProfit = Math.round(
    (grossProfitAccrual - operatingExpenses) * 100,
  ) / 100;

  // Charts: revenue (completed orders) and cashIn (payments), subtract refunds by bucket.
  const revenueByBucket = new Map();
  completedOrders.forEach((o) => {
    const k = dateKey(o.created_at, groupBy);
    revenueByBucket.set(k, (revenueByBucket.get(k) || 0) + Number(o.final_amount || 0));
  });
  const cashInByBucket = new Map();
  payments.forEach((p) => {
    if (!p.paid_at) return;
    const k = dateKey(p.paid_at, groupBy);
    cashInByBucket.set(k, (cashInByBucket.get(k) || 0) + Number(p.amount || 0));
  });
  const refundsByBucket = new Map();
  refundedReturns.forEach((r) => {
    const k = dateKey(r.updatedAt, groupBy);
    refundsByBucket.set(k, (refundsByBucket.get(k) || 0) + Number(r.refund_amount || 0));
  });
  const chartKeys = new Set([
    ...revenueByBucket.keys(),
    ...cashInByBucket.keys(),
    ...refundsByBucket.keys(),
  ]);
  const charts = [...chartKeys].sort().map((k) => ({
    date: k,
    revenue: Math.max(0, (revenueByBucket.get(k) || 0) - (refundsByBucket.get(k) || 0)),
    cashIn: cashInByBucket.get(k) || 0,
  }));

  // Top products
  const topVariantIds = [...soldByVariant.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([variantId]) => variantId);
  const topVariants = await ProductVariant.find({ _id: { $in: topVariantIds } })
    .select("_id sku product_id")
    .lean();
  const productIds = [...new Set(topVariants.map((v) => String(v.product_id)))];
  const products = await Product.find({ _id: { $in: productIds } }).select("_id name").lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantById = new Map(topVariants.map((v) => [String(v._id), v]));

  const topProducts = topVariantIds.map((variantId) => {
    const stat = soldByVariant.get(variantId) || { revenue: 0, sold: 0 };
    const variant = variantById.get(variantId);
    const product = variant ? productById.get(String(variant.product_id)) : null;
    return {
      variant_id: variantId,
      sku: variant?.sku || null,
      name: product?.name || variant?.sku || "Unknown Product",
      revenue: stat.revenue,
      sold: stat.sold,
    };
  });

  // Payment method ratio
  const methodTotals = new Map();
  payments.forEach((p) => {
    const m = p.method || "unknown";
    methodTotals.set(m, (methodTotals.get(m) || 0) + Number(p.amount || 0));
  });
  const totalMethodAmount = [...methodTotals.values()].reduce((s, v) => s + v, 0);
  const paymentMethods = [...methodTotals.entries()].map(([method, amount]) => ({
    method,
    amount,
    percent: totalMethodAmount > 0 ? Math.round((amount / totalMethodAmount) * 10000) / 100 : 0,
  }));

  // Order type revenue ratio
  const orderTypeMap = new Map();
  completedOrders.forEach((o) => {
    const type = o.order_type || "unknown";
    orderTypeMap.set(type, (orderTypeMap.get(type) || 0) + Number(o.final_amount || 0));
  });
  const totalOrderTypeRevenue = [...orderTypeMap.values()].reduce((s, v) => s + v, 0);
  const orderTypes = [...orderTypeMap.entries()].map(([orderType, revenue]) => ({
    orderType,
    revenue,
    percent:
      totalOrderTypeRevenue > 0
        ? Math.round((revenue / totalOrderTypeRevenue) * 10000) / 100
        : 0,
  }));

  return {
    period: { startDate, endDate, groupBy },
    summary: {
      totalRevenue,
      grossRevenueRaw,
      totalRefundAmount,
      totalProfit,
      cashInHand,
      receivables,
      revenue_net: revenueNet,
      cogs: cogsRounded,
      gross_profit: grossProfitAccrual,
      operating_expenses: operatingExpenses,
      net_operating_profit: netOperatingProfit,
      purchase_inbound_value: inboundValuePeriod.purchase_inbound_value,
      return_restock_inbound_value: inboundValuePeriod.return_restock_inbound_value,
    },
    charts,
    topProducts,
    breakdown: {
      paymentMethods,
      orderTypes,
    },
    data_quality_flags: {
      variant_count_missing_unit_cost: missingCostVariants.size,
      cost_sourced_from_legacy_inbound: usedLegacyVariantIds.length,
    },
    reconciliation: {
      inbound_receipts_qty: inventoryReconciliation.inbound_receipts_qty,
      ledger_inbound_events_qty: inventoryReconciliation.ledger_inbound_events_qty,
      delta: inventoryReconciliation.delta,
      in_sync: inventoryReconciliation.in_sync,
    },
  };
};
