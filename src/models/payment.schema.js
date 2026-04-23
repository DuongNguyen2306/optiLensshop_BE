const mongoose = require("mongoose");
const { Schema } = mongoose;

const paymentSchema = new Schema({
  order_id: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ["cod", "momo", "vnpay"], required: true },
  status: {
    type: String,
    enum: [
      "pending",
      "pending-payment",
      "deposit-paid",
      "remaining-due",
      "paid",
      "failed",
      "refunded",
    ],
    default: "pending",
  },
  transaction_id: { type: String },
  paid_at: { type: Date },
});

module.exports = mongoose.model("Payment", paymentSchema);
