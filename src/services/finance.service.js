const Order = require("../models/order.schema");
const Payment = require("../models/payment.schema");
const ReturnRequest = require("../models/returnRequest.schema");
const { RETURN_STATUS } = require("../models/returnRequest.schema");
const FinanceExpense = require("../models/financeExpense.schema");
const { EXPENSE_CATEGORY } = require("../models/financeExpense.schema");

/** Đơn đã giao / hoàn tất — dùng ghi nhận doanh thu theo đơn (giống statistics) */
const REVENUE_ORDER_STATUSES = ["delivered", "completed"];

function parseDateRange(query = {}) {
  const now = new Date();
  const endDate = query.end_date ? new Date(query.end_date) : now;
  const startDate = query.start_date
    ? new Date(query.start_date)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("start_date hoặc end_date không hợp lệ");
  }
  if (startDate > endDate) {
    throw new Error("start_date phải nhỏ hơn hoặc bằng end_date");
  }

  return { startDate, endDate };
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
