const categoryService = require("../services/category.service");

async function listCategories(req, res, next) {
  try {
    const data = await categoryService.listCategories();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const data = await categoryService.createCategory(req.body);
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const data = await categoryService.updateCategory(id, req.body);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const data = await categoryService.deleteCategory(id);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
