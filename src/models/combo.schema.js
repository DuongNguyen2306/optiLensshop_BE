const mongoose = require("mongoose");
const { Schema } = mongoose;

const comboSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    frame_variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    lens_variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    /** Giá một bộ (1 gọng + 1 tròng) khi mua combo */
    combo_price: { type: Number, required: true, min: 0 },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Combo", comboSchema);
