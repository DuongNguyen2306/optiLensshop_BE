const Model = require("../models/model.schema");
const { createHttpError } = require("../utils/create-http-error");

async function listModels() {
  const models = await Model.find({ is_active: true });
  return {
    message: "Lấy danh sách model thành công",
    models,
  };
}

async function createModel(payload) {
  const { name, type, description } = payload;
  if (!name || !type) throw createHttpError("Thiếu tên hoặc loại model", 400);
  const exists = await Model.findOne({ name, type });
  if (exists) throw createHttpError("Model đã tồn tại", 409);
  const model = await Model.create({ name, type, description });
  return { message: "Tạo model thành công", model };
}

async function updateModel(id, payload) {
  const { name, type, description } = payload;
  const model = await Model.findById(id);
  if (!model) throw createHttpError("Không tìm thấy model", 404);
  if (name && name !== model.name) {
    const exists = await Model.findOne({ name, type: type || model.type });
    if (exists) throw createHttpError("Model đã tồn tại", 409);
    model.name = name;
  }
  if (type) model.type = type;
  if (description !== undefined) model.description = description;
  await model.save();
  return { message: "Cập nhật model thành công", model };
}

async function deleteModel(id) {
  const model = await Model.findById(id);
  if (!model) throw createHttpError("Không tìm thấy model", 404);
  model.is_active = false;
  await model.save();
  return { message: "Đã xóa model" };
}

module.exports = {
  listModels,
  createModel,
  updateModel,
  deleteModel,
};
