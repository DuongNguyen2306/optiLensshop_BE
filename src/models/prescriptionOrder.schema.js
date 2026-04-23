const mongoose = require("mongoose");
const { Schema } = mongoose;

const prescriptionOrderSchema = new Schema({
  order_id: { type: Schema.Types.ObjectId, ref: "Order", required: true },
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
  expiration_date: { type: Date },
  eye_exam_date: { type: Date },
  prescription_image: { type: String },
  optometrist_name: { type: String },
  clinic_name: { type: String },
});

module.exports = mongoose.model("PrescriptionOrder", prescriptionOrderSchema);
