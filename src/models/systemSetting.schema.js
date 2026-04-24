const mongoose = require("mongoose");
const { Schema } = mongoose;

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value_number: { type: Number, default: null },
    value_string: { type: String, default: null },
    description: { type: String, default: "" },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSetting", systemSettingSchema);
