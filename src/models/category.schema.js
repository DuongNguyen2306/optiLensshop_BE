const mongoose = require("mongoose");
const { Schema } = mongoose;

const categorySchema = new Schema({
  name: { type: String, required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: "Category", default: null },
  slug: { type: String, required: true, unique: true },
  is_active: { type: Boolean, default: true },
});

module.exports = mongoose.model("Category", categorySchema);
