const mongoose = require("mongoose");
const { Schema } = mongoose;

/** Danh mục chi phí — dùng cho báo cáo thu chi */
const EXPENSE_CATEGORY = {
  MARKETING: "marketing",
  PAYROLL: "payroll",
  RENT: "rent",
  UTILITIES: "utilities",
  LOGISTICS: "logistics",
  INVENTORY_PURCHASE: "inventory_purchase",
  EQUIPMENT: "equipment",
  TAX_FEES: "tax_fees",
  PLATFORM_FEES: "platform_fees",
  OTHER: "other",
};

const financeExpenseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      enum: Object.values(EXPENSE_CATEGORY),
      required: true,
      index: true,
    },
    /** Ngày phát sinh chứng từ / thực chi (theo sổ) */
    occurred_at: { type: Date, required: true, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    reference_no: { type: String, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["active", "voided"],
      default: "active",
      index: true,
    },
    void_reason: { type: String, trim: true, maxlength: 500 },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

financeExpenseSchema.index({ occurred_at: 1, status: 1 });

const FinanceExpense = mongoose.model("FinanceExpense", financeExpenseSchema);

module.exports = FinanceExpense;
module.exports.EXPENSE_CATEGORY = EXPENSE_CATEGORY;
