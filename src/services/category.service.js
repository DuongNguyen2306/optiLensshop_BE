const Category = require("../models/category.schema");
const { createHttpError } = require("../utils/create-http-error");

async function listCategories() {
  return Category.find({ is_active: true });
}

async function createCategory(payload) {
  const { name, slug, parent_id } = payload;
  if (!name || !slug) throw createHttpError("Thiếu tên hoặc slug", 400);
  const exists = await Category.findOne({ slug });
  if (exists) throw createHttpError("Slug đã tồn tại", 409);
  const category = await Category.create({
    name,
    slug,
    parent_id: parent_id || null,
  });
  return { message: "Tạo category thành công", category };
}

async function updateCategory(id, payload) {
  const { name, slug, parent_id } = payload;
  const category = await Category.findById(id);
  if (!category) throw createHttpError("Không tìm thấy category", 404);
  if (slug && slug !== category.slug) {
    const exists = await Category.findOne({ slug });
    if (exists) throw createHttpError("Slug đã tồn tại", 409);
    category.slug = slug;
  }
  if (name) category.name = name;
  if (parent_id !== undefined) category.parent_id = parent_id;
  await category.save();
  return { message: "Cập nhật category thành công", category };
}

async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw createHttpError("Không tìm thấy category", 404);
  category.is_active = false;
  await category.save();
  return { message: "Đã xóa category" };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
