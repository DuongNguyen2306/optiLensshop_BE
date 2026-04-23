const mongoose = require("mongoose");
const InventoryReceipt = require("../models/inventoryReceipt.schema");
const InventoryLedger = require("../models/inventoryLedger.schema");
const ProductVariant = require("../models/productVariant.schema");
const { createHttpError } = require("../utils/create-http-error");

async function createReceipt(payload, user) {
  const { variant_id, qty_in, unit_cost, supplier_name, note } = payload || {};
  if (!variant_id) throw createHttpError("Thiếu variant_id", 400);
  if (!qty_in || Number(qty_in) <= 0) {
    throw createHttpError("qty_in phải lớn hơn 0", 400);
  }

  const variant = await ProductVariant.findById(variant_id).select("_id sku");
  if (!variant) throw createHttpError("Không tìm thấy biến thể", 404);

  const receipt = await InventoryReceipt.create({
    variant_id,
    qty_in: Number(qty_in),
    unit_cost: Number(unit_cost || 0),
    supplier_name: supplier_name || "",
    note: note || "",
    created_by: user?._id,
  });

  return {
    message: "Tạo phiếu nhập thành công",
    receipt,
  };
}

async function confirmReceipt(receiptId, user) {
  if (!receiptId) throw createHttpError("Thiếu receiptId", 400);

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const receipt =
        await InventoryReceipt.findById(receiptId).session(session);
      if (!receipt) throw createHttpError("Không tìm thấy phiếu nhập", 404);
      if (receipt.status === "confirmed") {
        const variant = await ProductVariant.findById(receipt.variant_id).session(
          session,
        );
        const ledger = await InventoryLedger.findOne({
          ref_type: "inventory_receipt",
          ref_id: receipt._id,
        })
          .sort({ createdAt: -1 })
          .session(session);
        result = {
          message: "Phiếu nhập đã được xác nhận trước đó",
          receipt,
          variant,
          ledger,
        };
        return;
      }
      if (receipt.status !== "draft") {
        throw createHttpError("Phiếu nhập không ở trạng thái draft", 409);
      }

      const variant = await ProductVariant.findById(receipt.variant_id).session(
        session,
      );
      if (!variant) throw createHttpError("Không tìm thấy biến thể", 404);

      const qtyIn = Number(receipt.qty_in || 0);
      const stockBefore = Number(variant.stock_quantity || 0);
      const reservedBefore = Number(variant.reserved_quantity || 0);
      const stockAfter = stockBefore + qtyIn;

      variant.stock_quantity = stockAfter;
      await variant.save({ session });

      receipt.status = "confirmed";
      receipt.confirmed_by = user?._id || null;
      receipt.confirmed_at = new Date();
      await receipt.save({ session });

      const ledger = await InventoryLedger.create(
        [
          {
            variant_id: variant._id,
            event_type: "receipt_confirmed",
            quantity_delta: qtyIn,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reserved_before: reservedBefore,
            reserved_after: reservedBefore,
            note: receipt.note || "",
            ref_type: "inventory_receipt",
            ref_id: receipt._id,
            created_by: user?._id,
          },
        ],
        { session },
      );

      result = {
        message: "Xác nhận phiếu nhập thành công",
        receipt,
        variant,
        ledger: ledger[0],
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function listReceipts(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Number.parseInt(query.limit, 10) || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.variant_id) {
    filters.variant_id = query.variant_id;
  }

  const [items, total] = await Promise.all([
    InventoryReceipt.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("variant_id", "sku stock_quantity reserved_quantity")
      .populate("created_by", "name email role")
      .populate("confirmed_by", "name email role"),
    InventoryReceipt.countDocuments(filters),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

async function listLedger(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Number.parseInt(query.limit, 10) || 20);
  const skip = (page - 1) * limit;

  const filters = {};
  if (query.variant_id) {
    filters.variant_id = query.variant_id;
  }
  if (query.event_type) {
    filters.event_type = query.event_type;
  }

  const [items, total] = await Promise.all([
    InventoryLedger.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("variant_id", "sku stock_quantity reserved_quantity")
      .populate("created_by", "name email role"),
    InventoryLedger.countDocuments(filters),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = {
  createReceipt,
  confirmReceipt,
  listReceipts,
  listLedger,
};
