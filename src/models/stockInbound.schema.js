const mongoose = require("mongoose");
const { Schema } = mongoose;

const stockInboundItemSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    import_price: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const allocationSummarySchema = new Schema(
  {
    variant_id: { type: Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    received_qty: { type: Number, required: true, min: 0 },
    allocated_qty: { type: Number, required: true, min: 0 },
    unallocated_qty: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const stockInboundSchema = new Schema(
  {
    inbound_code: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ["PURCHASE", "RETURN_RESTOCK"],
      default: "PURCHASE",
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED"],
      default: "PENDING",
      index: true,
    },
    items: { type: [stockInboundItemSchema], required: true, default: [] },
    total_value: { type: Number, default: 0, min: 0 },
    reference_orders: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    allocation_summary: { type: [allocationSummarySchema], default: [] },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completed_at: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("StockInbound", stockInboundSchema);
