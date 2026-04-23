const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    type: {
      type: String,
      enum: ["frame", "lens", "accessory"],
      required: true,
      default: "frame",
    },
    material: { type: String }, // Chất liệu
    brand: {
      type: require("mongoose").Schema.Types.ObjectId,
      ref: "Brand",
      required: false, // Có thể bắt buộc nếu cần
    },
    model: {
      type: require("mongoose").Schema.Types.ObjectId,
      ref: "Model",
      required: false, // Có thể bắt buộc nếu cần
    },
    gender: {
      type: String,
      enum: ["male", "female", "unisex"],
      default: "unisex",
    },
    shape: { type: String }, // Hình dáng gọng kính
    images: [{ type: String }],
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Product", productSchema);
