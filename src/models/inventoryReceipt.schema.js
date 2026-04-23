const mongoose = require("mongoose");
const { Schema } = mongoose;

const inventoryReceiptSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
      index: true,
    },
    qty_in: { type: Number, required: true, min: 1 },
    unit_cost: { type: Number, default: 0, min: 0 },
    supplier_name: { type: String, default: "" },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "confirmed", "cancelled"],
      default: "draft",
      index: true,
    },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    confirmed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    confirmed_at: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("InventoryReceipt", inventoryReceiptSchema);
