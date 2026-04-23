const mongoose = require("mongoose");
const { Schema } = mongoose;

const profileSchema = new Schema({
  full_name: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ["male", "female", "other"] },
  phone: { type: String, required: true },
  avatar: { type: String },
  addresses: {
    type: [String],
    default: [],
  },
});

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["customer", "sales", "operations", "manager", "admin"],
    default: "customer",
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "banned", "pending"],
    default: "active",
  },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date, default: null },
  profile: profileSchema,
  is_email_verified: { type: Boolean, default: false },
  email_verification_token: { type: String, default: null },
  email_verification_expires: { type: Date, default: null },
  reset_password_token: { type: String, default: null },
  reset_password_expires: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
