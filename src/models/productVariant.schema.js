const mongoose = require("mongoose");
const { Schema } = mongoose;

const productVariantSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    stock_quantity: { type: Number, required: true },
    reserved_quantity: { type: Number, default: 0 },
    images: [{ type: String }],

    color: { type: String },

    // Cho gọng kính
    size: { type: String },
    bridge_fit: { type: String },

    // Cho kính áp tròng
    diameter: { type: Number },
    base_curve: { type: Number },
    power: { type: Number },

    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Virtual: số lượng thực sự có thể bán (available = stock - reserved)
productVariantSchema.virtual("available_quantity").get(function () {
  return Math.max(0, this.stock_quantity - (this.reserved_quantity || 0));
});

module.exports = mongoose.model("ProductVariant", productVariantSchema);
