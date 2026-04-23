const Order = require("../models/order.schema");
const Payment = require("../models/payment.schema");
const User = require("../models/user.schema");
const OrderItem = require("../models/orderItem.schema");
const ProductVariant = require("../models/productVariant.schema");

const COMPLETED_ORDER_STATUSES = ["completed", "delivered"];

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

function buildDateMatch(startDate, endDate) {
  return { created_at: { $gte: startDate, $lte: endDate } };
}

function sumByStatus(rows = []) {
  const result = {};
  rows.forEach((row) => {
    result[row._id] = row.count;
  });
  return result;
}

function parseGroupBy(groupBy = "day") {
  const normalized = String(groupBy || "day").toLowerCase();
  if (!["day", "week", "month"].includes(normalized)) {
    throw new Error("group_by chỉ hỗ trợ: day, week, month");
  }
  return normalized;
}

function buildDateGroupId(groupBy) {
  if (groupBy === "month") {
    return {
      year: { $year: "$created_at" },
      month: { $month: "$created_at" },
    };
  }
  if (groupBy === "week") {
    return {
      isoWeekYear: { $isoWeekYear: "$created_at" },
      isoWeek: { $isoWeek: "$created_at" },
    };
  }
  return {
    year: { $year: "$created_at" },
    month: { $month: "$created_at" },
    day: { $dayOfMonth: "$created_at" },
  };
}

