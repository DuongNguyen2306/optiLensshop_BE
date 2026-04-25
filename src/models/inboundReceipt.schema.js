const mongoose = require("mongoose");
const { Schema } = mongoose;

const inboundReceiptItemSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    qty_planned: { type: Number, required: true, min: 1 },
    qty_received: { type: Number, default: 0, min: 0 },
    import_price: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const allocationSummaryItemSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    received_qty: { type: Number, required: true, min: 0 },
    allocated_qty: { type: Number, required: true, min: 0 },
    unallocated_qty: { type: Number, required: true, min: 0 },
    allocations: {
      type: [
        new Schema(
          {
            order_id: {
              type: Schema.Types.ObjectId,
              ref: "Order",
              required: true,
            },
            quantity: { type: Number, required: true, min: 1 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const historyLogSchema = new Schema(
  {
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false },
);

const inboundReceiptSchema = new Schema(
  {
    inbound_code: { type: String, required: true, unique: true, index: true },

    type: {
      type: String,
      enum: ["PURCHASE", "RETURN_RESTOCK", "OPENING_BALANCE"],
      default: "PURCHASE",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "RECEIVED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "DRAFT",
      index: true,
    },

    supplier_name: { type: String, default: "" },
    expected_date: { type: Date, default: null },
    note: { type: String, default: "" },

    items: { type: [inboundReceiptItemSchema], required: true, default: [] },

    total_value: { type: Number, default: 0, min: 0 },

    reference_orders: [{ type: Schema.Types.ObjectId, ref: "Order" }],

    allocation_summary: { type: [allocationSummaryItemSchema], default: [] },

    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submitted_at: { type: Date, default: null },

    approved_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approved_at: { type: Date, default: null },

    received_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    received_at: { type: Date, default: null },

    completed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completed_at: { type: Date, default: null },

    cancelled_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelled_at: { type: Date, default: null },
    cancel_reason: { type: String, default: "" },

    history_log: { type: [historyLogSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("InboundReceipt", inboundReceiptSchema);
