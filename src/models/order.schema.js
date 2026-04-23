const mongoose = require("mongoose");
const { Schema } = mongoose;

const eyeWorksheetSchema = new Schema(
  {
    sph: { type: String },
    cyl: { type: String },
    axis: { type: String },
  },
  { _id: false },
);

const lensWorksheetSchema = new Schema(
  {
    right_eye: { type: eyeWorksheetSchema, default: undefined },
    left_eye: { type: eyeWorksheetSchema, default: undefined },
    pd: { type: Number },
    lens_type: { type: String },
    is_custom_made: { type: Boolean, default: false },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },

    order_type: {
      type: String,
      enum: ["stock", "pre_order", "prescription"],
      required: true,
    },

    status: {
      type: String,
      enum: [
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
      ],
      default: "pending",
    },

    /** Luồng Ops mới: tách bạch packed legacy */
    uses_ops_fulfillment: { type: Boolean, default: false },

    /** Sales/Ops: thông số đầy đủ cho mài lắp (bổ sung cho lens_params từng dòng) */
    lens_worksheet: { type: lensWorksheetSchema, default: undefined },

    status_history: { type: [statusHistorySchema], default: [] },
    fulfilled_at: { type: Date, default: null },
    stock_deducted_at: { type: Date, default: null },

    total_amount: { type: Number, required: true },
    shipping_fee: { type: Number, default: 0 },
    final_amount: { type: Number, default: 0 },
    deposit_rate: { type: Number, default: 0 },
    deposit_amount: { type: Number, default: 0 },
    remaining_amount: { type: Number, default: 0 },
    payment_phase: {
      type: String,
      enum: ["full", "deposit", "remaining"],
      default: "full",
    },
    phone: { type: String, required: true, trim: true },
    shipping_address: { type: String, required: true },
    requires_fabrication: { type: Boolean, default: false },
    requires_sales_confirm: { type: Boolean, default: false },
    cancel_reason: { type: String },
    reject_reason: { type: String },

    created_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  },
);

// Đảm bảo requires_fabrication luôn sync với order_type
orderSchema.pre("save", function () {
  this.requires_fabrication = this.order_type === "prescription";
  this.final_amount = (this.total_amount || 0) + (this.shipping_fee || 0);
});

module.exports = mongoose.model("Order", orderSchema);