function formatDateLabel(key, groupBy) {
  if (groupBy === "month") {
    return `${key.year}-${String(key.month).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    return `${key.isoWeekYear}-W${String(key.isoWeek).padStart(2, "0")}`;
  }
  return `${key.year}-${String(key.month).padStart(2, "0")}-${String(key.day).padStart(2, "0")}`;
}

async function getCoreStats(range) {
  const dateMatch = buildDateMatch(range.startDate, range.endDate);

  const [totalOrders, completedOrders, orderStatusRows, revenueRow, paymentRows] =
    await Promise.all([
      Order.countDocuments(dateMatch),
      Order.countDocuments({
        ...dateMatch,
        status: { $in: COMPLETED_ORDER_STATUSES },
      }),
      Order.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        {
          $match: {
            ...dateMatch,
            status: { $in: COMPLETED_ORDER_STATUSES },
          },
        },
        { $group: { _id: null, totalRevenue: { $sum: "$final_amount" } } },
      ]),
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
            "order.created_at": { $gte: range.startDate, $lte: range.endDate },
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
    ]);

  return {
    orders: {
      total: totalOrders,
      completed: completedOrders,
      completion_rate:
        totalOrders > 0
          ? Number(((completedOrders / totalOrders) * 100).toFixed(2))
          : 0,
      by_status: sumByStatus(orderStatusRows),
    },
    revenue: {
      total: revenueRow[0]?.totalRevenue || 0,
    },
    payments: paymentRows.map((row) => ({
      method: row._id.method,
      status: row._id.status,
      count: row.count,
      amount: row.amount,
    })),
  };
}

exports.getOverviewStats = async (query = {}) => {
  const range = parseDateRange(query);
  const core = await getCoreStats(range);

  return {
    period: {
      start_date: range.startDate,
      end_date: range.endDate,
    },
    ...core,
  };
};

exports.getAdminStats = async (query = {}) => {
  const range = parseDateRange(query);
  const core = await getCoreStats(range);

  const [activeCustomers, customerRows, staffRows] = await Promise.all([
    User.countDocuments({
      role: "customer",
      status: "active",
      is_deleted: false,
    }),
    User.aggregate([
      { $match: buildDateMatch(range.startDate, range.endDate) },
      { $match: { role: "customer", is_deleted: false } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { role: { $in: ["sales", "operations", "manager"] }, is_deleted: false } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    period: {
      start_date: range.startDate,
      end_date: range.endDate,
    },
    ...core,
    users: {
      active_customers: activeCustomers,
      new_customers_by_status: sumByStatus(customerRows),
    },
    staff: {
      by_role: sumByStatus(staffRows),
    },
  };
};

exports.getTimeSeriesStats = async (query = {}) => {
  const range = parseDateRange(query);
  const groupBy = parseGroupBy(query.group_by);
  const dateMatch = buildDateMatch(range.startDate, range.endDate);
  const groupId = buildDateGroupId(groupBy);

  const rows = await Order.aggregate([
    {
      $match: {
        ...dateMatch,
        status: { $in: COMPLETED_ORDER_STATUSES },
      },
    },
    {
      $group: {
        _id: groupId,
        revenue: { $sum: "$final_amount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.isoWeekYear": 1, "_id.isoWeek": 1 } },
  ]);

  return {
    period: {
      start_date: range.startDate,
      end_date: range.endDate,
    },
    group_by: groupBy,
    points: rows.map((row) => ({
      label: formatDateLabel(row._id, groupBy),
      revenue: row.revenue || 0,
      orders: row.orders || 0,
    })),
  };
};

exports.getTopProductsStats = async (query = {}) => {
  const range = parseDateRange(query);
  const dateMatch = buildDateMatch(range.startDate, range.endDate);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);

  const rows = await OrderItem.aggregate([
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
        "order.created_at": dateMatch.created_at,
        "order.status": { $in: COMPLETED_ORDER_STATUSES },
      },
    },
    {
      $group: {
        _id: "$variant_id",
        sold_quantity: { $sum: "$quantity" },
        revenue: { $sum: { $multiply: ["$quantity", "$unit_price"] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "productvariants",
        localField: "_id",
        foreignField: "_id",
        as: "variant",
      },
    },
    { $unwind: { path: "$variant", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "products",
        localField: "variant.product_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
  ]);

  return {
    period: {
      start_date: range.startDate,
      end_date: range.endDate,
    },
    limit,
    items: rows.map((row) => ({
      variant_id: row._id,
      sku: row.variant?.sku || null,
      product_name: row.product?.name || "Unknown product",
      product_type: row.product?.type || null,
      sold_quantity: row.sold_quantity || 0,
      revenue: row.revenue || 0,
    })),
  };
};

exports.getInventoryAlertsStats = async (query = {}) => {
  const threshold = Math.max(parseInt(query.threshold, 10) || 10, 0);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);

  const rows = await ProductVariant.aggregate([
    {
      $match: {
        is_active: true,
      },
    },
    {
      $addFields: {
        available_quantity: {
          $max: [0, { $subtract: ["$stock_quantity", "$reserved_quantity"] }],
        },
      },
    },
    {
      $match: {
        available_quantity: { $lte: threshold },
      },
    },
    { $sort: { available_quantity: 1, stock_quantity: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "product_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
  ]);

  return {
    threshold,
    limit,
    total_alerts: rows.length,
    items: rows.map((row) => ({
      variant_id: row._id,
      sku: row.sku,
      product_id: row.product_id,
      product_name: row.product?.name || "Unknown product",
      stock_quantity: row.stock_quantity,
      reserved_quantity: row.reserved_quantity || 0,
      available_quantity: row.available_quantity || 0,
    })),
  };
};

exports.getFunnelStats = async (query = {}) => {
  const range = parseDateRange(query);
  const dateMatch = buildDateMatch(range.startDate, range.endDate);

  const statusRows = await Order.aggregate([
    { $match: dateMatch },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const statusMap = sumByStatus(statusRows);
  const total = statusRows.reduce((sum, row) => sum + row.count, 0);
  const orderedStatuses = [
    "pending",
    "confirmed",
    "processing",
    "manufacturing",
    "received",
    "packed",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "return_requested",
    "returned",
    "refunded",
  ];

  return {
    period: {
      start_date: range.startDate,
      end_date: range.endDate,
    },
    total_orders: total,
    steps: orderedStatuses.map((status) => {
      const count = statusMap[status] || 0;
      return {
        status,
        count,
        ratio: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
      };
    }),
  };
};
