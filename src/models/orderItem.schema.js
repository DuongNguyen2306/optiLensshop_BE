const mongoose = require("mongoose");
const { Schema } = mongoose;

const lensParamsSchema = new Schema(
  {
    sph_right: { type: Number },
    sph_left: { type: Number },
    cyl_right: { type: Number },
    cyl_left: { type: Number },
    axis_right: { type: Number },
    axis_left: { type: Number },
    add_right: { type: Number },
    add_left: { type: Number },
    pd: { type: Number },
    pupillary_distance: { type: Number },
    note: { type: String },
  },
  { _id: false },
);

const orderItemSchema = new Schema({
  order_id: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  variant_id: {
    type: Schema.Types.ObjectId,
    ref: "ProductVariant",
    required: true,
  },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  lens_params: { type: lensParamsSchema, default: null },

  /** Dòng sinh ra từ combo */
  combo_id: { type: Schema.Types.ObjectId, ref: "Combo" },
  combo_group_id: { type: Schema.Types.ObjectId },

  /** Loại sản phẩm: frame / lens — dùng để xác định trừ stock timing */
  item_type: {
    type: String,
    enum: ["frame", "lens", null],
    default: null,
  },
});

module.exports = mongoose.model("OrderItem", orderItemSchema);
