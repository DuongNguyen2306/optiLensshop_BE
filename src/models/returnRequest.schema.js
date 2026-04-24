const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Luồng trả hàng (API lưu giá trị enum tiếng Anh; FE hiển thị nhãn tiếng Việt).
 * PENDING → APPROVED → INSPECTING → REFUNDED | REJECTED
 */
const RETURN_STATUS = {
  /** Chờ duyệt — khách vừa gửi, Ops xem lý do */
  PENDING: "PENDING",
  /** Đã chấp nhận trả — khách đóng gói gửi về */
  APPROVED: "APPROVED",
  /** Đã nhận hàng & đang kiểm tra — Ops mở hộp, ghi condition_at_receipt */
  INSPECTING: "INSPECTING",
  /** Đã hoàn tiền — sau kiểm tra OK, cộng kho + cập nhật thanh toán/đơn */
  REFUNDED: "REFUNDED",
  /** Từ chối — hàng giả / không đủ điều kiện */
  REJECTED: "REJECTED",
};

const CONDITION_AT_RECEIPT = {
  NEW: "NEW",
  DAMAGED: "DAMAGED",
  USED: "USED",
};

const REASON_CATEGORY = {
  DAMAGED_ON_ARRIVAL: "damaged_on_arrival",
  WRONG_ITEM: "wrong_item",
  CHANGED_MIND: "changed_mind",
  DEFECTIVE: "defective",
  OTHER: "other",
};

const returnItemSchema = new Schema(
  {
    order_item_id: {
      type: Schema.Types.ObjectId,
      ref: "OrderItem",
      required: true,
    },
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    /** Loại sản phẩm dòng này (frame / lens / null = accessory) - copy từ OrderItem */
    item_type: {
      type: String,
      enum: ["frame", "lens", null],
      default: null,
    },
  },
  { _id: false },
);

const historyLogSchema = new Schema(
  {
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
    note: { type: String },
  },
  { _id: false },
);

const returnRequestSchema = new Schema(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    requested_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    return_reason: { type: String, required: true, trim: true },
    reason_category: {
      type: String,
      enum: Object.values(REASON_CATEGORY),
      default: REASON_CATEGORY.OTHER,
    },

    items: { type: [returnItemSchema], required: true },

    status: {
      type: String,
      enum: [...Object.values(RETURN_STATUS), "COMPLETED", "RECEIVED", "PROCESSING"],
      default: RETURN_STATUS.PENDING,
      index: true,
    },

    /**
     * Tình trạng hàng do Ops đánh giá khi nhận về.
     * Bắt buộc trước khi complete.
     */
    condition_at_receipt: {
      type: String,
      enum: Object.values(CONDITION_AT_RECEIPT),
      default: null,
    },

    /** true nếu đã cộng lại vào kho ít nhất một item */
    is_restocked: { type: Boolean, default: false },

    /** Số tiền thực tế hoàn cho khách (tính theo unit_price × qty trả) */
    refund_amount: { type: Number, default: 0 },

    /** Ops/Admin xử lý yêu cầu */
    handled_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejected_reason: { type: String },

    history_log: { type: [historyLogSchema], default: [] },
  },
  { timestamps: true },
);

returnRequestSchema.statics.RETURN_STATUS = RETURN_STATUS;
returnRequestSchema.statics.CONDITION_AT_RECEIPT = CONDITION_AT_RECEIPT;
returnRequestSchema.statics.REASON_CATEGORY = REASON_CATEGORY;

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

module.exports = ReturnRequest;
module.exports.RETURN_STATUS = RETURN_STATUS;
module.exports.CONDITION_AT_RECEIPT = CONDITION_AT_RECEIPT;
module.exports.REASON_CATEGORY = REASON_CATEGORY;
