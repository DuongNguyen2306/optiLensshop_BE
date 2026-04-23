const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ["frame", "lens"], required: true }, // Loại mẫu mã
    description: { type: String },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Model", modelSchema);
