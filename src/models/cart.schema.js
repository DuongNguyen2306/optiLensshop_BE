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

const cartItemSchema = new Schema(
  {
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      default: null,
    },
    combo_id: {
      type: Schema.Types.ObjectId,
      ref: "Combo",
      default: null,
    },

    quantity: { type: Number, required: true, min: 1 },
    lens_params: { type: lensParamsSchema, default: null },

    price_snapshot: { type: Number },
    combo_price_snapshot: { type: Number },
  },
  {
    _id: true,
    validate: {
      validator: function () {
        const hasVariant = !!this.variant_id;
        const hasCombo = !!this.combo_id;
        return hasVariant !== hasCombo;
      },
      message: "Cart item phải có đúng một trong hai: variant_id hoặc combo_id",
    },
  },
);

const cartSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  items: [cartItemSchema],
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Cart", cartSchema);
