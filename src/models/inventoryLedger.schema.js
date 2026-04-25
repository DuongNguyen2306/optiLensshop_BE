const mongoose = require("mongoose");
const { Schema } = mongoose;

const inventoryLedgerSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
      index: true,
    },
    event_type: {
      type: String,
      enum: [
        "receipt_confirmed",
        "inbound_completed",
        "manual_adjustment",
        "order_reserve",
        "order_release",
        "order_deduct",
        "return_restock",
      ],
      required: true,
      index: true,
    },
    quantity_delta: { type: Number, required: true },
    stock_before: { type: Number, required: true, min: 0 },
    stock_after: { type: Number, required: true, min: 0 },
    reserved_before: { type: Number, default: 0, min: 0 },
    reserved_after: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "" },
    ref_type: {
      type: String,
      enum: [
        "inventory_receipt",
        "stock_inbound",
        "order",
        "cart",
        "manual",
        "return_request",
        null,
      ],
      default: null,
    },
    ref_id: { type: Schema.Types.ObjectId, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("InventoryLedger", inventoryLedgerSchema);
